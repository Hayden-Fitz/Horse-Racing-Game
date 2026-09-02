"use strict";

HD.AI = (() => {
  const S = HD.state;
  const C = HD.CONFIG;
  const names = ["Maya", "Dex", "Rin", "Sol", "Nia", "Bo", "Kit"];
  const personalities = [
    "conservative",
    "highRoller",
    "chaos",
    "underdog",
    "saboteur",
    "chaos",
    "conservative",
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
      money: 200,
      personality: personalities[index],
      bets: [],
      betDelay: 2 + index * 1.7,
      liveBetAt: 4.5 + (index % 4) * 1.3,
      throwAt: 6.5 + index * 1.8,
      openingBetPlaced: false,
      liveBetPlaced: false,
      throwMade: false,
      inventory: {
        ...HD.createInventory(),
        hotdog: 2,
        soda: 1,
        carrot: personalities[index] === "conservative" ? 1 : 0,
      },
      destination: null,
      route: [],
      routeMode: "seat",
      shopVisited: false,
      activityTimer: 0,
      patrolStep: 0,
      sabotageMade: false,
      requestMade: false,
    }));
    activeRaceKey = "";
    settledRaceKey = "";
    S.aiPlayers = players;
    players.forEach((player, index) => {
      HD.Models.setPlayerNameTag(HD.world.players?.[index], player.name);
    });
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
      player.requestMade = false;
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
        if (!player.requestMade && bettingElapsed >= 20 + index * 1.3) {
          maybeRequestFromPlayer(player, index);
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
    const startOnUpperFloor = start.y > 14;
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
      standingRootY(C.grandstandBaseHeight + row * 1.5),
    );
    const lower = ovalPoint(78.5, 48, stairAngle, standingRootY(1.65));
    const upper = ovalPoint(104.5, 70.5, stairAngle, standingRootY(13.5));
    const rowHeight = standingRootY(C.grandstandBaseHeight + row * 1.5);
    const walkwayHeight = standingRootY(1.65);
    const upperHeight = standingRootY(13.5);
    if (mode === "seat") {
      return startOnUpperFloor
        ? [upper, lower, ...ovalArc(82.1 + row * 3.25, 51.85 + row * 2.75, rowHeight, stairAngle, seatAngle), seat.clone()]
        : startOnWalkway
          ? [...ovalArc(78.5, 48, walkwayHeight, Math.atan2(start.z, start.x), stairAngle), lower, rowAtStairs, ...ovalArc(82.1 + row * 3.25, 51.85 + row * 2.75, rowHeight, stairAngle, seatAngle), seat.clone()]
          : [...ovalArc(82.1 + row * 3.25, 51.85 + row * 2.75, rowHeight, Math.atan2(start.z, start.x), seatAngle), seat.clone()];
    }
    if (mode === "walkway") {
      return startOnUpperFloor
        ? [upper, lower, ...ovalArc(78.5, 48, walkwayHeight, stairAngle, seatAngle)]
        : [...ovalArc(82.1 + row * 3.25, 51.85 + row * 2.75, rowHeight, seatAngle, stairAngle), rowAtStairs, lower, ...ovalArc(78.5, 48, walkwayHeight, stairAngle, seatAngle)];
    }

    const shops = HD.world.shopPositions || [];
    const shop = shops[index % Math.max(1, shops.length)];
    const shopPoint = shop
      ? new THREE.Vector3(shop.x, upperHeight, shop.z).addScaledVector(
          new THREE.Vector3(shop.x, 0, shop.z).normalize(),
          -5.2,
        )
      : ovalPoint(110, 74, stairAngle + Math.PI / 4, upperHeight);
    const shopAngle = Math.atan2(shopPoint.z, shopPoint.x);
    return startOnUpperFloor
      ? [...ovalArc(110, 74, upperHeight, Math.atan2(start.z, start.x), shopAngle), shopPoint]
      : startOnWalkway
        ? [...ovalArc(78.5, 48, walkwayHeight, Math.atan2(start.z, start.x), stairAngle), lower, upper, ...ovalArc(110, 74, upperHeight, stairAngle, shopAngle), shopPoint]
        : [...ovalArc(82.1 + row * 3.25, 51.85 + row * 2.75, rowHeight, seatAngle, stairAngle), rowAtStairs, lower, upper, ...ovalArc(110, 74, upperHeight, stairAngle, shopAngle), shopPoint];
  }

  function standingRootY(surfaceY) {
    return surfaceY + C.eyeHeight - C.characterEyeOffset;
  }

  function upperPatrolRoute(index, player) {
    player.patrolStep++;
    const angle = ((index * 0.72 + player.patrolStep * 0.38) % (Math.PI * 2));
    const avatar = HD.world.players?.[index];
    return ovalArc(
      110,
      74,
      standingRootY(13.5),
      Math.atan2(avatar.position.z, avatar.position.x),
      angle,
    );
  }

  function walkwayPatrolRoute(index, player) {
    player.patrolStep++;
    const angle = ((index * 0.78 + player.patrolStep * 0.25) % (Math.PI * 2));
    const avatar = HD.world.players?.[index];
    return ovalArc(
      78.5,
      48,
      standingRootY(1.65),
      Math.atan2(avatar.position.z, avatar.position.x),
      angle,
    );
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
    const sabotageChance = player.personality === "saboteur"
      ? 0.86
      : player.personality === "chaos"
        ? 0.48
        : 0.2;
    if (player.money < 70 || Math.random() > sabotageChance) return;
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
    const reserve = Math.max(25, Math.floor(player.money * 0.35));
    const options = Object.entries(C.items)
      .filter(([, item]) => {
        const price = Math.ceil(item.price * (1 - C.vendorDiscount));
        return player.money - price >= reserve;
      });
    if (!options.length) return;

    const preferredItems = player.personality === "conservative"
      ? ["performanceOats", "carrot", "hurdle"]
      : player.personality === "underdog"
        ? ["soda", "hotdog", "hurdle"]
        : ["airHorn", "horseshoe", "hurdle"];
    const preferred = preferredItems
      .map((itemId) => options.find(([candidateId]) => candidateId === itemId))
      .find(Boolean);
    const [itemId, item] = preferred || options[(player.name.length + S.round) % options.length];
    const price = Math.ceil(item.price * (1 - C.vendorDiscount));
    player.money -= price;
    player.inventory[itemId] += 1;
    HD.UI.renderLeaderboard?.();
  }

  function placeBet(player, live) {
    const horseIndex = chooseHorse(player, live);
    const horse = S.horses[horseIndex]?.userData.data;
    if (!horse) return;

    const confidence = player.personality === "highRoller"
      ? 0.24
      : player.personality === "conservative"
        ? 0.08
        : player.personality === "underdog"
          ? 0.12
          : 0.14;
    const bankrollStake = Math.floor((player.money * confidence) / 5) * 5;
    const desiredStake = live
      ? Math.max(5, Math.min(60, Math.floor((bankrollStake * 0.7) / 5) * 5))
      : Math.max(10, Math.min(90, bankrollStake + (horseIndex % 3) * 5));
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
      if (player.personality === "underdog") score += data.odds * 0.16;
      if (player.personality === "conservative") score += data.resistanceRating * 0.012;
      if (player.personality === "highRoller") score += data.speedRating * 0.011;
      if (player.personality === "chaos") score += Math.sin(index * 5.3 + S.race) * 1.7;
      if (live) score += data.progress * 4.5;
      return { index, score };
    });
    entries.sort((first, second) => second.score - first.score);
    const choiceRange = player.personality === "conservative" ? 2 : 4;
    const choice = (player.name.length + S.race) % choiceRange;
    return entries[Math.min(choice, entries.length - 1)].index;
  }

  function throwAtRace(player, playerIndex) {
    player.throwMade = true;
    const backedHorse = player.bets[0]?.horse ?? chooseHorse(player, true);
    const raceOrder = [...S.horses]
      .map((horse, index) => ({ index, progress: horse.userData.data.progress }))
      .sort((first, second) => second.progress - first.progress);
    const supportFavorite = player.personality === "conservative" ||
      player.personality === "highRoller" ||
      playerIndex % 3 === 0;
    const targetIndex = supportFavorite
      ? backedHorse
      : raceOrder.find((entry) => entry.index !== backedHorse)?.index ?? backedHorse;
    const ownedItems = Object.keys(player.inventory)
      .filter((type) => player.inventory[type] > 0);
    const helpfulItems = new Set(["carrot", "performanceOats"]);
    const suitableItems = supportFavorite
      ? ownedItems
      : ownedItems.filter((type) => !helpfulItems.has(type));
    const totalOwned = ownedItems.reduce(
      (total, type) => total + player.inventory[type],
      0,
    );
    const shouldSave = S.race < C.totalRaces &&
      totalOwned <= 2 &&
      (playerIndex + S.race) % 3 !== 0;
    if (shouldSave || !suitableItems.length) return;
    const itemType = supportFavorite && player.inventory.performanceOats > 0
      ? "performanceOats"
      : supportFavorite && player.inventory.carrot > 0
        ? "carrot"
        : suitableItems[(playerIndex + S.race) % suitableItems.length];
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

  function requestTransfer(id, money, itemId) {
    const player = players.find((candidate) => candidate.id === id);
    if (!player || (!money && !itemId)) return false;
    window.setTimeout(() => {
      const canPayMoney = !money || player.money >= money;
      const canSendItem = !itemId || player.inventory[itemId] > 0;
      const accepts = canPayMoney && canSendItem && Math.random() > 0.28;
      if (accepts) {
        player.money -= money;
        S.money += money;
        if (itemId) {
          player.inventory[itemId]--;
          S.inventory[itemId]++;
        }
        HD.UI.receiveTrackPayTransfer?.({
          fromName: player.name,
          money,
          itemId,
        });
        HD.UI.addLedger(`TrackPay from ${player.name}`, money);
        HD.UI.render();
      } else {
        HD.UI.receiveTrackPayResponse?.({
          fromName: player.name,
          accepted: false,
        });
      }
    }, 700 + Math.random() * 900);
    return true;
  }

  function maybeRequestFromPlayer(player, index) {
    player.requestMade = true;
    if ((index + S.race) % 4 !== 1) return;
    const wantsItem = index % 2 === 0;
    const itemId = wantsItem ? (index % 3 === 0 ? "hotdog" : "soda") : "";
    HD.UI.receiveTrackPayRequest?.({
      id: `ai-request-${S.round}-${S.race}-${player.id}`,
      fromId: player.id,
      fromName: player.name,
      money: wantsItem ? 0 : 10 + (index % 3) * 5,
      itemId,
    });
  }

  function respondToTransferRequest(request, accepted) {
    if (!accepted) return true;
    const money = Math.max(0, Math.floor(Number(request.money) || 0));
    if (money > S.money) return false;
    if (request.itemId && !S.inventory[request.itemId]) return false;
    const player = players.find((candidate) => candidate.id === request.fromId);
    if (!player) return false;
    S.money -= money;
    player.money += money;
    if (request.itemId) {
      S.inventory[request.itemId]--;
      player.inventory[request.itemId]++;
    }
    HD.UI.addLedger(`TrackPay to ${player.name}`, -money);
    HD.Audio?.cue?.("moneySpend");
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
    requestTransfer,
    respondToTransferRequest,
  };
})();
