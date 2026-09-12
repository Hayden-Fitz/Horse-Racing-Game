import * as THREE from "../vendor/three.module.js";
window.THREE = THREE;
await import("./config.js");
await import("./models.js");

const renderer = new THREE.WebGLRenderer({
  canvas: document.querySelector("#horse-view"), antialias: true,
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x27323d);
scene.fog = new THREE.Fog(0x27323d, 30, 70);
scene.add(new THREE.HemisphereLight(0xe5efff, 0x776553, 2));
const key = new THREE.DirectionalLight(0xffebd1, 3.2);
key.position.set(4, 9, 7);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9 });
key.shadow.normalBias = 0.025;
scene.add(key);
const rim = new THREE.DirectionalLight(0xb0ceff, 2);
rim.position.set(-5, 6, -6);
scene.add(rim);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200),
  new THREE.MeshStandardMaterial({ color: 0x77716a, roughness: 0.95 }));
floor.rotation.x = -Math.PI / 2;
floor.position.y = 0.03;
floor.receiveShadow = true;
scene.add(floor);
const camera = new THREE.PerspectiveCamera(37, 1, 0.1, 150);
let horse;
let time = 0;
let paused = false;
let yaw = 0.72;
let pitch = 0.15;
let distance = 13.5;
const select = document.querySelector("#coat");
HD.CONFIG.horses.forEach((data, index) => {
  select.add(new Option(HD.horseNumber(data) + " " + data.name, index));
});
function chooseHorse(index) {
  if (horse) {
    scene.remove(horse);
    HD.Models.disposeHorse(horse);
  }
  horse = HD.Models.horse(HD.CONFIG.horses[index], index);
  horse.position.y = 0.75;
  horse.userData.numberLabel.visible = false;
  scene.add(horse);
  window.horseWorkshop.horse = horse;
}
function render() {
  const canvas = renderer.domElement;
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  camera.aspect = canvas.clientWidth / canvas.clientHeight;
  camera.position.set(
    Math.sin(yaw) * Math.cos(pitch) * distance,
    2.4 + Math.sin(pitch) * distance,
    Math.cos(yaw) * Math.cos(pitch) * distance,
  );
  camera.lookAt(0.2, 2.35, 0);
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
}
window.horseWorkshop = {
  renderer, scene, camera, horse: null,
  setView(view) {
    yaw = { side: 0, front: Math.PI / 2, three: 0.72, rear: -2.1 }[view] ?? 0;
    pitch = view === "side" ? 0.035 : 0.15;
    render();
  },
  advance(dt, speed = 1) {
    horse.userData.data.motionSpeed = horse.userData.data.baseSpeed * speed;
    time += dt;
    HD.Models.animateHorse(horse, time, true);
    render();
  },
  set paused(value) { paused = value; },
  render,
};
chooseHorse(0);
select.addEventListener("change", () => chooseHorse(Number(select.value)));
document.querySelectorAll("[data-view]").forEach(button =>
  button.addEventListener("click", () => window.horseWorkshop.setView(button.dataset.view)));
document.querySelector("#pause").addEventListener("click", event => {
  paused = !paused;
  event.target.textContent = paused ? "Resume" : "Pause";
});
const canvas = renderer.domElement;
let dragging = false;
canvas.addEventListener("pointerdown", event => {
  dragging = true;
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener("pointerup", () => { dragging = false; });
canvas.addEventListener("pointermove", event => {
  if (!dragging) return;
  yaw -= event.movementX * 0.008;
  pitch = THREE.MathUtils.clamp(pitch + event.movementY * 0.006, -0.12, 1.1);
});
canvas.addEventListener("wheel", event => {
  event.preventDefault();
  distance = THREE.MathUtils.clamp(distance + event.deltaY * 0.012, 7, 26);
}, { passive: false });
let previous = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - previous) / 1000);
  previous = now;
  const speed = Number(document.querySelector("#speed").value) / 100;
  document.querySelector("#speed-label").value = Math.round(speed * 100) + "%";
  if (!paused) {
    time += dt;
    horse.userData.data.motionSpeed = horse.userData.data.baseSpeed * speed;
    HD.Models.animateHorse(horse, time, true);
  }
  render();
  document.querySelector("#stats").textContent =
    renderer.info.render.triangles.toLocaleString() + " rendered triangles.";
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.horseWorkshopReady = true;
