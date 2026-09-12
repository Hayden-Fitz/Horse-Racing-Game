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
  const identities = new Map(HD.CONFIG.horses.map((horse) => [horse.id, horse.number]));
  assert.equal(new Set(identities.values()).size, identities.size, "Horse numbers must be unique");
  for (const horse of HD.CONFIG.horses) {
    assert.ok(Number.isInteger(horse.number) && horse.number >= 0);
    assert.equal(HD.horseNumber(horse), String(horse.number).padStart(2, "0"));
  }
  assert.equal(HD.horseNumber(-1), "??");
  const firstIdentity = HD.state.horses[0].userData.data.id;
  const firstNumber = HD.horseNumber(0);
  HD.state.activeHorseIds.reverse();
  HD.state.horseFieldRacesRemaining = 2;
  HD.Race.resetHorses({ forceStart: true });
  const relocated = HD.state.horses.find((horse) => horse.userData.data.id === firstIdentity);
  assert.equal(HD.horseNumber(relocated), firstNumber, "Moving field slots must not renumber a horse");
  HD.state.phase = "betting";
  HD.CONFIG.sabotageEnabled = false;
  const originalBankroll = HD.state.money;
  HD.Race.purchaseSabotage(0, "looseShoe");
  HD.Race.addNetworkSabotage({ horse: 0, optionId: "looseShoe" });
  HD.Race.addAISabotage(0, "looseShoe", "test");
  assert.equal(HD.state.money, originalBankroll, "Disabled fixer must not charge money");
  assert.equal(HD.state.sabotagePlans.length, 0, "All fixer entry points must honor the rule");
  HD.CONFIG.sabotageEnabled = true;
  HD.Race.purchaseSabotage(-1, "looseShoe");
  assert.equal(HD.state.sabotagePlans.length, 0, "Invalid horses must never accept fixer jobs");
  for (let count = 4; count <= 8; count++) {
    HD.CONFIG.raceHorseCount = count;
    HD.Race.resetHorses({ forceStart: true });
    assert.equal(HD.state.horses.length, count);
    const probability = HD.state.horses.reduce(
      (total, horse) => total + horse.userData.data.liveChance, 0,
    );
    assert.ok(Math.abs(probability - 1) < 1e-10, "Active field probabilities must total one");
    const groups = new Map();
    HD.state.horses.forEach((horse) => {
      const chance = horse.userData.data.liveChance;
      groups.set(chance, (groups.get(chance) || 0) + 1);
    });
    assert.ok(groups.size >= 2, 'Every field needs distinct contender groups');
    assert.ok([...groups.values()].every((size) => size === 2 || size === 3),
      'Each chance group must contain two or three horses');
    const groupedChances = [...groups.keys()].sort((a, b) => b - a);
    for (let group = 1; group < groupedChances.length; group++) {
      const gap = groupedChances[group - 1] - groupedChances[group];
      assert.ok(gap >= 0.05 - 1e-10 && gap <= 0.1 + 1e-10,
        'Adjacent groups must differ by five to ten percentage points');
    }
    HD.state.horses.forEach((horse, lane) => {
      assert.equal(horse.userData.data.number, identities.get(horse.userData.data.id));
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

  // Exercise deterministic fields across the full roster.
  const openingBooks = new Set();
  const openingQuotes = new Set();
  for (let offset = 0; offset < HD.CONFIG.horses.length; offset++) {
    HD.state.activeHorseIds = Array.from({ length: 6 }, (_, index) =>
      HD.CONFIG.horses[(offset + index) % HD.CONFIG.horses.length].id,
    );
    HD.state.horseFieldRacesRemaining = 2;
    HD.Race.resetHorses({ forceStart: true });
    const field = HD.state.horses.map((horse) => horse.userData.data);
    assert.ok(new Set(field.map((horse) => horse.odds)).size >= 3,
      'Opening odds must distinguish different profiles');
    const chances = field.map((horse) => horse.liveChance);
    openingBooks.add([...chances].sort((a, b) => b - a)
      .map((chance) => chance.toFixed(6)).join(','));
    openingQuotes.add(field.map((horse) => horse.odds).sort((a, b) => a - b).join(','));
    assert.ok(Math.max(...chances) - Math.min(...chances) > 0.05,
      'Distinct profiles must have a meaningful chance spread');
    assert.ok(Math.abs(chances.reduce((sum, chance) => sum + chance, 0) - 1) < 1e-10);
    const quotes = new Map(field.map((horse) => [horse.id, horse.odds]));
    HD.state.activeHorseIds.reverse();
    HD.Race.resetHorses({ forceStart: true });
    HD.state.horses.forEach((horse) => {
      assert.equal(horse.userData.data.odds, quotes.get(horse.userData.data.id),
        'Opening quotes must not depend on lane order');
    });
  }
  // Restore the field used by the item-effect checks below.
  assert.ok(openingBooks.size > 10, 'Different opponents must produce different probability books');
  assert.ok(openingQuotes.size > 1, 'Displayed odds must vary across different matchups');
  const originalRandom = Math.random;
  const randomFields = new Set();
  const drawnHorses = new Set();
  let seed = 271828;
  HD.state.horseBag = HD.CONFIG.horses.map((horse) => horse.id);
  HD.state.activeHorseIds = [];
  try {
    Math.random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let draw = 0; draw < 40; draw++) {
      HD.state.horseFieldRacesRemaining = 0;
      HD.Race.resetHorses({ forceStart: true });
      const ids = [...HD.state.activeHorseIds];
      assert.equal(new Set(ids).size, 6, 'Random fields cannot contain duplicate horses');
      ids.forEach((id) => drawnHorses.add(id));
      randomFields.add([...ids].sort().join(','));
      assert.ok(new Set(HD.state.horses.map((horse) => horse.userData.data.odds)).size >= 2,
        'A randomly drawn opening field must never flatten to one quote');
      HD.state.horseFieldRacesRemaining = 1;
      HD.Race.resetHorses({ forceStart: true });
      assert.deepEqual(HD.state.activeHorseIds, ids,
        'Odds grouping must not replace horses during their scheduled second race');
    }
  } finally {
    Math.random = originalRandom;
  }
  assert.ok(randomFields.size >= 35, 'Random draws must preserve matchup variety');
  assert.equal(drawnHorses.size, HD.CONFIG.horses.length, 'All roster horses remain eligible');
  HD.state.activeHorseIds = HD.CONFIG.horses.slice(0, 6).map((horse) => horse.id);
  HD.Race.resetHorses({ forceStart: true });
  const activeBoostedHorse = HD.state.horses[0];
  const boostedHorseId = activeBoostedHorse.userData.data.id;
  const oatsPosition = activeBoostedHorse.position.clone().add(new THREE.Vector3(0, 2.2, 0));
  HD.Race.launch(
    "goldenCarrot",
    oatsPosition,
    new THREE.Vector3(),
    { consume: false },
  );
  HD.Race.updateProjectiles(0.016);
  assert.equal(
    activeBoostedHorse.userData.data.maxSpeedBonus,
    0.01,
    "Golden Carrot did not add one percent maximum speed",
  );
  HD.Race.resetHorses();
  const persistentHorse = HD.state.horses.find((horse) => {
    return horse.userData.data.id === boostedHorseId;
  });
  assert.equal(
    persistentHorse.userData.data.maxSpeedBonus,
    0.01,
    "Golden Carrot did not persist between races",
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

  // Settlement uses ticket quotes, excludes losing tickets and phone fees, and
  // waits for a valid result before marking a network race as settled.
  HD.state.bets = [
    { horse: 0, amount: 10, odds: 3, fee: 1 },
    { horse: 0, amount: 20, odds: 7, fee: 2 },
    { horse: 1, amount: 50, odds: 30, fee: 5 },
  ];
  HD.state.money = 100;
  const result = HD.Race.networkSnapshot();
  result.phase = 'finished';
  result.finishOrder = [];
  result.horses[0].odds = 1;
  HD.Race.applyNetworkSnapshot(result);
  assert.equal(HD.state.money, 100, 'Incomplete results must not settle');
  result.finishOrder = [999];
  HD.Race.applyNetworkSnapshot(result);
  assert.equal(HD.state.money, 100, 'Invalid winners must not settle');
  result.finishOrder = [0, 1, 2, 3, 4, 5];
  HD.Race.applyNetworkSnapshot(result);
  assert.equal(HD.state.money, 300, 'Pay 40 + 160 using locked ticket quotes');
  HD.Race.applyNetworkSnapshot(result);
  assert.equal(HD.state.money, 300, 'Repeated results must not pay twice');
  HD.Race.restart();

  // Exercise the delayed online reward without waiting on wall-clock timers.
  const realSetTimeout = global.setTimeout;
  const originalNetwork = HD.Network;
  let rewardCallback;
  let rewardClaims = 0;
  let connected = true;
  let playing = true;
  try {
    global.setTimeout = (callback) => { rewardCallback = callback; return 0; };
    HD.Network = {
      isConnected: () => connected,
      isHost: () => true,
      isPlaying: () => playing,
      claimMatchWinReward: () => { rewardClaims++; },
    };
    const finalResult = HD.Race.networkSnapshot();
    finalResult.phase = 'matchOver';
    HD.Race.applyNetworkSnapshot(finalResult);
    assert.equal(typeof rewardCallback, 'function');
    const staleReward = rewardCallback;
    HD.Race.restart();
    staleReward();
    assert.equal(rewardClaims, 0, 'Restart must invalidate an old victory callback');
    HD.Race.applyNetworkSnapshot(finalResult);
    playing = false;
    rewardCallback();
    assert.equal(rewardClaims, 0, 'Leaving play must prevent a delayed reward');
    playing = true;
    connected = false;
    rewardCallback();
    assert.equal(rewardClaims, 0, 'Disconnected players cannot claim delayed rewards');
    connected = true;
    rewardCallback();
    assert.equal(rewardClaims, 1, 'The active completed match may claim its reward');
  } finally {
    global.setTimeout = realSetTimeout;
    HD.Network = originalNetwork;
  }
  HD.Race.restart();

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
