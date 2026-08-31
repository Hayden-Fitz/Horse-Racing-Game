"use strict";

const path = require("path");
const { spawnSync } = require("child_process");

const testFiles = [
  "ui-contract.js",
  "player-animation.js",
  "stadium-smoke.js",
  "race-simulation.js",
  "ai-behavior.js",
];

for (const testFile of testFiles) {
  const result = spawnSync(
    process.execPath,
    [path.join(__dirname, testFile)],
    { stdio: "inherit" },
  );
  if (result.status !== 0) process.exit(result.status || 1);
}
