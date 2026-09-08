"use strict";

const assert = require("node:assert/strict");
global.HD = {
  CONFIG: {
    items: { hotdog: { price: 20 }, chair: { price: 100, vendorOnly: true } },
    phoneDeliveryDuration: 12,
    vendorDiscount: 0.33,
  },
  state: { money: 100, inventory: {}, deliveries: [], selectedItem: "chair" },
};
require("../src/concessions.js");
const shop = HD.Concessions;
const state = HD.state;

assert.ok(shop.purchase("missing").error);
assert.ok(shop.purchase("toString").error);
assert.ok(shop.purchase("chair").error);
assert.ok(shop.purchase("chair", "vendor").error);
assert.equal(state.money, 100);
assert.equal(shop.purchase("hotdog").price, 20);
assert.equal(state.money, 80);
assert.equal(state.inventory.hotdog, undefined, "Orders must not arrive instantly");
assert.deepEqual(shop.update(11.9), []);
assert.deepEqual(shop.update(0.1), ["hotdog"]);
assert.equal(state.inventory.hotdog, 1);
assert.equal(state.selectedItem, "chair", "Delivery must not interrupt the held item");
assert.equal(state.deliveries[0].complete, true);
assert.deepEqual(shop.update(1), []);
assert.equal(state.inventory.hotdog, 1, "Completed orders cannot grant items twice");
shop.update(3);
assert.equal(state.deliveries.length, 0, "Delivered receipts expire");
state.vendorOpen = true;
assert.equal(shop.purchase("chair", "vendor").price, 67);
assert.equal(state.inventory.chair, 1);
assert.equal(state.money, 13);
assert.ok(shop.purchase("hotdog").error);
assert.equal(state.deliveries.length, 0);
state.money = 100;
shop.purchase("hotdog");
shop.purchase("hotdog");
shop.update(NaN);
shop.update(-10);
assert.equal(state.deliveries[0].remaining, 12);
assert.deepEqual(shop.update(15), ["hotdog", "hotdog"]);
assert.equal(state.inventory.hotdog, 3);
state.deliveries = []; // Restart discards outstanding orders/receipts.
assert.deepEqual(shop.update(20), []);
assert.equal(state.inventory.hotdog, 3);
console.log("Concessions: purchase validation, 12s delivery, instant pickup, receipts and no forced item swap passed.");
