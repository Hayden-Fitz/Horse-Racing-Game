import assert from "node:assert/strict";
import * as THREE from "../vendor/three.module.js";

globalThis.window = globalThis;
globalThis.THREE = THREE;
globalThis.document = {
  createElement() {
    return { getContext: () => new Proxy({}, { get: () => () => {} }) };
  },
};
await import("../src/config.js");
await import("../src/reference-models.js");
await import("../src/models.js");
assert.equal(Object.keys(HD.ReferenceModels.sizes).length, 17);

for (const [id, dimension] of Object.entries(HD.ReferenceModels.sizes)) {
  const model = HD.Models.throwable(id);
  assert.equal(model.userData.referenceModel, id);
  assert.equal(model.userData.importedModel, undefined);
  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  assert.ok(Math.abs(Math.max(size.x, size.y, size.z) - dimension) < 0.00001, `${id}: incorrect scale`);
  assert.ok(bounds.getCenter(new THREE.Vector3()).length() < 0.00001, `${id}: incorrect center`);
  let drawCalls = 0;
  model.traverse((object) => {
    if (!object.isMesh) return;
    drawCalls++;
    for (const value of object.geometry.attributes.position.array) assert.ok(Number.isFinite(value));
  });
  assert.ok(drawCalls <= 9, `${id} has too many separate materials: ${drawCalls}`);
  const other = HD.Models.throwable(id);
  model.scale.setScalar(100);
  assert.equal(other.scale.x, 1, "Prop instances must not share transforms");
}

for (const id of ["horseshoe", "pillow"]) {
  let blue = false;
  HD.ReferenceModels.create(id).traverse((mesh) => {
    if (mesh.isMesh && mesh.material.color.b > mesh.material.color.r * 2) blue = true;
  });
  assert.ok(blue, `${id} should use the reference blue`);
}

const player = HD.Models.playerCharacter(0x123cdb);
assert.equal(player.userData.torso.geometry.type, "CylinderGeometry");
assert.equal(player.userData.hatParts.length, 0);
assert.equal(player.userData.arms.length, 2);
HD.Models.setPlayerStanding(player, true);
player.userData.moving = true;
HD.Models.animateCharacter(player, 1, true);
HD.Models.equipPlayer(player, "throw", "hotdog");
assert.equal(player.userData.props.get("item:hotdog").userData.referenceModel, "hotdog");

HD.world.scene = new THREE.Scene();
HD.UI = new Proxy({}, { get: () => () => {} });
HD.Network = { isConnected: () => false };
await import("../src/race.js");
const active = Object.keys(HD.CONFIG.items).filter(id => HD.ReferenceModels.sizes[id]);
for (const id of active) {
  HD.Race.launch(id, new THREE.Vector3(0, 8, 60), new THREE.Vector3(1, 2, 0), { consume: false, visualOnly: true });
}
assert.equal(HD.state.projectiles.length, active.length);
for (let frame = 0; frame < 300; frame++) HD.Race.updateProjectiles(0.025);
for (const projectile of HD.state.projectiles) {
  assert.ok(projectile.grounded, `${projectile.type} did not settle`);
  assert.ok(Math.abs(new THREE.Box3().setFromObject(projectile.mesh).min.y - 0.05) < 0.0001);
}
console.log("Screenshot recreations: 17 props, blue palette, batching, rig, remote prop attachment and active-item ground contact passed.");
