"use strict";

const path = require("path");
const { spawnSync } = require("child_process");

const testFiles = [
  "match-setup.js",
  "realtime-server.js",
  "realtime-client.js",
  "cloudflare-worker.js",
  "concessions.js",
  "delivery-status.js",
  "legendary-shop.js",
  "item-traits.js",
  "ui-contract.js",
  "phone-data.js",
  "bet-preview.js",
  "player-animation.js",
  "horse-animation.js",
  "horse-profiles.js",
  "controls-input.js",
  "stadium-smoke.js",
  "race-simulation.js",
  "ai-behavior.js",
  "imported-models.mjs",
  "reference-models.mjs",
];

for (const testFile of testFiles) {
  const result = spawnSync(
    process.execPath,
    [path.join(__dirname, testFile)],
    { stdio: "inherit" },
  );
  if (result.status !== 0) process.exit(result.status || 1);
}
