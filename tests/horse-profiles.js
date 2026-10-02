"use strict";

const assert = require("assert");
const path = require("path");
const { pathToFileURL } = require("url");

async function run() {
  const values = new Map();
  const storage = {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };

  let idleWrite;
  let pagehide;
  global.window = global;
  global.localStorage = storage;
  global.requestIdleCallback = (write) => { idleWrite = write; return 1; };
  global.cancelIdleCallback = () => {};
  global.addEventListener = (type, handler) => { if (type === "pagehide") pagehide = handler; };
  global.THREE = await import(
    pathToFileURL(path.resolve(__dirname, "../vendor/three.module.js")).href
  );

  values.set("hotdog-downs-horse-profiles-v1", JSON.stringify({
    version: 1,
    horses: {
      "midnight-sovereign": {
        discovered: false,
        history: { starts: 12, wins: 20, podiums: 4, bestTime: 51.25 },
      },
    },
  }));

  require("../src/config.js");

  const first = HD.CONFIG.horses.find((horse) => {
    return horse.id === "midnight-sovereign";
  });
  assert.equal(first.discovered, false);
  assert.deepEqual(first.history, {
    starts: 12,
    wins: 12,
    podiums: 12,
    bestTime: 51.25,
  });

  first.discovered = true;
  first.history.starts = 13;
  first.history.wins = 7;
  first.history.podiums = 9;
  first.history.bestTime = 49.75;
  assert.equal(HD.HorseProfiles.save(), true);

  const saved = JSON.parse(values.get(HD.HorseProfiles.STORAGE_KEY));
  assert.equal(saved.version, 1);
  assert.deepEqual(saved.horses[first.id], {
    discovered: true,
    history: {
      starts: 13,
      wins: 7,
      podiums: 9,
      bestTime: 49.75,
    },
  });

  first.history.starts = 14;
  HD.HorseProfiles.scheduleSave();
  assert.equal(JSON.parse(values.get(HD.HorseProfiles.STORAGE_KEY)).horses[first.id].history.starts, 13,
    "Scheduled race-start save must not write synchronously");
  idleWrite();
  assert.equal(JSON.parse(values.get(HD.HorseProfiles.STORAGE_KEY)).horses[first.id].history.starts, 14);
  first.history.starts = 15;
  HD.HorseProfiles.scheduleSave();
  pagehide();
  assert.equal(JSON.parse(values.get(HD.HorseProfiles.STORAGE_KEY)).horses[first.id].history.starts, 15,
    "Page close must flush pending horse history");

  values.set(HD.HorseProfiles.STORAGE_KEY, "{damaged");
  assert.doesNotThrow(() => HD.HorseProfiles.load());

  console.log("Horse discovery and race-history persistence checks passed.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
