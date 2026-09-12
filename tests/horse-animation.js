"use strict";

const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");
const path = require("node:path");

async function run() {
  global.window = global;
  global.THREE = await import(pathToFileURL(path.resolve(__dirname, "../vendor/three.module.js")));
  global.document = {
    createElement: () => ({
      width: 0, height: 0,
      getContext: () => new Proxy({}, { get: (target, key) => target[key] ?? (() => {}) }),
    }),
  };
  require("../src/config.js");
  require("../src/models.js");
  const make = () => {
    const horse = HD.Models.horse(HD.CONFIG.horses[1], 0);
    horse.position.y = 0.75;
    return horse;
  };
  const horse = make();
  const rig = horse.userData.rig;
  for (const leg of rig.legs) {
    const limb = leg.userData;
    assert.equal(limb.upper.parent, leg);
    assert.equal(limb.lower.parent, limb.upper);
    assert.equal(limb.fetlock.parent, limb.lower);
    assert.equal(limb.hoof.parent, limb.fetlock);
    assert.ok(limb.proximalLength + limb.upperLength + limb.lowerLength < 2.65,
      'Horse limbs must retain the shortened proportions');
  }
  assert.equal(rig.head.parent, rig.neck);
  assert.equal(rig.jaw.parent, rig.head);
  let time = 0;
  let minHoofY = Infinity;
  let maxHoofY = -Infinity;
  const kneeAngles = new Set();
  for (const speed of [0, 0.15, 0.5, 1, 1.5, 0]) {
    horse.userData.data.motionSpeed = horse.userData.data.baseSpeed * speed;
    for (let frame = 0; frame < 180; frame++) {
      time += 1 / 60;
      HD.Models.animateHorse(horse, time);
      horse.updateMatrixWorld(true);
      horse.traverse(node => {
        assert.ok(node.matrixWorld.elements.every(Number.isFinite), node.name + " has an invalid pose");
      });
      for (const leg of rig.legs) {
        const point = leg.userData.hoof.getWorldPosition(new THREE.Vector3());
        minHoofY = Math.min(minHoofY, point.y);
        maxHoofY = Math.max(maxHoofY, point.y);
        assert.ok(point.y > 0.10, "Hoof origin penetrated the track: " + point.y);
      }
      kneeAngles.add(rig.legs[2].userData.lower.rotation.z.toFixed(2));
    }
  }
  assert.ok(kneeAngles.size > 15, "Knees should articulate through the recovery stroke");
  assert.ok(maxHoofY - minHoofY > 0.6, "Gallop should visibly pick up the feet");
  const phase = rig.phase;
  for (let i = 0; i < 60; i++) HD.Models.animateHorse(horse, time += 1 / 60, false);
  assert.ok(Math.abs(rig.phase - phase) < 0.001, "Stopped horse must stop cycling its legs");

  // Integrated phase must not jump when speed changes, time rewinds or state is malformed.
  const before = rig.phase;
  horse.userData.data.motionSpeed = NaN;
  horse.userData.data.baseSpeed = Infinity;
  HD.Models.animateHorse(horse, NaN);
  HD.Models.animateHorse(horse, -100);
  assert.equal(rig.phase, before);
  assert.ok(Number.isFinite(rig.head.rotation.z));

  function phaseAt(rate, speed) {
    const runner = make();
    runner.userData.data.motionSpeed = runner.userData.data.baseSpeed * speed;
    for (let frame = 1; frame <= rate * 3; frame++) HD.Models.animateHorse(runner, frame / rate);
    return runner.userData.rig.phase;
  }
  assert.ok(Math.abs(phaseAt(30, 1) - phaseAt(120, 1)) < 0.25,
    "Gallop timing must stay consistent across rendering frame rates");
  assert.notEqual(phaseAt(60, 0.2), phaseAt(60, 1), "Slow horses need slower strides");

  horse.userData.data.ragdoll = 1;
  HD.Models.animateHorse(horse, time + 0.02);
  horse.userData.data.ragdoll = 0;
  HD.Models.animateHorse(horse, time + 0.04);
  assert.equal(rig.body.rotation.x, 0, "Recovering from a hit must clear the impact roll");
  let meshCount = 0;
  horse.traverse(node => { if (node.isMesh) meshCount++; });
  assert.ok(meshCount <= 65, "Static details must stay batched");
  console.log("Horse joints, ground clearance, gait rates, stop/recovery, invalid state and mesh budget passed.");
}

run().catch(error => { console.error(error); process.exit(1); });
