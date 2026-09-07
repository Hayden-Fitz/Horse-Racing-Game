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
}), { ...setup.defaults, horses: 8, laps: 1, startingMoney: 100, crowd: "normal" });
assert.deepEqual(setup.normalize({
  horses: "4",
  laps: "8",
  startingMoney: "1000",
  crowd: "off",
}), { ...setup.defaults, horses: 4, laps: 8, startingMoney: 1000, crowd: "off" });
assert.equal(setup.normalize({ days: 100 }).days, 10);
assert.equal(setup.normalize({ racesPerDay: 0 }).racesPerDay, 1);

let layoutUpdates = 0;
HD.Stadium = { refreshTrackLayout() { layoutUpdates++; } };
setup.apply({ days: 5, racesPerDay: 3, horses: 8, laps: 1, startingMoney: 2500, crowd: "lively" });
assert.equal(HD.CONFIG.totalRaces, 15);
assert.equal(HD.CONFIG.racesPerRound, 3);
assert.equal(HD.CONFIG.raceHorseCount, 8);
assert.equal(HD.CONFIG.raceLaps, 1);
assert.equal(HD.CONFIG.startingMoney, 1000);
assert.equal(HD.CONFIG.crowdThrowInterval, 6);
setup.resetForOnline();
assert.equal(HD.CONFIG.raceHorseCount, 6);
assert.equal(HD.CONFIG.raceLaps, 3);
assert.equal(HD.CONFIG.startingMoney, 100);
assert.equal(HD.CONFIG.crowdThrowInterval, 10);
assert.equal(HD.CONFIG.totalRaces, 6);
assert.equal(HD.CONFIG.racesPerRound, 2);
assert.equal(layoutUpdates, 2);
console.log("Match settings: validated bounds, rule application, and online isolation passed.");
