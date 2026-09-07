import * as THREE from "../vendor/three.module.js";
import { Assets } from "./assets.mjs";
import { createModelEnvironment } from "./model-lighting.mjs";

const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector("#preview"), alpha: true, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setClearColor(0x000000, 0);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
const environment = createModelEnvironment(renderer);
const views = [];
const report = await fetch("assets/Models/optimized/report.json").then((response) => response.json());
await Assets.preload(Object.keys(Assets.catalog));

for (const [id, entry] of Object.entries(Assets.catalog)) {
  const card = document.createElement("section");
  card.className = "model-card";
  const viewport = document.createElement("div");
  viewport.className = "model-view";
  const caption = document.createElement("div");
  caption.className = "model-caption";
  const heading = document.createElement("h2");
  heading.textContent = entry.source.replace(/\.glb$|\. TODO_.*$/g, "");
  const detail = document.createElement("p");
  const stats = report.find((item) => item.id === id);
  detail.textContent = `${stats.triangles.toLocaleString()} triangles · ${Math.round(stats.bytes / 1024)} KB` +
    (entry.requiresRig ? " · animation rig pending" : "");
  caption.append(heading, detail);
  card.append(viewport, caption);
  document.querySelector("#gallery").append(card);

  const scene = new THREE.Scene();
  scene.environment = environment.texture;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8797b1, 1.5));
  const key = new THREE.DirectionalLight(0xffe5bc, 2);
  key.position.set(-3, 6, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xd1e5ff, 1);
  rim.position.set(3, 3, -2);
  scene.add(rim);
  const model = Assets.create(id);
  if (!model) {
    detail.textContent = Assets.failures.get(id) || "Model unavailable";
    continue;
  }
  model.scale.setScalar(1 / entry.size);
  scene.add(model);
  const camera = new THREE.PerspectiveCamera(36, 1, 0.01, 20);
  camera.position.set(1.15, 0.85, 1.65);
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
document.querySelector("#status").textContent = `${views.length} optimized models. Originals preserved. Player rig and unreleased item mechanics remain pending.`;
render();
window.modelGalleryReady = true;
