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
  HD.UI = createUiMock();
  HD.Controls = { setMode() {} };
  HD.Network = {
    isConnected: () => false,
    isHost: () => true,
  };
  HD.AI = {
    prepareRace() {},
    settleRace() {},
  };
  require("../src/race.js");

  HD.Race.resetHorses();
  const openingOdds = HD.state.horses.map((horse) => horse.userData.data.odds);
  const configuredOdds = HD.state.horses.map((horse) => {
    const id = horse.userData.data.id;
    return HD.CONFIG.horses.find((entry) => entry.id === id).odds;
  });
  assert.deepEqual(openingOdds, configuredOdds, "Opening prices must match each horse's fixed odds");

  const boostedHorse = HD.state.horses[0];
  const boostedHorseId = boostedHorse.userData.data.id;
  const oatsPosition = boostedHorse.position.clone().add(new THREE.Vector3(0, 2.2, 0));
  HD.Race.launch(
    "performanceOats",
    oatsPosition,
    new THREE.Vector3(),
    { consume: false },
  );
  HD.Race.updateProjectiles(0.016);
  assert.equal(
    boostedHorse.userData.data.maxSpeedBonus,
    0.01,
    "Champion Oats did not add one percent maximum speed",
  );
  HD.Race.resetHorses();
  const persistentHorse = HD.state.horses.find((horse) => {
    return horse.userData.data.id === boostedHorseId;
  });
  assert.equal(
    persistentHorse.userData.data.maxSpeedBonus,
    0.01,
    "Champion Oats did not persist between races",
  );

  HD.Race.launch(
    "hurdle",
    new THREE.Vector3(0, 0.4, 0),
    new THREE.Vector3(),
    { consume: false },
  );
  HD.Race.updateProjectiles(0.016);
  const hurdle = HD.state.projectiles.at(-1);
  const landedRotation = hurdle.mesh.rotation.clone();
  HD.Race.updateProjectiles(0.25);
  assert.ok(hurdle.grounded, "The hurdle did not lock to a track lane");
  assert.ok(
    Math.abs(hurdle.mesh.rotation.x - landedRotation.x) < 0.0001 &&
      Math.abs(hurdle.mesh.rotation.y - landedRotation.y) < 0.0001 &&
      Math.abs(hurdle.mesh.rotation.z - landedRotation.z) < 0.0001,
    "The placed hurdle continued rotating",
  );

  HD.Race.begin();
  let frames = 0;
  while (HD.Race.liveBettingOpen() && frames < 1_500) {
    HD.state.elapsed += 0.04;
    HD.Race.update(0.04);
    frames++;
  }
  assert.ok(frames < 1_500, "The first-lap live betting window never closed");
  assert.equal(HD.Race.liveBettingOpen(), false, "Live betting remained open after lap one");
  assert.ok(
    HD.state.horses.some((horse, index) => {
      const data = horse.userData.data;
      return Math.abs(data.lane - index) > 0.05 || data.targetLane !== index;
    }),
    "No horse made a tactical lane change",
  );

  const closingOdds = HD.state.horses.map((horse) => horse.userData.data.odds);
  for (let frame = 0; frame < 75; frame++) {
    HD.state.elapsed += 0.04;
    HD.Race.update(0.04);
  }
  assert.deepEqual(
    HD.state.horses.map((horse) => horse.userData.data.odds),
    closingOdds,
    "Odds changed after the lap-one live book closed",
  );

  console.log("Fixed opening odds, lap-one live betting, and lane-choice checks passed.");
}

function createUiMock() {
  return new Proxy(
    {},
    {
      get() {
        return () => {};
      },
    },
  );
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
