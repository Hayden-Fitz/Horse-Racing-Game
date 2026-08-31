"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const html = read("index.html");
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);

assert.equal(new Set(ids).size, ids.length, "index.html contains duplicate IDs");

const sources = [
  "src/main.js",
  "src/network.js",
  "src/settings.js",
  "src/ui.js",
].map(read).join("\n");
const referencedIds = [...sources.matchAll(/["'`]#([A-Za-z][\w-]*)["'`]/g)]
  .map((match) => match[1]);

referencedIds.forEach((id) => {
  assert.ok(ids.includes(id), `JavaScript references missing HTML element #${id}`);
});

const sandbox = {
  console,
  THREE: {
    MeshStandardMaterial: class {},
    Vector3: class {
      constructor(x, y, z) {
        Object.assign(this, { x, y, z });
      }
    },
  },
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(read("src/config.js"), sandbox);

assert.equal(Object.keys(sandbox.HD.CONFIG.items).length, 8, "The hotbar requires exactly eight items");
assert.equal(sandbox.HD.CONFIG.raceLaps, 3, "Races should run for three laps");
assert.equal(sandbox.HD.CONFIG.horses.length, 24, "The rotating horse pool requires 24 horses");
assert.equal(sandbox.HD.CONFIG.raceHorseCount, 8, "Each race should contain eight horses");
assert.equal(sandbox.HD.CONFIG.horseFieldRaces, 2, "Each horse field should remain for two races");
assert.equal(
  sandbox.HD.CONFIG.sabotageOptions.looseShoe.startDelay,
  1.5,
  "The cheapest sabotage should delay the start",
);
assert.equal(
  sandbox.HD.CONFIG.sabotageOptions.badFeed.startDelay,
  2.8,
  "The second sabotage should delay the start",
);
assert.equal(
  sandbox.HD.CONFIG.sabotageOptions.gateTampering.penalty,
  0.15,
  "The premium sabotage should permanently reduce performance",
);
assert.ok(ids.includes("lobby-public"), "The public lobby button is missing");
assert.ok(ids.includes("lobby-private"), "The private lobby button is missing");
assert.ok(html.includes('value="640"'), "The 640p resolution option is missing");
assert.ok(html.includes('value="2160"'), "The 2160p resolution option is missing");

console.log("UI element, eight-item inventory, and resolution checks passed.");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}
