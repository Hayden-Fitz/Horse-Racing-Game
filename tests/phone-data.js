"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const context = { HD: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, "../src/phone-data.js"), "utf8"), context);
const profiles = [
  { id: "one", discovered: true },
  { id: "two", discovered: false },
  { id: "three", discovered: true },
];
assert.deepEqual([...context.HD.PhoneData.horses(profiles, ["two", "one"], "field")].map((p) => p.id), ["two", "one"]);
assert.deepEqual([...context.HD.PhoneData.horses(profiles, ["two"], "discovered")].map((p) => p.id), ["one", "three"]);
assert.deepEqual([...context.HD.PhoneData.horses(profiles, ["two"], "personal")], []);
const state = {
  phase: "racing", dayResults: [{ race: 2, winner: "Comet", podium: ["Comet", "Bolt"] }],
  raceAnnouncement: "PADDOCK ALERT: attempt on #2 failed. They're off! Live betting stays open.",
  horses: [{ userData: { data: { name: "Comet", progress: 2, liveChance: 0.4, openingChance: 0.3 } } }],
  ledger: [{ label: "Race 1 payout", amount: 40 }],
};
const first = context.HD.PhoneData.recordEvent(state, { label: "HIT", title: "Hotdog hits Comet", detail: "Race leader struck", key: "hit:comet:hotdog" });
assert.equal(first, true);
assert.equal(context.HD.PhoneData.recordEvent(state, { label: "HIT", title: "Repeat", detail: "Repeat", key: "hit:comet:hotdog" }), false);
const stories = context.HD.PhoneData.headlines(state);
assert.deepEqual([...stories].map((entry) => entry.label), ["RESULT", "HIT", "PAYOUT", "PADDOCK", "LIVE", "ODDS", "YOUR ACCOUNT"]);
assert(stories[3].detail.includes("attempt on #2 failed"));
assert(stories[5].detail.includes("30% to 40%"));
assert.equal(context.HD.PhoneData.headlines({ phase: "betting", horses: [], ledger: [] }).length, 0);
for (let i = 0; i < 15; i++) {
  state.raceTime = i * 6;
  context.HD.PhoneData.recordEvent(state, { label: "OVERTAKE", title: "Lead change " + i, detail: "Race 2", key: "lead:" + i });
}
assert.equal(state.newsEvents.length, 12);
assert.equal(state.newsEvents[0].title, "Lead change 14");
console.log("Phone Horse Stats filters and live DerbyNews headlines passed.");
