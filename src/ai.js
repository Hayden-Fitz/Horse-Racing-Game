"use strict";

HD.AI = (() => {
  const S = HD.state;
  const C = HD.CONFIG;
  const names = ["Maya", "Dex", "Rin", "Sol", "Nia", "Bo", "Kit"];
  const personalities = [
    "favorite",
    "value",
    "chaos",
    "favorite",
    "value",
    "chaos",
    "favorite",
  ];
  let players = [];
  let activeRaceKey = "";
  let settledRaceKey = "";

  function init() {
    resetMatch();
  }

  function resetMatch() {
    players = names.map((name, index) => ({
      id: `ai-${index}`,
      name,
      money: 100,
      personality: personalities[index],
      bets: [],
      betDelay: 2 + index * 1.7,
      liveBetAt: 4.5 + (index % 4) * 1.3,
      throwAt: 6.5 + index * 1.8,
      openingBetPlaced: false,
      liveBetPlaced: false,
      throwMade: false,
      inventory: HD.createInventory(),
      destination: null,
      route: [],
      routeMode: "seat",
      shopVisited: false,
      activityTimer: 0,
      patrolStep: 0,
      sabotageMade: false,
    }));
    activeRaceKey = "";
    settledRaceKey = "";
    S.aiPlayers = players;
    prepareRace();
  }

  function prepareRace() {
    if (!players.length) return;
    activeRaceKey = `${S.round}-${S.race}`;
    settledRaceKey = "";
    players.forEach((player, index) => {
      player.bets = [];
      player.openingBetPlaced = false;
      player.liveBetPlaced = false;
      player.throwMade = false;
      player.shopVisited = false;
      player.sabotageMade = false;
      player.betDelay = 2 + ((index * 17 + S.race * 5) % 16);
      player.liveBetAt = 3.5 + ((index * 11 + S.race) % 8);
      player.throwAt = 6 + ((index * 13 + S.race * 3) % 18);
    });
  }

  function update(dt = 0.016) {
    if (HD.Network?.isConnected() || !S.horses.length) return;
    const raceKey = `${S.round}-${S.race}`;
    if (raceKey !== activeRaceKey) prepareRace();

    players.forEach((player, index) => updateMovement(player, index, dt));

    if (S.phase === "betting") {
      const bettingElapsed = C.preparationDuration - S.timer;
      players.forEach((player, index) => {
        if (!player.openingBetPlaced && bettingElapsed >= player.betDelay) {
          placeBet(player, false);
        }
        if (!player.sabotageMade && bettingElapsed >= 8 + index * 1.4) {
          attemptSabotage(player, index);
        }
      });
      return;
    }
    if (S.phase !== "racing") return;

    players.forEach((player, index) => {
      if (
        !player.liveBetPlaced &&
        S.raceTime >= player.liveBetAt &&
        HD.Race.liveBettingOpen()
      ) {
        placeBet(player, true);
      }
      if (!player.throwMade && S.raceTime >= player.throwAt) {
        throwAtRace(player, index);
      }
    });
  }

  function updateMovement(player, index, dt) {
    const avatar = HD.world.players?.[index];
    if (!avatar) return;

    const desiredMode = S.phase === "roundBreak"
      ? "shop"
      : S.phase === "racing"
        ? "walkway"
        : "seat";
    if (player.routeMode !== desiredMode) {
      player.routeMode = desiredMode;
      player.route = createRoute(avatar.position, index, desiredMode);
      player.activityTimer = 1.5 + (index % 4) * 0.7;
      if (desiredMode !== "shop") player.shopVisited = false;
      HD.Models.setPlayerStanding(avatar, desiredMode !== "seat");
    }

    const destination = player.route[0];
    if (!destination) {
      avatar.userData.moving = false;
      player.activityTimer -= dt;
      if (desiredMode === "seat") {
        avatar.userData.activity = index % 3 === 0 ? "phone" : "watch";
        HD.Models.equipPlayer(avatar, avatar.userData.activity, "hotdog");
        return;
      }
      if (desiredMode === "shop") {
        avatar.userData.activity = "phone";
        HD.Models.equipPlayer(avatar, "phone", "hotdog");
        if (!player.shopVisited) visitShop(player);
        if (player.activityTimer <= 0) {
          player.activityTimer = 3 + (index % 3);
          player.route = upperPatrolRoute(index, player);
        }
        return;
      }
      avatar.userData.activity = "watch";
      HD.Models.equipPlayer(avatar, "look", "hotdog");
      if (player.activityTimer <= 0) {
        player.activityTimer = 4 + (index % 4);
        player.route = walkwayPatrolRoute(index, player);
      }
      return;
    }

    const direction = destination.clone().sub(avatar.position);
    const distance = direction.length();
    if (distance < 0.35) {
      avatar.position.copy(destination);
      player.route.shift();
      return;
    }
    direction.normalize();
    const step = Math.min(distance, dt * (7.2 + (index % 3) * 0.35));
    avatar.position.addScaledVector(direction, step);
    avatar.rotation.y = Math.atan2(-direction.x, -direction.z);
    avatar.userData.moving = true;
    avatar.userData.standing = true;
    avatar.userData.activity = "watch";
  }

  function createRoute(start, index, mode) {
    const seat = HD.Stadium.playerSeatPlacement(index + 1).avatar;
    const startOnUpperFloor = start.y > 10;
    const startOnWalkway = start.y < 3.5;

    const seatAngle = Math.atan2(seat.z, seat.x);
    const stairAngle = Math.round(seatAngle / (Math.PI / 2)) * (Math.PI / 2);
    const seatDefinition = [
      { row: 1 }, { row: 1 }, { row: 1 }, { row: 3 },
      { row: 3 }, { row: 5 }, { row: 5 }, { row: 5 },
    ][(index + 1) % 8];
    const row = seatDefinition.row;
    const rowAtStairs = ovalPoint(
      82.1 + row * 3.25,
      51.85 + row * 2.75,
      stairAngle,
      C.grandstandBaseHeight + row * 1.5,
    );
    const lower = ovalPoint(78.5, 48, stairAngle, 1.85);
    const upper = ovalPoint(104.5, 70.5, stairAngle, 13.7);
    const approach = ovalPoint(78.5, 48, seatAngle, 1.85);
    if (mode === "seat") {
      return startOnUpperFloor
        ? [upper, lower, ...ovalArc(82.1 + row * 3.25, 51.85 + row * 2.75, C.grandstandBaseHeight + row * 1.5, stairAngle, seatAngle), seat.clone()]
        : startOnWalkway
          ? [...ovalArc(78.5, 48, 1.85, Math.atan2(start.z, start.x), stairAngle), lower, rowAtStairs, ...ovalArc(82.1 + row * 3.25, 51.85 + row * 2.75, C.grandstandBaseHeight + row * 1.5, stairAngle, seatAngle), seat.clone()]
          : [...ovalArc(82.1 + row * 3.25, 51.85 + row * 2.75, C.grandstandBaseHeight + row * 1.5, Math.atan2(start.z, start.x), seatAngle), seat.clone()];
    }
    if (mode === "walkway") {
      return startOnUpperFloor
        ? [upper, lower, ...ovalArc(78.5, 48, 1.85, stairAngle, seatAngle)]
        : [...ovalArc(82.1 + row * 3.25, 51.85 + row * 2.75, C.grandstandBaseHeight + row * 1.5, seatAngle, stairAngle), rowAtStairs, lower, ...ovalArc(78.5, 48, 1.85, stairAngle, seatAngle)];
    }

    const shops = HD.world.shopPositions || [];
    const shop = shops[index % Math.max(1, shops.length)];
    const shopPoint = shop
      ? new THREE.Vector3(shop.x, 13.7, shop.z)
      : ovalPoint(110, 74, stairAngle + Math.PI / 4, 13.7);
    const shopAngle = Math.atan2(shopPoint.z, shopPoint.x);
    return startOnUpperFloor
      ? [...ovalArc(110, 74, 13.7, Math.atan2(start.z, start.x), shopAngle), shopPoint]
      : startOnWalkway
        ? [...ovalArc(78.5, 48, 1.85, Math.atan2(start.z, start.x), stairAngle), lower, upper, ...ovalArc(110, 74, 13.7, stairAngle, shopAngle), shopPoint]
        : [...ovalArc(82.1 + row * 3.25, 51.85 + row * 2.75, C.grandstandBaseHeight + row * 1.5, seatAngle, stairAngle), rowAtStairs, lower, upper, ...ovalArc(110, 74, 13.7, stairAngle, shopAngle), shopPoint];
  }

  function upperPatrolRoute(index, player) {
    player.patrolStep++;
    const angle = ((index * 0.72 + player.patrolStep * 0.38) % (Math.PI * 2));
    const avatar = HD.world.players?.[index];
    return ovalArc(110, 74, 13.7, Math.atan2(avatar.position.z, avatar.position.x), angle);
  }

  function walkwayPatrolRoute(index, player) {
    player.patrolStep++;
    const angle = ((index * 0.78 + player.patrolStep * 0.25) % (Math.PI * 2));
    const avatar = HD.world.players?.[index];
    return ovalArc(78.5, 48, 1.85, Math.atan2(avatar.position.z, avatar.position.x), angle);
  }

  function ovalArc(radiusX, radiusZ, y, fromAngle, toAngle) {
    let delta = Math.atan2(Math.sin(toAngle - fromAngle), Math.cos(toAngle - fromAngle));
    const steps = Math.max(1, Math.ceil(Math.abs(delta) / 0.08));
    return Array.from({ length: steps }, (_, index) => {
      const angle = fromAngle + delta * ((index + 1) / steps);
      return ovalPoint(radiusX, radiusZ, angle, y);
    });
  }

  function attemptSabotage(player, index) {
    player.sabotageMade = true;
    if (player.money < 70 || index % 3 === 1) return;
    const optionIds = ["looseShoe", "badFeed", "gateTampering"];
    const optionId = optionIds[(index + S.race) % optionIds.length];
    const option = C.sabotageOptions[optionId];
    const target = chooseHorse(player, false);
    if (!option || player.money < option.price) return;
    player.money -= option.price;
    HD.Race.addAISabotage(target, optionId, player.name);
  }

  function ovalPoint(radiusX, radiusZ, angle, y) {
    return new THREE.Vector3(
      Math.cos(angle) * radiusX,
      y,
      Math.sin(angle) * radiusZ,
    );
  }

  function visitShop(player) {
    player.shopVisited = true;
    const options = Object.entries(C.items)
      .filter(([, item]) => player.money >= Math.ceil(item.price * (1 - C.vendorDiscount)));
    if (!options.length) return;
    const [itemId, item] = options[(player.name.length + S.round) % options.length];
    const price = Math.ceil(item.price * (1 - C.vendorDiscount));
    player.money -= price;
    player.inventory[itemId] += 1;
    HD.UI.renderLeaderboard?.();
  }

  function placeBet(player, live) {
    const horseIndex = chooseHorse(player, live);
    const horse = S.horses[horseIndex]?.userData.data;
    if (!horse) return;

    const desiredStake = live ? 5 + (player.id.length % 3) * 5 : 10 + horseIndex % 4 * 5;
    const stake = Math.min(Math.floor(player.money / 5) * 5, desiredStake);
    if (stake < 5) return;

    player.money -= stake;
    player.bets.push({
      horse: horseIndex,
      amount: stake,
      odds: horse.odds,
    });
    if (live) player.liveBetPlaced = true;
    else player.openingBetPlaced = true;
    HD.UI.renderLeaderboard?.();
  }

  function chooseHorse(player, live) {
    const entries = S.horses.map((horse, index) => {
      const data = horse.userData.data;
      let score = data.ability * 8 - data.odds * 0.08;
      if (player.personality === "value") score += data.odds * 0.11;
      if (player.personality === "chaos") score += Math.sin(index * 5.3 + S.race) * 1.7;
      if (live) score += data.progress * 4.5;
      return { index, score };
    });
    entries.sort((first, second) => second.score - first.score);
    const choiceRange = player.personality === "favorite" ? 2 : 4;
    const choice = (player.name.length + S.race) % choiceRange;
    return entries[Math.min(choice, entries.length - 1)].index;
  }

  function throwAtRace(player, playerIndex) {
    player.throwMade = true;
    const backedHorse = player.bets[0]?.horse ?? chooseHorse(player, true);
    const raceOrder = [...S.horses]
      .map((horse, index) => ({ index, progress: horse.userData.data.progress }))
      .sort((first, second) => second.progress - first.progress);
    const supportFavorite = player.personality === "favorite" || playerIndex % 3 === 0;
    const targetIndex = supportFavorite
      ? backedHorse
      : raceOrder.find((entry) => entry.index !== backedHorse)?.index ?? backedHorse;
    const ownedItems = Object.keys(player.inventory).filter((type) => player.inventory[type] > 0);
    const itemTypes = ownedItems.length
      ? ownedItems
      : supportFavorite
      ? ["carrot", "carrot", "hurdle"]
      : ["hotdog", "soda", "bananaPeel", "airHorn"];
    const itemType = itemTypes[(playerIndex + S.race) % itemTypes.length];
    const target = S.horses[targetIndex];
    if (!target) return;

    const avatar = HD.world.players?.[playerIndex];
    const seat = HD.Stadium.playerSeatPlacement(playerIndex + 1);
    const start = (avatar?.position || seat.avatar).clone().add(new THREE.Vector3(0, 3, 0));
    const destination = target.position.clone();
    const item = C.items[itemType];
    const distance = start.distanceTo(destination);
    const flightTime = THREE.MathUtils.clamp(distance / item.speed, 0.65, 1.65);
    const velocity = destination.sub(start).divideScalar(flightTime);
    velocity.y += 0.5 * item.gravity * flightTime;

    HD.Race.launch(itemType, start, velocity, { consume: false });
    if (player.inventory[itemType] > 0) player.inventory[itemType]--;
    if (avatar?.userData) {
      HD.Models.playPlayerThrow(avatar, itemType);
    }
    if (playerIndex % 2 === 0) {
      HD.UI.announce(`${player.name} throws a ${item.name.toLowerCase()} from the stands!`);
    }
  }

  function settleRace(winnerIndex) {
    const raceKey = `${S.round}-${S.race}`;
    if (settledRaceKey === raceKey) return;
    settledRaceKey = raceKey;

    players.forEach((player) => {
      player.bets
        .filter((bet) => bet.horse === winnerIndex)
        .forEach((bet) => {
          player.money += bet.amount + bet.amount * bet.odds;
        });
    });
  }

  function rankingPlayers() {
    if (HD.Network?.isConnected()) return [];
    return players.map((player) => ({
      id: player.id,
      name: player.name,
      money: Math.round(player.money),
      online: false,
    }));
  }

  function transferTargets() {
    return players.map((player) => ({ id: player.id, name: player.name }));
  }

  function receiveTransfer(id, money, itemId) {
    const player = players.find((candidate) => candidate.id === id);
    if (!player) return false;
    player.money += money;
    if (itemId && player.inventory[itemId] !== undefined) player.inventory[itemId]++;
    return true;
  }

  return {
    init,
    update,
    prepareRace,
    settleRace,
    resetMatch,
    rankingPlayers,
    transferTargets,
    receiveTransfer,
  };
})();
