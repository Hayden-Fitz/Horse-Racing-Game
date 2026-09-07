import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import * as THREE from "../vendor/three.module.js";
import { Assets } from "../src/assets.mjs";
import { geometryFingerprint } from "../scripts/model-geometry.mjs";

globalThis.window = globalThis;
globalThis.THREE = THREE;
globalThis.self = globalThis;
// Node has no image decoder; browser review checks the actual embedded PNG.
globalThis.createImageBitmap = async () => ({ width: 256, height: 512, close() {} });
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  if (String(url).startsWith("data:")) return originalFetch(url);
  try {
    return new Response(await fs.readFile(fileURLToPath(url)));
  } catch {
    return new Response("Not found", { status: 404 });
  }
};
await import("../src/config.js");
HD.Assets = Assets;
await import("../src/models.js");
await Assets.preload(Object.keys(Assets.catalog));
assert.equal(Assets.failures.size, 0, "Every exported model should load");

const report = JSON.parse(await fs.readFile(new URL("../assets/Models/corrected/report.json", import.meta.url)));
assert.equal(report.length, 18);
for (const [id, entry] of Object.entries(Assets.catalog)) {
  const first = Assets.create(id);
  const second = Assets.create(id);
  assert.ok(first && second && first !== second, "Each instance needs independent transforms");
  assert.equal(geometryFingerprint(first), report.find((model) => model.id === id).originalGeometry,
    `${id}: original triangles or normals changed`);
  if (!entry.requiresRig) assert.equal(HD.Models.throwable(id).userData.importedModel, id);
  const bounds = new THREE.Box3().setFromObject(first);
  const size = bounds.getSize(new THREE.Vector3());
  assert.ok(Math.abs(Math.max(size.x, size.y, size.z) - entry.size) < 0.00001, `${id} size mismatch`);
  assert.ok(bounds.getCenter(new THREE.Vector3()).length() < 0.00001, `${id} pivot not centered`);
  let meshes = 0;
  first.traverse((object) => {
    if (!object.isMesh) return;
    meshes++;
    assert.ok(object.geometry.attributes.color, `${id} lost Tinkercad vertex colors`);
    for (const value of object.geometry.attributes.position.array) assert.ok(Number.isFinite(value));
  });
  assert.ok(meshes > 0);
  first.position.x = 123;
  assert.equal(second.position.x, 0);
}

assert.ok(HD.Models.throwable("pretzel").children.length, "Unmodeled items need a procedural fallback");
assert.equal(Assets.create("missing"), null);
const bottleMaterials = [];
Assets.create("waterBottle").traverse((mesh) => {
  if (mesh.isMesh) bottleMaterials.push(...(Array.isArray(mesh.material) ? mesh.material : [mesh.material]));
});
assert.ok(bottleMaterials.some((material) => material.transparent && material.opacity < 0.4 && !material.depthWrite));
assert.ok(bottleMaterials.some((material) => !material.transparent && material.opacity === 1));
let printedSoda = false;
Assets.create("soda").traverse((mesh) => {
  if (mesh.isMesh && mesh.material.map) printedSoda = true;
});
assert.ok(printedSoda, "The original soda wrapper must have its red/white label");
HD.world.scene = new THREE.Scene();
HD.UI = new Proxy({}, { get: () => () => {} });
HD.Network = { isConnected: () => false };
await import("../src/race.js");
for (const id of ["hotdog", "soda", "chair", "pillow", "hurdle"]) {
  HD.Race.launch(id, new THREE.Vector3(0, 8, 60), new THREE.Vector3(1, 2, 0), { consume: false, visualOnly: true });
}
for (let step = 0; step < 300; step++) HD.Race.updateProjectiles(0.025);
for (const projectile of HD.state.projectiles) {
  assert.ok(projectile.grounded, `${projectile.type} should settle`);
  const bottom = new THREE.Box3().setFromObject(projectile.mesh).min.y;
  assert.ok(Math.abs(bottom - 0.05) < 0.0001, `${projectile.type} clips into or floats above the dirt`);
}
globalThis.fetch = originalFetch;
console.log("18 restored GLBs: original geometry fingerprints, materials, transparency, pivots, independent instances and item ground contact passed.");
