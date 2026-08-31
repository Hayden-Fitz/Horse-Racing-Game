"use strict";

const assert = require("assert");
const path = require("path");
const { pathToFileURL } = require("url");

async function run() {
  global.window = global;
  global.THREE = await import(
    pathToFileURL(path.resolve(__dirname, "../vendor/three.module.js")).href
  );
  global.document = {
    createElement() {
      return {
        width: 0,
        height: 0,
        getContext: createCanvasContext,
      };
    },
  };
  require("../src/config.js");
  require("../src/models.js");

  HD.world.scene = new THREE.Scene();
  HD.world.players = [];
  HD.UI = new Proxy({}, { get: () => () => {} });
  HD.Controls = { setMode() {} };
  HD.Network = {
    isConnected: () => false,
    isHost: () => true,
  };
  HD.Stadium = {
    playerSeatPlacement(index) {
      return {
        avatar: new THREE.Vector3(80 + index, 5, 45),
      };
    },
  };
  require("../src/race.js");
  require("../src/ai.js");

  HD.Race.resetHorses();
  HD.AI.init();
  HD.state.phase = "betting";
  HD.state.timer = 0;
  HD.AI.update();

  const afterOpeningBets = HD.AI.rankingPlayers();
  assert.equal(afterOpeningBets.length, 7, "Single-player should create seven AI opponents");
  assert.ok(
    afterOpeningBets.every((player) => player.money < 100),
    "Every AI opponent should place an opening wager",
  );

  HD.state.phase = "racing";
  HD.state.raceTime = 30;
  HD.AI.update();
  assert.equal(
    HD.state.projectiles.length,
    7,
    "Every AI opponent should make one intentional race throw",
  );
  assert.ok(
    HD.state.projectiles.some((projectile) => projectile.type === "carrot"),
    "At least one AI should support its selected horse",
  );
  assert.ok(
    HD.state.projectiles.some((projectile) => projectile.type !== "carrot"),
    "At least one AI should interfere with a competing horse",
  );

  console.log("Single-player AI betting and intentional throwing checks passed.");
}

function createCanvasContext() {
  return new Proxy(
    {},
    {
      get(target, property) {
        if (property in target) return target[property];
        if (property === "measureText") return () => ({ width: 100 });
        return () => {};
      },
      set(target, property, value) {
        target[property] = value;
        return true;
      },
    },
  );
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
