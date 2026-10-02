"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const context = { HD: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, "../src/phone-data.js"), "utf8"), context);
assert.equal(context.HD.PhoneData.fixerRisk(0.33, 0.5),
  "67% success; 33% failure, including 17% interception");
assert.equal(context.HD.PhoneData.fixerRisk(0.1, 0.25),
  "90% success; 10% failure, including 3% interception");
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
const finishState = { round: 2, race: 4, raceTime: 93, newsEvents: [] };
context.HD.PhoneData.recordFinishNews(finishState,
  { name: "Longshot", finishTime: 92.31, openingChance: 0.09 },
  { name: "Favorite", finishTime: 92.64 });
assert.deepEqual([...finishState.newsEvents].map((event) => event.label),
  ["UPSET", "PHOTO FINISH"]);
assert.equal(finishState.newsEvents[1].detail.includes("0.33 seconds"), true);
context.HD.PhoneData.recordFinishNews(finishState,
  { name: "Longshot", finishTime: 92.31, openingChance: 0.09 },
  { name: "Favorite", finishTime: 92.64 });
assert.equal(finishState.newsEvents.length, 2, "Finish stories must deduplicate");
const ordinaryFinish = { round: 2, race: 5, raceTime: 94, newsEvents: [] };
context.HD.PhoneData.recordFinishNews(ordinaryFinish,
  { name: "Favorite", finishTime: 92, openingChance: 0.35 },
  { name: "Longshot", finishTime: 93 });
assert.equal(ordinaryFinish.newsEvents.length, 0, "Ordinary finishes need no rare-event card");
console.log("Phone Horse Stats filters and live DerbyNews headlines passed.");
