import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import * as THREE from "../vendor/three.module.js";
import { Assets } from "../src/assets.mjs";

globalThis.window = globalThis;
globalThis.THREE = THREE;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
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

const report = JSON.parse(await fs.readFile(new URL("../assets/Models/optimized/report.json", import.meta.url)));
assert.equal(report.length, 18);
for (const [id, entry] of Object.entries(Assets.catalog)) {
  const first = Assets.create(id);
  const second = Assets.create(id);
  assert.ok(first && second && first !== second, "Each instance needs independent transforms");
  const bounds = new THREE.Box3().setFromObject(first);
  const size = bounds.getSize(new THREE.Vector3());
  assert.ok(Math.abs(Math.max(size.x, size.y, size.z) - entry.size) < 0.00001, `${id} size mismatch`);
  assert.ok(bounds.getCenter(new THREE.Vector3()).length() < 0.00001, `${id} pivot not centered`);
  let meshes = 0;
  first.traverse((object) => {
    if (!object.isMesh) return;
    meshes++;
    assert.ok(object.geometry.attributes.color, `${id} lost Tinkercad vertex colors`);
    assert.ok(object.geometry.index.count / 3 <= 5000, `${id} exceeds geometry budget`);
    for (const value of object.geometry.attributes.position.array) assert.ok(Number.isFinite(value));
  });
  assert.ok(meshes > 0);
  first.position.x = 123;
  assert.equal(second.position.x, 0);
}

assert.ok(HD.Models.throwable("pretzel").children.length, "Unmodeled items need a procedural fallback");
assert.equal(Assets.create("missing"), null);
assert.ok(report.reduce((total, entry) => total + entry.bytes, 0) < 1024 * 1024);
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
console.log("18 optimized models: colors, pivots, sizes, geometry budgets, independent instances and item integration passed.");
