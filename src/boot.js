import * as THREE from "../vendor/three.module.js";
import { Assets } from "./assets.mjs";

window.THREE = THREE;

const gameScripts = [
  "config.js",
  "match-setup.js",
  "concessions.js",
  "reference-models.js",
  "models.js",
  "stadium.js",
  "broadcast.js",
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
    const suppliedModels = Object.keys(window.HD.CONFIG.items)
      .filter((id) => Assets.catalog[id] && !Assets.catalog[id].requiresRig);
    suppliedModels.push("playerBase");
    await Assets.preload(suppliedModels);
  }
  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = new URL(file, import.meta.url).href;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load ${file}`));
    document.body.append(script);
  });
}
