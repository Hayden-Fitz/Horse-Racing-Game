import * as THREE from "../vendor/three.module.js";
import { GLTFLoader } from "../vendor/loaders/GLTFLoader.js";
import { MODEL_CATALOG } from "../assets/Models/catalog.mjs";

const templates = new Map();
const pending = new Map();
const loader = new GLTFLoader();
const failures = new Map();

async function load(id) {
  if (!MODEL_CATALOG[id]) return null;
  if (templates.has(id)) return templates.get(id);
  if (pending.has(id)) return pending.get(id);

  const promise = (async () => {
    const entry = MODEL_CATALOG[id];
    const url = new URL(`../assets/Models/corrected/${id}.glb`, import.meta.url);
    const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error(`Model ${id}: HTTP ${response.status}`);
    const gltf = await loader.parseAsync(await response.arrayBuffer(), url.href);
    const pivot = new THREE.Group();
    const content = gltf.scene;
    if (id === "hotdog") joinHotdogBuns(content);
    if (id === "hurdle" || id === "carrot" || id === "goldenCarrot") {
      content.rotation.y += Math.PI / 2;
    }
    const bounds = new THREE.Box3().setFromObject(content);
    const size = bounds.getSize(new THREE.Vector3());
    const longest = Math.max(size.x, size.y, size.z);
    if (!Number.isFinite(longest) || longest <= 0) throw new Error(`Empty model: ${id}`);

    // Keep normalization inside the root so existing hand/projectile scaling
    // never overwrites the imported model's conversion from millimeters.
    content.position.sub(bounds.getCenter(new THREE.Vector3()));
    pivot.add(content);
    pivot.scale.setScalar(entry.size / longest);
    const template = new THREE.Group();
    template.add(pivot);
    template.userData.importedModel = id;
    template.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = false;
      object.receiveShadow = true;
    });
    templates.set(id, template);
    failures.delete(id);
    return template;
  })().catch((error) => {
    failures.set(id, error.message);
    console.warn(`Using procedural fallback for ${id}: ${error.message}`);
    return null;
  }).finally(() => pending.delete(id));

  pending.set(id, promise);
  return promise;
}

function joinHotdogBuns(content) {
  // Fill the narrow underside seam while retaining the original model surface.
  let original;
  content.traverse((object) => { if (object.isMesh && !original) original = object; });
  if (!original) return;
  const geometry = new THREE.CapsuleGeometry(0.55, 98, 6, 18);
  geometry.rotateZ(Math.PI / 2);
  const count = geometry.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let index = 0; index < count; index++) {
    colors[index * 3] = 0.973;
    colors[index * 3 + 1] = 0.479;
    colors[index * 3 + 2] = 0.202;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const join = new THREE.Mesh(geometry, original.material);
  join.name = "BunBottomJoin";
  join.position.set(15, 44.2, 3.1);
  content.add(join);
}

export const Assets = {
  catalog: MODEL_CATALOG,
  failures,
  load,

  async preload(ids) {
    // Small batches prevent large decode bursts on low-memory computers.
    for (let offset = 0; offset < ids.length; offset += 3) {
      await Promise.all(ids.slice(offset, offset + 3).map(load));
    }
  },

  create(id) {
    // Independent transforms, shared immutable geometry/materials per asset.
    return templates.get(id)?.clone(true) || null;
  },
};
