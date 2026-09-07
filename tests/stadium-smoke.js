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
  for (const count of [8, 4, 6]) {
    const previous = HD.world.laneMarkings;
    let disposed = 0;
    previous.children.forEach((line) => {
      line.geometry.addEventListener("dispose", () => disposed++);
    });
    HD.CONFIG.raceHorseCount = count;
    HD.Stadium.refreshTrackLayout();
    assert.equal(previous.parent, null, "Old markings must leave the scene");
    assert.equal(disposed, previous.children.length, "Old lane geometry must be released");
    assert.equal(HD.world.laneMarkings.children.length, count + 1);
  }
  HD.Race.resetHorses();

  assert.equal(HD.state.horses.length, 6, "The race did not build a six-horse field");
  const horseNumber = HD.state.horses[0].userData.numberLabel;
  assert.ok(horseNumber.position.y > 6, "Horse numbers should float above the jockey");
  assert.equal(
    horseNumber.material.depthTest,
    false,
    "Horse numbers should remain visible through stadium geometry",
  );
  assert.equal(HD.world.players.length, 0, "Reserved seats must not spawn fake players");
  const remoteAvatar = HD.Models.playerCharacter(0x3366cc);
  HD.Models.setPlayerNameTag(remoteAvatar, "Maya");
  assert.equal(remoteAvatar.userData.nameTag.userData.label, "Maya");
  assert.equal(
    remoteAvatar.userData.nameTag.material.depthTest,
    false,
    "Player tags should remain visible through stadium geometry",
  );
  HD.Models.setPlayerNameTag(HD.world.localPlayer, "Do not show this");
  assert.equal(
    HD.world.localPlayer.userData.nameTag,
    undefined,
    "The local player should not see their own name tag",
  );
  assert.equal(new Set(HD.state.activeHorseIds).size, 6, "The race field contains duplicates");
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
  assert.equal(
    HD.world.crowdThrowers.length,
    3,
    "The crowd should contain exactly three featured throwers",
  );
  assert.equal(
    new Set(HD.world.crowdThrowers.map((thrower) => thrower.userData.throwerIndex)).size,
    3,
    "The featured crowd throwers need unique stagger slots",
  );
  assert.ok(
    HD.world.crowdThrowers.every((thrower) => thrower.userData.ambientThrower),
    "A featured crowd thrower is missing its race-only behavior marker",
  );
  assert.ok(
    HD.world.crowdThrowers.every((thrower) => thrower.children.length === 0),
    "Crowd throw origins should not replace lightweight spectators with player models",
  );
  assert.equal(
    HD.world.projectileBarriers.length,
    0,
    "The removed commentator booth must not leave invisible projectile barriers",
  );
  assert.ok(HD.world.barriers.length >= 8, "Shop and counter barriers are incomplete");
  assert.equal(HD.world.commentators.length, 0, "The commentary NPCs must be removed");
  assert.equal(HD.world.commentatorBox, undefined, "The booth walk zone must be removed");
  for (let step = 0; step < 16; step++) {
    assert.ok(
      upperFloorHitsAt((step + 0.5) / 16 * Math.PI * 2) > 0,
      "The upper concourse must be continuous with no commentator cutout",
    );
  }
  const seatBases = HD.world.scene.children
    .flatMap((child) => child.children || [])
    .find((object) =>
      object.isInstancedMesh &&
      object.geometry?.parameters?.width === 1.35 &&
      object.geometry?.parameters?.height === 0.22,
    );
  assert.ok(seatBases, "The stadium seat batch is missing");
  const seatMatrix = new THREE.Matrix4();
  const formerBoothColumn = Math.round((Math.PI * 2 - 0.18) / (Math.PI * 2) * 128) % 128;
  [4, 5, 6].forEach((row) => {
    seatBases.getMatrixAt(row * 128 + formerBoothColumn, seatMatrix);
    assert.ok(
      Math.abs(seatMatrix.determinant()) > 0.01,
      "The commentator seat cutout must be restored at every affected row",
    );
  });
  assert.ok(
    HD.CONFIG.stairs.startZ < 50.5,
    "The left/right stair entrances must overlap the lower walking ring",
  );
  assert.equal(
    HD.world.staircases?.length,
    4,
    "The stadium should have exactly four aligned public staircases",
  );
  assert.ok(
    HD.world.staircases.every((staircase) => {
      const stair = staircase.userData.staircase;
      return stair.visualTopY < stair.concourseY &&
        stair.concourseY - stair.visualTopY <= 0.08;
    }),
    "A public staircase is coplanar with or too far below the upper concourse",
  );
  assert.ok(
    HD.world.scene.children.some((object) => {
      return object.isInstancedMesh &&
        object.userData.concourseGlass &&
        object.userData.panelCount > 60;
    }),
    "The upper-concourse glass fence is incomplete",
  );
  assert.ok(
    HD.world.scene.children.some((object) => object.isInstancedMesh && object.count === 120),
    "The instanced infield grass detail is missing",
  );

  console.log("Stadium geometry and rotating six-horse field checks passed.");

  function upperFloorHitsAt(angle, radiusX = 106, radiusZ = 72) {
    HD.world.scene.updateMatrixWorld(true);
    const point = HD.Stadium.oval(radiusX, radiusZ, angle);
    const raycaster = new THREE.Raycaster(
      new THREE.Vector3(point.x, 18, point.z),
      new THREE.Vector3(0, -1, 0),
      0,
      10,
    );
    const geometry = [];
    HD.world.scene.traverse((object) => {
      if (object.isMesh && !object.isSprite) geometry.push(object);
    });
    const hits = raycaster
      .intersectObjects(geometry, false)
      .filter((hit) =>
        Math.abs(hit.point.y - 13.5) < 0.08 &&
        hit.object.geometry?.type === "ExtrudeGeometry" &&
        hit.object.material?.color?.getHex() === 0xb7a47f,
      );
    return hits.length;
  }
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
