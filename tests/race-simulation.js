"use strict";

const assert = require("assert");
const path = require("path");
const { pathToFileURL } = require("url");

async function run() {
  global.window = global;
  global.THREE = await import(
    pathToFileURL(path.resolve(__dirname, "../vendor/three.module.js")).href
  );
  global.document = {
    createElement() {
      return {
        width: 0,
        height: 0,
        getContext: createCanvasContext,
      };
    },
  };
  require("../src/config.js");
  require("../src/models.js");

  HD.world.scene = new THREE.Scene();
  HD.UI = createUiMock();
  HD.Controls = { setMode() {} };
  HD.Network = {
    isConnected: () => false,
    isHost: () => true,
  };
  HD.AI = {
    prepareRace() {},
    settleRace() {},
  };
  require("../src/race.js");

  HD.Race.resetHorses();
  for (let count = 4; count <= 8; count++) {
    HD.CONFIG.raceHorseCount = count;
    HD.Race.resetHorses({ forceStart: true });
    assert.equal(HD.state.horses.length, count);
    const probability = HD.state.horses.reduce(
      (total, horse) => total + horse.userData.data.liveChance, 0,
    );
    assert.ok(Math.abs(probability - 1) < 1e-10, "Active field probabilities must total one");
    HD.state.horses.forEach((horse, lane) => {
      assert.equal(horse.userData.data.lane, lane, "Starting lanes must never wrap");
      for (let step = 0; step < 64; step++) {
        const position = HD.Race.trackPoint(step / 64, lane).position;
        const outer = (position.x / 72) ** 2 + (position.z / 43) ** 2;
        const inner = (position.x / 49) ** 2 + (position.z / 22) ** 2;
        assert.ok(outer < 1 && inner > 1, "Every lane must stay on dirt around the whole oval");
      }
    });
  }
  HD.CONFIG.raceHorseCount = 6;
  HD.Race.resetHorses({ forceStart: true });

  const boostedHorse = HD.state.horses[0];
  const boostedHorseId = boostedHorse.userData.data.id;
  const oatsPosition = boostedHorse.position.clone().add(new THREE.Vector3(0, 2.2, 0));
  HD.Race.launch(
    "performanceOats",
    oatsPosition,
    new THREE.Vector3(),
    { consume: false },
  );
  HD.Race.updateProjectiles(0.016);
  assert.equal(
    boostedHorse.userData.data.maxSpeedBonus,
    0.01,
    "Champion Oats did not add one percent maximum speed",
  );
  HD.Race.resetHorses();
  const persistentHorse = HD.state.horses.find((horse) => {
    return horse.userData.data.id === boostedHorseId;
  });
  assert.equal(
    persistentHorse.userData.data.maxSpeedBonus,
    0.01,
    "Champion Oats did not persist between races",
  );

  persistentHorse.userData.data.progress = 2.6;
  HD.Race.resetHorses({ forceStart: true });
  assert.ok(
    HD.state.horses.every((horse) => horse.userData.data.progress === 0),
    "A new day did not teleport every horse back to the starting line",
  );

  const trajectoryStart = new THREE.Vector3(8, 13, 60);
  const trajectoryVelocity = new THREE.Vector3(4, 17, -32);
  const trajectoryPositions = new Float32Array(42 * 3);
  const trajectoryCount = HD.Race.predictTrajectory(
    "hotdog",
    trajectoryStart,
    trajectoryVelocity,
    trajectoryPositions,
  );
  const landingOffset = (trajectoryCount - 1) * 3;
  assert.ok(
    Math.abs(trajectoryPositions[landingOffset + 1] - 0.5) < 0.0001,
    "The trajectory guide did not finish on the projectile ground plane",
  );
  HD.Race.launch(
    "hotdog",
    trajectoryStart,
    trajectoryVelocity,
    { consume: false, visualOnly: true },
  );
  const guidedProjectile = HD.state.projectiles.at(-1);
  while (!guidedProjectile.landed && guidedProjectile.age < 10) {
    HD.Race.updateProjectiles(0.037);
  }
  assert.ok(
    Math.abs(guidedProjectile.position.x - trajectoryPositions[landingOffset]) < 0.0001 &&
      Math.abs(guidedProjectile.position.z - trajectoryPositions[landingOffset + 2]) < 0.0001,
    "The trajectory guide endpoint did not match the real unobstructed landing point",
  );

  HD.Race.launch(
    "hurdle",
    new THREE.Vector3(0, 0.4, 0),
    new THREE.Vector3(),
    { consume: false },
  );
  HD.Race.updateProjectiles(0.016);
  const hurdle = HD.state.projectiles.at(-1);
  const landedRotation = hurdle.mesh.rotation.clone();
  HD.Race.updateProjectiles(0.25);
  assert.ok(hurdle.grounded, "The hurdle did not lock to a track lane");
  assert.ok(
    Math.abs(hurdle.mesh.rotation.x - landedRotation.x) < 0.0001 &&
      Math.abs(hurdle.mesh.rotation.y - landedRotation.y) < 0.0001 &&
      Math.abs(hurdle.mesh.rotation.z - landedRotation.z) < 0.0001,
    "The placed hurdle continued rotating",
  );

  HD.world.projectileBarriers = [{
    start: [-2, 0],
    end: [2, 0],
    bottom: 0,
    top: 10,
    thickness: 0.12,
  }];
  HD.Race.launch(
    "hotdog",
    new THREE.Vector3(0, 4, 2),
    new THREE.Vector3(0, 0, -20),
    { consume: false },
  );
  const glassProjectile = HD.state.projectiles.at(-1);
  HD.Race.updateProjectiles(0.1);
  assert.ok(
    glassProjectile.blockedByGlass && glassProjectile.velocity.z > 0,
    "A projectile passed through commentator booth glass",
  );
  HD.world.projectileBarriers = [];

  HD.world.crowdThrowers = [0, 1, 2].map((index) => {
    const thrower = new THREE.Group();
    thrower.position.set(index * 4 - 4, 5, 62);
    thrower.userData.throwerIndex = index;
    return thrower;
  });

  let tacticalLaneChangeObserved = false;
  const observeLaneChanges = () => {
    tacticalLaneChangeObserved ||= HD.state.horses.some((horse, index) => {
      const data = horse.userData.data;
      return Math.abs(data.lane - index) > 0.05 || data.targetLane !== index;
    });
  };

  HD.Race.begin();
  for (let frame = 0; frame < 250; frame++) {
    HD.state.elapsed += 0.04;
    HD.Race.update(0.04);
    observeLaneChanges();
  }
  assert.equal(
    HD.state.projectiles.filter((projectile) => projectile.ambient).length,
    3,
    "The crowd should throw three staggered items in each ten-second window",
  );
  for (let frame = 0; frame < 250; frame++) {
    HD.state.elapsed += 0.04;
    HD.Race.update(0.04);
    observeLaneChanges();
  }
  assert.equal(
    HD.state.projectiles.filter((projectile) => projectile.ambient).length,
    6,
    "The second crowd-throw window did not produce exactly three more items",
  );

  let frames = 0;
  while (HD.Race.liveBettingOpen() && frames < 1_500) {
    HD.state.elapsed += 0.04;
    HD.Race.update(0.04);
    observeLaneChanges();
    frames++;
  }
  assert.ok(frames < 1_500, "The first-lap live betting window never closed");
  assert.equal(HD.Race.liveBettingOpen(), false, "Live betting remained open after lap one");
  assert.ok(
    tacticalLaneChangeObserved,
    "No horse made a tactical lane change",
  );

  const closingOdds = HD.state.horses.map((horse) => horse.userData.data.odds);
  for (let frame = 0; frame < 75; frame++) {
    HD.state.elapsed += 0.04;
    HD.Race.update(0.04);
  }
  assert.deepEqual(
    HD.state.horses.map((horse) => horse.userData.data.odds),
    closingOdds,
    "Odds changed after the lap-one live book closed",
  );

  HD.Controls.sitDown = () => {};
  HD.CONFIG.startingMoney = 1000;
  HD.CONFIG.crowdThrowInterval = 0;
  HD.CONFIG.raceLaps = 1;
  HD.Race.restart();
  assert.equal(HD.state.money, 1000, "Restart must use the selected practice bankroll");
  HD.state.horses.forEach((horse) => {
    assert.ok(horse.userData.data.progress <= 0, "New runs must start at the gates, not coast");
  });
  HD.Race.begin();
  for (let frame = 0; frame < 250; frame++) HD.Race.update(0.04);
  assert.equal(
    HD.state.projectiles.filter((projectile) => projectile.ambient).length,
    0,
    "Crowd Off must suppress all ambient projectiles",
  );

  HD.CONFIG.crowdThrowInterval = 6;
  HD.Race.restart();
  HD.Race.begin();
  for (let frame = 0; frame < 300; frame++) HD.Race.update(0.04);
  assert.equal(
    HD.state.projectiles.filter((projectile) => projectile.ambient).length,
    6,
    "Lively practice must produce six staggered throws over twelve seconds",
  );
  // Put the whole field just before the selected finish threshold.
  HD.state.horses.forEach((horse) => { horse.userData.data.progress = 0.99999; });
  for (let frame = 0; frame < 20; frame++) HD.Race.update(0.04);
  assert.equal(HD.state.finishOrder.length, 6, "A one-lap field must finish after lap one");
  HD.Race.restart(); // Also cancels the completed race's delayed next-race callback.
  assert.equal(HD.state.race, 1);
  assert.equal(HD.state.phase, "betting");

  let completeDay;
  HD.UI.showDay = (day, callback) => { completeDay = callback; };
  HD.Controls.forceStand = () => {};
  for (const [days, racesPerDay] of [[1, 1], [2, 3], [4, 1], [10, 6]]) {
    HD.CONFIG.totalRaces = days * racesPerDay;
    HD.CONFIG.racesPerRound = racesPerDay;
    HD.Race.restart();
    for (let race = 1; race <= days * racesPerDay; race++) {
      assert.equal(HD.state.race, race);
      assert.equal(HD.state.round, Math.ceil(race / racesPerDay));
      HD.Race.next();
      if (race === days * racesPerDay) {
        assert.equal(HD.state.phase, "matchOver", "Final race must end the run without another shop break");
      } else if (race % racesPerDay === 0) {
        assert.equal(HD.state.phase, "roundBreak");
        HD.Race.updateIntermission(HD.CONFIG.roundBreakDuration + 1);
        assert.equal(HD.state.phase, "dayTransition");
        const priorMoney = HD.state.money;
        const expectedAllowance = HD.CONFIG.roundBonuses[HD.state.round] ?? 0;
        completeDay();
        assert.equal(HD.state.money, priorMoney + expectedAllowance);
        assert.equal(HD.state.phase, "betting");
        assert.ok(Number.isFinite(HD.state.money), "Later days must not corrupt the bankroll");
      } else assert.equal(HD.state.phase, "betting");
    }
  }
  HD.Race.restart();
  HD.state.race = HD.CONFIG.racesPerRound;
  HD.Race.next();
  HD.Race.updateIntermission(HD.CONFIG.roundBreakDuration + 1);
  const staleDayCallback = completeDay;
  HD.Race.restart();
  staleDayCallback();
  assert.equal(HD.state.round, 1, "An old day callback must not change a restarted run");
  assert.equal(HD.state.race, 1);
  assert.equal(HD.state.money, HD.CONFIG.startingMoney);

  console.log("Odds, lanes, crowd, one-lap finish, 1–60 race progression, allowances, and stale day callbacks passed.");
}

function createUiMock() {
  return new Proxy(
    {},
    {
      get(target, key) {
        return target[key] ?? (() => {});
      },
    },
  );
}

function createCanvasContext() {
  return new Proxy(
    {},
    {
      get(target, property) {
        if (property in target) return target[property];
        if (property === "measureText") return () => ({ width: 100 });
        return () => {};
      },
      set(target, property, value) {
        target[property] = value;
        return true;
      },
    },
  );
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
