import * as THREE from "../vendor/three.module.js";
import { Assets } from "./assets.mjs";
import { createModelEnvironment } from "./model-lighting.mjs";

window.THREE = THREE;

const gameScripts = [
  "config.js",
  "models.js",
  "stadium.js",
  "race.js",
  "ai.js",
  "ui.js",  
  "settings.js",
  "audio.js",
  "firebase.js",
  "network.js",
  "controls.js",
  "main.js", 
];

for (const file of gameScripts) {
  if (file === "models.js") {
    window.HD.Assets = Assets;
    window.HD.createModelEnvironment = createModelEnvironment;
    await Assets.preload(Object.keys(window.HD.CONFIG.items));
  }
  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = new URL(file, import.meta.url).href;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load ${file}`));
    document.body.append(script);
  });
}
