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
    createElement(tagName) {
      if (tagName !== "canvas") return {};
      return {
        width: 0,
        height: 0,
        getContext: createCanvasContext,
      };
    },
  };

  require("../src/config.js");
  HD.Settings = {
    modelDetail: () => "low",
    avatarOptions: () => ({
      skin: 0xf1c7a5,
      hat: "cap",
      expression: "smile",
    }),
  };
  require("../src/models.js");
  require("../src/stadium.js");
  require("../src/race.js");

  HD.world.scene = new THREE.Scene();
  HD.world.camera = new THREE.PerspectiveCamera();
  HD.Stadium.build(HD.world.scene);
  HD.Race.resetHorses();

  assert.equal(HD.state.horses.length, 8, "The race did not build an eight-horse field");
  assert.equal(new Set(HD.state.activeHorseIds).size, 8, "The race field contains duplicates");
  assert.equal(HD.state.horseFieldRacesRemaining, 2, "The new field should last two races");
  const firstField = [...HD.state.activeHorseIds];
  HD.state.horseFieldRacesRemaining = 1;
  HD.Race.resetHorses();
  assert.deepEqual(
    HD.state.activeHorseIds,
    firstField,
    "The selected horse field changed before completing its second race",
  );
  assert.equal(HD.world.shopPositions.length, 4, "The upper concourse shops did not build");
  assert.ok(HD.world.barriers.length >= 8, "Shop and counter barriers are incomplete");

  console.log("Stadium geometry and rotating eight-horse field checks passed.");
}

function createCanvasContext() {
  const gradient = { addColorStop() {} };
  return new Proxy(
    {},
    {
      get(target, property) {
        if (property in target) return target[property];
        if (property === "createLinearGradient") return () => gradient;
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
