import * as THREE from "../vendor/three.module.js";
import { Assets } from "./assets.mjs";

window.THREE = THREE;

const bootStatus = document.querySelector("#boot-loading-status");

const gameScripts = [
  "config.js",
  "match-setup.js",
  "concessions.js",
  "legendary.js",
  "reference-models.js",
  "models.js",
  "plains.js",
  "stadium.js",
  "broadcast.js",
  "photo.js",
  "race.js",
  "ai.js",
  "phone-data.js",
  "ui.js",  
  "settings.js",
  "audio.js",
  "realtime.js",
  "network.js",
  "controls.js",
  "main.js", 
];

try {
for (const file of gameScripts) {
  bootStatus.textContent = "Loading " + file.replace(".js", "") + "...";
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
} catch (error) {
  bootStatus.textContent = "Startup failed: " + error.message;
  console.error(error);
}
