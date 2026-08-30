import * as THREE from "../vendor/three.module.js";

window.THREE = THREE;

const gameScripts = [
  "config.js",
  "models.js",
  "stadium.js",
  "race.js",
  "ui.js",
  "controls.js",
  "main.js",
];

for (const file of gameScripts) {
  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = new URL(file, import.meta.url).href;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load ${file}`));
    document.body.append(script);
  });
}
