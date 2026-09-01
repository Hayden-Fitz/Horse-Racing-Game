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

  assert.equal(HD.state.horses.length, 6, "The race did not build a six-horse field");
  const horseNumber = HD.state.horses[0].userData.numberLabel;
  assert.ok(horseNumber.position.y > 6, "Horse numbers should float above the jockey");
  assert.equal(
    horseNumber.material.depthTest,
    false,
    "Horse numbers should remain visible through stadium geometry",
  );
  HD.Models.setPlayerNameTag(HD.world.players[0], "Maya");
  assert.equal(HD.world.players[0].userData.nameTag.userData.label, "Maya");
  assert.equal(
    HD.world.players[0].userData.nameTag.material.depthTest,
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
  assert.ok(HD.world.barriers.length >= 8, "Shop and counter barriers are incomplete");
  assert.equal(
    HD.world.commentators.length,
    2,
    "The broadcast booth should contain a two-person commentary team",
  );
  assert.ok(
    HD.world.commentatorBox?.polygon?.length === 4,
    "The broadcast booth walkable footprint is missing",
  );
  assert.ok(
    HD.world.commentatorBox?.desk,
    "The broadcast desk collision metadata is missing",
  );
  assert.ok(
    HD.world.commentatorBox.angle > Math.PI,
    "The broadcast booth should sit on the intended side of its staircase",
  );
  assert.ok(
    HD.world.commentatorBox.roofY > HD.world.commentatorBox.rearRoofY,
    "The broadcast booth roof should slope downward toward the concourse",
  );
  assert.ok(
    HD.world.commentatorBox.roofY - HD.world.commentatorBox.floorY > 6,
    "The track-side broadcast ceiling is too low for a standing player",
  );
  assert.ok(
    HD.world.commentatorBox.rearRoofY - HD.world.commentatorBox.floorY >
      HD.CONFIG.eyeHeight + 0.25,
    "The low end of the broadcast roof clips through the player camera",
  );
  assert.ok(
    HD.world.commentatorBox.entrance?.topY >
      HD.world.commentatorBox.entrance?.bottomY,
    "The broadcast booth needs a descending entrance from the upper concourse",
  );
  assert.ok(
    HD.world.commentatorBox.entrance?.width >= 5,
    "The broadcast booth staircase is too narrow for a player character",
  );
  assert.ok(
    HD.world.commentatorBox.supportBottomY < HD.world.commentatorBox.floorY,
    "The broadcast booth needs a finished support beneath its floor",
  );
  const targetAngle = HD.world.commentatorBox.angle;
  const mirroredAngle = Math.PI * 2 - targetAngle;
  const targetFloorHits = upperFloorHitsAt(targetAngle);
  const mirroredFloorHits = upperFloorHitsAt(mirroredAngle);
  assert.equal(
    targetFloorHits,
    0,
    "The upper-floor cutout is not on the same side as the broadcast booth",
  );
  assert.ok(
    mirroredFloorHits > 0,
    "The upper floor was also removed from the booth's opposite side",
  );
  assert.ok(
    upperFloorHitsAt(targetAngle - 0.082) === 0 &&
      upperFloorHitsAt(targetAngle + 0.082) === 0,
    "The upper floor is clipping through the broadcast booth",
  );
  assert.ok(
    upperFloorHitsAt(targetAngle - 0.082, 116, 80) > 0 &&
      upperFloorHitsAt(targetAngle + 0.082, 116, 80) > 0,
    "The outer concourse beside the broadcast booth was not restored",
  );
  const seatBases = HD.world.scene.children
    .flatMap((child) => child.children || [])
    .find((object) =>
      object.isInstancedMesh &&
      object.geometry?.parameters?.width === 1.35 &&
      object.geometry?.parameters?.height === 0.22,
    );
  assert.ok(seatBases, "The stadium seat batch is missing");
  const boothColumn = Math.round(
    targetAngle / (Math.PI * 2) * 128,
  ) % 128;
  const restoredSeatMatrix = new THREE.Matrix4();
  const removedSeatMatrix = new THREE.Matrix4();
  seatBases.getMatrixAt(3 * 128 + boothColumn, restoredSeatMatrix);
  seatBases.getMatrixAt(4 * 128 + boothColumn, removedSeatMatrix);
  assert.ok(
    Math.abs(restoredSeatMatrix.determinant()) > 0.01,
    "The complete seating row in front of the broadcast booth was not restored",
  );
  assert.ok(
    Math.abs(removedSeatMatrix.determinant()) < 0.001,
    "Seats are clipping through the broadcast booth interior",
  );
  assert.equal(
    HD.world.commentators.every((commentator) => !commentator.userData.standing),
    true,
    "Commentators should be seated at the broadcast desk",
  );
  const commentatorYaw = -HD.world.commentatorBox.angle + Math.PI / 2;
  assert.ok(
    HD.world.commentators.every((commentator) => {
      const difference = Math.atan2(
        Math.sin(commentator.rotation.y - commentatorYaw),
        Math.cos(commentator.rotation.y - commentatorYaw),
      );
      return Math.abs(difference) < 0.001;
    }),
    "The commentators should face the racetrack",
  );
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
    HD.world.commentatorBox.entrance.topY < 13.5 &&
      13.5 - HD.world.commentatorBox.entrance.topY <= 0.08,
    "The commentator staircase is coplanar with or misaligned below the upper floor",
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
