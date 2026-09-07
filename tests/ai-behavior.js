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
  assert.equal(afterOpeningBets.length, 0, "Practice Mode must not create AI opponents");
  assert.equal(HD.state.sabotagePlans.length, 0, "Removed AI must not sabotage horses");

  HD.state.phase = "racing";
  HD.state.raceTime = 30;
  HD.AI.update();
  assert.equal(
    HD.state.projectiles.length,
    0,
    "Removed player AI must not generate throws",
  );
  assert.ok(
    HD.AI.transferTargets().length === 0,
    "Practice must not offer fake transfer recipients",
  );
  assert.ok(
    HD.AI.receiveTransfer("ai-0", 100, "hotdog") === false,
    "Transfers to removed players must fail",
  );

  console.log("Practice Mode has no simulated player opponents or transfers.");
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
