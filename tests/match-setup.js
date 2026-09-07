"use strict";

const assert = require("node:assert/strict");
global.HD = { CONFIG: {} };
require("../src/match-setup.js");

const setup = HD.MatchSetup;
assert.deepEqual(setup.normalize(), setup.defaults);
assert.deepEqual(setup.normalize({
  horses: 100,
  laps: -10,
  startingMoney: Infinity,
  crowd: "invalid",
}), { horses: 8, laps: 1, startingMoney: 100, crowd: "normal" });
assert.deepEqual(setup.normalize({
  horses: "4",
  laps: "8",
  startingMoney: "0",
  crowd: "off",
}), { horses: 4, laps: 8, startingMoney: 0, crowd: "off" });

let layoutUpdates = 0;
HD.Stadium = { refreshTrackLayout() { layoutUpdates++; } };
setup.apply({ horses: 8, laps: 1, startingMoney: 2500, crowd: "lively" });
assert.equal(HD.CONFIG.raceHorseCount, 8);
assert.equal(HD.CONFIG.raceLaps, 1);
assert.equal(HD.CONFIG.startingMoney, 2500);
assert.equal(HD.CONFIG.crowdThrowInterval, 6);
setup.resetForOnline();
assert.equal(HD.CONFIG.raceHorseCount, 6);
assert.equal(HD.CONFIG.raceLaps, 3);
assert.equal(HD.CONFIG.startingMoney, 100);
assert.equal(HD.CONFIG.crowdThrowInterval, 10);
assert.equal(layoutUpdates, 2);
console.log("Match settings: validated bounds, rule application, and online isolation passed.");
