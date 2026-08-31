"use strict";

const assert = require("assert");
const path = require("path");
const { pathToFileURL } = require("url");

async function run() {
  const threeUrl = pathToFileURL(
    path.resolve(__dirname, "../vendor/three.module.js"),
  ).href;

  global.window = global;
  global.THREE = await import(threeUrl);
  require("../src/config.js");
  require("../src/models.js");

  const player = HD.Models.playerCharacter(0xef476f, {
    variant: 2,
    activity: "watch",
  });

  HD.Models.setPlayerStanding(player, true);
  player.userData.moving = true;
  HD.Models.animateCharacter(player, 1.4, true);
  assert.notEqual(player.userData.legs[0].rotation.x, 0, "Walking legs did not animate");
  assert.notEqual(
    player.userData.legs[0].rotation.x,
    player.userData.legs[1].rotation.x,
    "Walking legs should move in opposite phases",
  );

  player.userData.activity = "phone";
  HD.Models.equipPlayer(player, "phone", "hotdog");
  HD.Models.animateCharacter(player, 1.5, true);
  assert.equal(player.userData.equippedProp, "phone");
  assert.equal(player.userData.props.get("phone").visible, true);

  HD.Models.equipPlayer(player, "throw", "hotdog");
  HD.Models.playPlayerThrow(player, "hotdog");
  HD.Models.animateCharacter(player, HD.state.elapsed + 0.1, true);
  assert.equal(player.userData.equippedProp, "item:hotdog");
  assert.ok(
    player.userData.props.get("item:hotdog").scale.x > 0.8,
    "Third-person held items should be easy to see",
  );
  assert.ok(player.userData.arms[1].rotation.x > 1, "Throwing arm did not enter its release pose");

  console.log("Walking, phone, held-item, and throwing animation checks passed.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
