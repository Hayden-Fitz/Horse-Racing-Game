"use strict";

const assert = require("node:assert/strict");

global.HD = {
  CONFIG: {
    items: {
      goldenHotdog: { name: "Golden Hotdog", legendary: true, price: 1000 },
      goldenCarrot: { name: "Golden Carrot", legendary: true, price: 1200 },
    },
  },
  state: {
    round: 1,
    phase: "betting",
    vendorOpen: true,
    money: 1500,
    inventory: {},
    legendaryPurchasedRound: 0,
  },
  Network: { isConnected: () => false },
};
require("../src/legendary.js");
const shop = HD.Legendary;
const state = HD.state;

assert.equal(shop.currentOffer().id, "goldenHotdog");
assert.match(shop.quote("goldenHotdog").error, /day break/);
assert.ok(shop.purchase("goldenHotdog").error);
assert.equal(state.money, 1500);

state.phase = "roundBreak";
assert.ok(shop.quote("goldenCarrot").error, "Only the rotating offer may sell");
state.vendorOpen = false;
assert.ok(shop.purchase("goldenHotdog").error);
state.vendorOpen = true;
assert.equal(shop.purchase("goldenHotdog").price, 1000);
assert.equal(state.money, 500);
assert.equal(state.inventory.goldenHotdog, 1);
assert.ok(shop.purchase("goldenHotdog").error, "One offer per player per day");
assert.equal(state.money, 500);

state.round = 2;
assert.equal(shop.currentOffer().id, "goldenCarrot");
assert.ok(shop.quote("goldenCarrot").error, "Insufficient bankroll must block purchase");
state.money = 1500;
HD.Network.isConnected = () => true;
assert.match(shop.quote("goldenCarrot").error, /online lobbies/);
assert.ok(shop.purchase("goldenCarrot").error);
HD.Network.isConnected = () => false;
assert.equal(shop.purchase("goldenCarrot").price, 1200);
assert.equal(state.inventory.goldenCarrot, 1);
assert.equal(state.money, 300);
assert.equal(shop.currentOffer().id, "goldenCarrot");

console.log("Legendary rotation, availability, price, single purchase, and online gate passed.");
