import * as THREE from "../vendor/three.module.js";
import { MODEL_CATALOG } from "../assets/Models/catalog.mjs";
import { Assets } from "./assets.mjs";

window.THREE = THREE;
await import("./config.js");
window.HD.Assets = Assets;
await Assets.preload(Object.keys(MODEL_CATALOG));
await import("./reference-models.js");
await import("./models.js");

const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector("#preview"), alpha: true, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setClearColor(0x000000, 0);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
const views = [];
const entries = [
  ...Object.entries(MODEL_CATALOG),
  ["playerCustomized", {
    source: "Customized Player",
    appearance: {
      skin: 0xc88962,
      hat: "cap",
      expression: "smile",
      outfit: "varsity",
      trousers: 0x24344d,
      shoes: "high-tops",
      accessory: "glasses",
    },
  }],
];

for (const [id, entry] of entries) {
  const card = document.createElement("section");
  card.className = "model-card";
  const viewport = document.createElement("div");
  viewport.className = "model-view";
  const caption = document.createElement("div");
  caption.className = "model-caption";
  const heading = document.createElement("h2");
  heading.textContent = entry.source.replace(/\.glb$|\. TODO_.*$/g, "");
  const detail = document.createElement("p");
  detail.textContent = entry.appearance
    ? "Original base model · layered customization"
    : "Original GLB geometry · corrected materials";
  caption.append(heading, detail);
  card.append(viewport, caption);
  document.querySelector("#gallery").append(card);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8797b1, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 1.8);
  key.position.set(-3, 6, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xd1e5ff, 1);
  rim.position.set(3, 3, -2);
  scene.add(rim);
  const model = id === "playerBase"
    ? HD.Models.playerCharacter(0x003fd0, {
      skin: 0xe2c095,
      hat: "none",
      expression: "none",
      outfit: "plain",
    })
    : entry.appearance
      ? HD.Models.playerCharacter(0xef476f, entry.appearance)
      : Assets.create(id);
  if (!model) {
    detail.textContent = "Model unavailable";
    continue;
  }
  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  const root = new THREE.Group();
  model.position.sub(bounds.getCenter(new THREE.Vector3()));
  root.add(model);
  root.scale.setScalar(1 / Math.max(size.x, size.y, size.z));
  scene.add(root);
  const camera = new THREE.PerspectiveCamera(36, 1, 0.01, 20);
  const playerPreview = id === "playerBase" || id === "playerCustomized";
  camera.position.set(
    playerPreview ? -0.65 : 1.15,
    0.85,
    playerPreview ? -1.9 : 1.65,
  );
  camera.lookAt(0, 0, 0);
  views.push({ viewport, scene, camera });
}

function render() {
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.setScissorTest(false);
  renderer.clear();
  renderer.setScissorTest(true);
  for (const { viewport, scene, camera } of views) {
    const rect = viewport.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > innerHeight) continue;
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
    renderer.setViewport(rect.left, innerHeight - rect.bottom, rect.width, rect.height);
    renderer.setScissor(rect.left, innerHeight - rect.bottom, rect.width, rect.height);
    renderer.render(scene, camera);
  }
}

addEventListener("resize", render);
addEventListener("scroll", render, { passive: true });
document.querySelector("#status").textContent = `${views.length} previews. The supplied base player is now split into working animation parts; hats, outfits, faces, shoes and accessories are layered onto that original geometry.`;
render();
window.modelGalleryReady = true;
