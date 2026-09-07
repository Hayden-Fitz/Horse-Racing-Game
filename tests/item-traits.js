"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

async function run() {
  global.window = global;
  global.THREE = await import(
    pathToFileURL(path.resolve(__dirname, "../vendor/three.module.js")).href,
  );
  require("../src/config.js");

  const items = Object.values(HD.CONFIG.items);
  assert.ok(items.length > 0, "The active item list is empty");
  items.forEach((item) => {
    assert.ok(Number.isInteger(item.weight) && item.weight >= 1 && item.weight <= 5);
    assert.ok(
      Number.isInteger(item.throwingEase) &&
        item.throwingEase >= 1 &&
        item.throwingEase <= 5,
    );
  });

  const hotdog = HD.itemThrowProfile(HD.CONFIG.items.hotdog);
  const inventory = HD.createInventory();
  inventory.horseshoe = 2;
  inventory.carrot = 1;
  assert.equal(HD.nextInventoryItem(inventory, "hotdog"), "carrot",
    "Food must be selected before an earlier owned item in another category");
  inventory.carrot = 0;
  assert.equal(HD.nextInventoryItem(inventory, "hotdog"), "horseshoe");
  inventory.horseshoe = 0;
  inventory.unknownItem = 3;
  assert.equal(HD.nextInventoryItem(inventory, "hotdog"), null);
  inventory.pillow = 1;
  inventory.soda = 1;
  assert.equal(HD.nextInventoryItem(inventory, "chair"), "pillow",
    "Category selection must wrap around the inventory order");
  const chair = HD.itemThrowProfile(HD.CONFIG.items.chair);
  assert.ok(hotdog.rangeMultiplier > chair.rangeMultiplier);
  assert.ok(hotdog.liftMultiplier > chair.liftMultiplier);
  assert.deepEqual(
    HD.itemThrowProfile({ weight: -100, throwingEase: 999 }),
    { weight: 1, throwingEase: 5, liftMultiplier: 1.04, rangeMultiplier: 1.16 },
  );

  console.log("Item weight/ease data and predictable throw profiles passed.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
