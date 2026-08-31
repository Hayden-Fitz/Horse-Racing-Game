"use strict";
HD.Race = (() => {
  const S = HD.state,
    C = HD.CONFIG;
  const MIN_LANE_GAP = 0.82;
  const MIN_PROGRESS_GAP = 0.018;
  let networkSettlement = "";
  let lastNetworkUi = -1;

  // ---------------------------------------------------------------------------
  // Horse lifecycle and three-lap simulation
  // ---------------------------------------------------------------------------

  function resetHorses() {
    S.horses.forEach((h) => HD.world.scene.remove(h));
    if (
      S.activeHorseIds.length !== C.raceHorseCount ||
      S.horseFieldRacesRemaining <= 0
    ) {
      drawHorseField();
    }
    const field = S.activeHorseIds.map((horseId) => {
      return C.horses.find((horse) => horse.id === horseId);
    });
    S.horses = field.map(HD.Models.horse);
    S.horses.forEach((h) => HD.world.scene.add(h));
    S.finishOrder = [];
    positionHorses();
  }

  function drawHorseField() {
    if (S.activeHorseIds.length) {
      S.horseBag.push(...S.activeHorseIds);
    }
    S.horseBag = [...new Set(S.horseBag)].filter((horseId) => {
      return C.horses.some((horse) => horse.id === horseId);
    });
    if (S.horseBag.length < C.raceHorseCount) {
      S.horseBag = C.horses.map((horse) => horse.id);
    }
    shuffle(S.horseBag);
    S.activeHorseIds = S.horseBag.splice(0, C.raceHorseCount);
    S.horseFieldRacesRemaining = C.horseFieldRaces;
  }

  function shuffle(values) {
    for (let index = values.length - 1; index > 0; index--) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
    }
    return values;
  }
  function trackPoint(progress, lane = 0) {
    const lapProgress = progress % 1;
    const a = lapProgress * Math.PI * 2,
      rx = 50.5 + lane * 2.85,
      rz = 23 + lane * 2.68;
    return {
      position: new THREE.Vector3(Math.cos(a) * rx, 0.75, Math.sin(a) * rz),
      angle: Math.atan2(-Math.cos(a) * rz, -Math.sin(a) * rx),
    };
  }
  function positionHorses() {
    S.horses.forEach((horse, i) => {
      const d = horse.userData.data;
      const angle = (d.progress % 1) * Math.PI * 2;
      const radiusX = 50.5 + d.lane * 2.85;
      const radiusZ = 23 + d.lane * 2.68;
      horse.position.set(
        Math.cos(angle) * radiusX,
        0.75,
        Math.sin(angle) * radiusZ,
      );
      horse.rotation.y = Math.atan2(
        -Math.cos(angle) * radiusZ,
        -Math.sin(angle) * radiusX,
      );
      const movement = THREE.MathUtils.clamp(d.motionSpeed / Math.max(0.001, d.baseSpeed), 0, 1.35);
      const gallop =
        S.phase === "racing" && !d.finished ? Math.sin(S.elapsed * 14 + i) * movement : 0;
      const tumble = d.ragdoll > 0 ? Math.sin(S.elapsed * 15) : 0;
      horse.userData.body.position.x = 0;
      horse.userData.body.position.y = d.ragdoll > 0
        ? 0.55
        : Math.abs(gallop) * 0.28;
      horse.userData.body.rotation.x = d.ragdoll > 0 ? tumble * 1.15 : 0;
      horse.userData.body.rotation.z = d.ragdoll > 0
        ? 1.15 + tumble * 0.35
        : 0;
      if (horse.userData.tail) {
        horse.userData.tail.rotation.z = -0.8 + gallop * 0.18;
      }
      horse.userData.ears.forEach((ear) => {
        ear.rotation.z = -0.3;
      });
      if (horse.userData.jockey) {
        horse.userData.jockey.position.y = 3.2 + Math.abs(gallop) * 0.12;
      }
      horse.userData.legs.forEach((leg) => {
        leg.rotation.z = gallop * 0.6 * Math.cos(leg.userData.phase);
      });
    });
  }
  function begin() {
    if (S.phase !== "betting") return;
    S.phase = "racing";
    S.raceTime = 0;
    const sabotageReport = resolveSabotage();
    S.raceAnnouncement =
      sabotageReport || `They're off! Live betting remains open for ${C.liveBettingDuration} seconds.`;
    HD.UI.countdown("GO!");
    HD.UI.announce(S.raceAnnouncement);
    setTimeout(() => HD.UI.countdown(""), 700);
    HD.UI.render();
  }
  function purchaseSabotage(horseIndex, optionId) {
    if (S.phase !== "betting") return HD.UI.announce("The fixer only works before the race.");
    if (S.sabotagePlans.length) return HD.UI.announce("You already hired a fixer this race.");
    const option = C.sabotageOptions[optionId];
    if (!option) return;
    if (S.money < option.price) return HD.UI.announce(`The fixer needs $${option.price}.`);

    S.money -= option.price;
    S.sabotagePlans.push({ horse: horseIndex, optionId });
    HD.Network?.sendSabotage(horseIndex, optionId);
    HD.UI.addLedger(`Secret fixer: #${horseIndex + 1}`, -option.price);
    HD.UI.announce("The fixer accepted the job. The outcome remains sealed until race start.");
    HD.UI.render();
  }

  function resolveSabotage() {
    if (!S.sabotagePlans.length) return "";
    const reports = S.sabotagePlans.map((plan) => {
      const horse = S.horses[plan.horse];
      const option = C.sabotageOptions[plan.optionId];
      const failed = Math.random() < C.sabotageFailureChance;
      plan.failed = failed;
      plan.resolved = true;

      if (failed) return `attempt on #${plan.horse + 1} failed`;
      if (option.startDelay) {
        horse.userData.data.startDelay = option.startDelay;
        return `#${plan.horse + 1} will leave ${option.startDelay}s late`;
      }
      horse.userData.data.sabotagePenalty = Math.min(
        0.65,
        horse.userData.data.sabotagePenalty + option.penalty,
      );
      const percent = Math.round(option.penalty * 100);
      return `#${plan.horse + 1} carries a permanent ${percent}% slowdown`;
    });
    return `PADDOCK ALERT: ${reports.join("; ")}. They're off!`;
  }

  function addNetworkSabotage(sabotage) {
    if (!sabotage || !Number.isInteger(sabotage.horse)) return;
    if (!S.horses[sabotage.horse] || !C.sabotageOptions[sabotage.optionId]) return;
    if (S.phase !== "betting") return;
    S.sabotagePlans.push({
      horse: sabotage.horse,
      optionId: sabotage.optionId,
      remote: true,
    });
  }
  function update(dt) {
    if (HD.Network?.isConnected() && !HD.Network.isHost()) {
      updateNetworkHorses(dt);
      return;
    }
    if (S.phase !== "racing") return;
    const bookWasOpen = S.raceTime < C.liveBettingDuration;
    S.raceTime += dt;
    if (bookWasOpen && S.raceTime >= C.liveBettingDuration) {
      HD.UI.announce("The live betting book is closed!");
      HD.UI.render();
    }
    const leaderProgress = Math.max(...S.horses.map((horse) => horse.userData.data.progress));

    S.horses.forEach((horse, i) => {
      const d = horse.userData.data;
      if (d.finished) return;
      d.slow = Math.max(0, d.slow - dt);
      d.ragdoll = Math.max(0, (d.ragdoll || 0) - dt);
      d.boost = Math.max(0, (d.boost || 0) - dt);
      d.resistance = Math.max(0, (d.resistance || 0) - dt);
      if (S.raceTime < d.startDelay) {
        d.speed = 0;
        d.momentum = 0;
        d.motionSpeed = 0;
        return;
      }
      const raceFraction = THREE.MathUtils.clamp(d.progress / C.raceLaps, 0, 1);
      const gateAcceleration = 0.72 + Math.min(1, S.raceTime / 3.5) * 0.28;
      const earlyPace = raceFraction < 0.3 ? d.earlyPace : 1;
      const lateRace = THREE.MathUtils.smoothstep(raceFraction, 0.65, 1);
      const fatiguePenalty = 0.055 - (d.stamina - 1) * 0.35;
      const stamina = 1 - lateRace * fatiguePenalty;
      const lateFieldSeparation = 1 + (d.ability - 0.96) * lateRace * 0.08;
      const finishingKick =
        1 + THREE.MathUtils.smoothstep(raceFraction, 0.8, 0.96) * d.finishKick;
      const distanceBehind = leaderProgress - d.progress;
      const drafting = distanceBehind > 0.004 && distanceBehind < 0.028 ? 1.012 : 1;
      const naturalStride =
        Math.sin(S.raceTime * (0.65 + i * 0.035) + i * 1.9) * 0.0012 +
        Math.sin(S.raceTime * 1.7 + i * 0.7) * 0.0007;
      const targetSpeed =
        d.baseSpeed *
          gateAcceleration *
          earlyPace *
          stamina *
          lateFieldSeparation *
          finishingKick *
          drafting *
          (1 - d.sabotagePenalty) +
        naturalStride;

      const accelerating = targetSpeed > d.speed;
      const response = accelerating ? d.acceleration : d.deceleration;
      d.speed += (targetSpeed - d.speed) * Math.min(1, dt * response);
      d.momentum = THREE.MathUtils.lerp(
        d.momentum,
        d.speed,
        Math.min(1, dt * (accelerating ? 1.8 : 2.8)),
      );
      if (S.raceTime > 2.5) {
        const laneChangeRate = d.passing ? 0.9 : 0.32;
        d.lane += (d.targetLane - d.lane) * Math.min(1, dt * laneChangeRate);
      }

      const statusMultiplier = d.ragdoll > 0 ? 0.02 : d.slow > 0 ? 0.35 : d.boost > 0 ? 1.45 : 1;
      d.motionSpeed = Math.max(0, d.momentum * statusMultiplier);
    });

    applyHorseTraffic(dt);

    S.horses.forEach((horse) => {
      const d = horse.userData.data;
      if (d.finished) return;
      d.progress += d.motionSpeed * dt;
      if (d.progress >= C.raceLaps) {
        d.finished = true;
        d.place = S.finishOrder.length + 1;
        S.finishOrder.push(d.index);
        if (d.place === 1) HD.UI.announce(`${d.name} crosses the line first!`);
      }
    });
    if (S.raceTime - S.lastOdds > 0.6) {
      S.lastOdds = S.raceTime;
      updateOdds();
      HD.UI.renderCards();
      HD.UI.renderOddsWatch();
    }
    if (S.finishOrder.length === S.horses.length) finish();
    const currentLeader = Math.max(...S.horses.map((h) => h.userData.data.progress));
    HD.UI.progress(Math.min(1, currentLeader / C.raceLaps));
    positionHorses();
  }

  function applyHorseTraffic(dt) {
    const runners = S.horses
      .filter((horse) => !horse.userData.data.finished)
      .sort((first, second) => second.userData.data.progress - first.userData.data.progress);

    runners.forEach((horse, index) => {
      const data = horse.userData.data;
      const leader = nearestLaneLeader(runners, index, data);
      if (!leader) {
        data.blockedTime = 0;
        data.clearTime += dt;
        if (
          data.passing &&
          data.clearTime > 1.4 &&
          laneIsClear(data.preferredLane, horse, runners)
        ) {
          data.targetLane = data.preferredLane;
          data.passing = false;
        }
        return;
      }

      data.clearTime = 0;
      const leaderData = leader.userData.data;
      const gap = leaderData.progress - data.progress;
      if (gap >= 0.05) {
        data.blockedTime = 0;
        return;
      }

      const allowedSpeed =
        gap <= MIN_PROGRESS_GAP + 0.002
          ? leaderData.motionSpeed * 0.9
          : leaderData.motionSpeed + (gap - MIN_PROGRESS_GAP) * 0.32;
      const previousSpeed = data.motionSpeed;
      data.motionSpeed = Math.min(data.motionSpeed, Math.max(0, allowedSpeed));

      if (data.motionSpeed + 0.001 < previousSpeed) data.blockedTime += dt;
      else data.blockedTime = Math.max(0, data.blockedTime - dt * 0.5);

      if (data.blockedTime > 0.35) choosePassingLane(horse, runners);
    });

    enforceHorseSeparation(runners);
  }

  function nearestLaneLeader(runners, runnerIndex, data) {
    let nearest = null;
    let nearestGap = Infinity;

    for (let index = 0; index < runnerIndex; index++) {
      const candidate = runners[index];
      const candidateData = candidate.userData.data;
      const gap = candidateData.progress - data.progress;
      if (
        Math.abs(candidateData.lane - data.lane) >= MIN_LANE_GAP ||
        gap < 0 ||
        gap >= nearestGap
      ) {
        continue;
      }
      nearest = candidate;
      nearestGap = gap;
    }

    return nearest;
  }

  function choosePassingLane(horse, runners) {
    const data = horse.userData.data;
    const roundedLane = Math.round(data.lane);
    const directions = data.index % 2 ? [-1, 1] : [1, -1];

    for (const direction of directions) {
      const candidateLane = roundedLane + direction;
      if (candidateLane < 0 || candidateLane >= C.raceHorseCount) continue;
      const clear = laneIsClear(candidateLane, horse, runners);
      if (!clear) continue;

      data.targetLane = candidateLane;
      data.passing = true;
      data.blockedTime = 0;
      return;
    }
  }

  function laneIsClear(candidateLane, horse, runners) {
    const data = horse.userData.data;
    return runners.every((other) => {
      if (other === horse) return true;
      const otherData = other.userData.data;
      const laneClear = Math.abs(otherData.lane - candidateLane) >= MIN_LANE_GAP;
      const progressClear = Math.abs(otherData.progress - data.progress) >= 0.055;
      return laneClear || progressClear;
    });
  }

  function enforceHorseSeparation(runners) {
    runners.forEach((horse, index) => {
      const data = horse.userData.data;
      for (let leaderIndex = 0; leaderIndex < index; leaderIndex++) {
        const leaderData = runners[leaderIndex].userData.data;
        if (Math.abs(leaderData.lane - data.lane) >= MIN_LANE_GAP) continue;
        const maximumProgress = leaderData.progress - MIN_PROGRESS_GAP;
        if (data.progress <= maximumProgress) continue;

        data.progress = maximumProgress;
        data.motionSpeed = Math.min(data.motionSpeed, leaderData.motionSpeed);
      }
    });
  }
  function updateOdds() {
    [...S.horses]
      .sort((a, b) => b.userData.data.progress - a.userData.data.progress)
      .forEach((horse, rank) => {
        const d = horse.userData.data;
        if (!d.finished)
          d.odds = Math.max(
            1,
            Math.round(1.5 + rank * 2.3 + (1 - Math.min(1, d.progress / C.raceLaps)) * rank),
          );
      });
  }

  // ---------------------------------------------------------------------------
  // Race, round, and day progression
  // ---------------------------------------------------------------------------

  function finish() {
    S.phase = "finished";
    S.horseFieldRacesRemaining = Math.max(
      0,
      S.horseFieldRacesRemaining - 1,
    );
    const winner = S.finishOrder[0];
    const winnerData = S.horses[winner].userData.data;
    const winningTickets = S.bets.filter((bet) => bet.horse === winner);
    const returnedStake = winningTickets.reduce((total, bet) => total + bet.amount, 0);
    const profit = winningTickets.reduce((total, bet) => total + bet.amount * bet.odds, 0);
    const payout = returnedStake + profit;
    if (payout) {
      S.money += payout;
      HD.UI.addLedger(`Race ${S.race} payout`, payout);
    }
    HD.Controls.setMode("look");
    HD.UI.showRaceWinner(`#${winner + 1} ${winnerData.name} WINS!`);
    HD.UI.render();
    if (HD.Network?.isConnected()) setTimeout(next, 350);
    else next();
  }
  function next() {
    if (HD.Network?.isConnected() && !HD.Network.isHost()) {
      return HD.UI.announce("Waiting for the lobby host to continue.");
    }
    HD.UI.hideResult();
    if (S.race >= C.totalRaces) return finishMatch();
    const roundComplete = S.race % C.racesPerRound === 0;
    if (roundComplete) return startRoundBreak();

    S.race++;
    prepareRace();
    HD.UI.announce("Thirty seconds until the next race. Study the field!");
  }
  function prepareRace() {
    Object.assign(S, {
      selected: 0,
      bets: [],
      phase: "betting",
      timer: C.preparationDuration,
      raceTime: 0,
      lastOdds: 0,
      sabotagePlans: [],
      raceAnnouncement: "",
    });
    clearProjectiles();
    resetHorses();
    HD.UI.countdown(String(C.preparationDuration));
    HD.UI.progress(0);
    HD.UI.render();
  }
  function startRoundBreak() {
    S.phase = "roundBreak";
    S.timer = C.roundBreakDuration;
    HD.UI.countdown("");
    HD.UI.showRoundBreak(true);
    HD.UI.updateBreakTimer(S.timer);
    HD.UI.showRankings(true, `DAY ${S.round} FINAL STANDINGS`);
    HD.Controls.forceStand();
    HD.UI.announce("Round complete! One minute to visit the cheaper upper-concourse shops.");
  }
  function updateIntermission(dt) {
    if (HD.Network?.isConnected() && !HD.Network.isHost()) return;
    if (S.phase !== "roundBreak") return;
    S.timer -= dt;
    HD.UI.updateBreakTimer(S.timer);
    if (S.timer > 0) return;

    S.phase = "dayTransition";
    HD.UI.showRoundBreak(false);
    HD.Controls.sitDown();
    const nextRound = S.round + 1;
    HD.UI.showDay(nextRound, () => {
      S.round = nextRound;
      S.race++;
      const bonus = C.roundBonuses[nextRound - 1];
      S.money += bonus;
      HD.UI.addLedger(`Day ${nextRound} bankroll`, bonus);
      prepareRace();
      HD.UI.announce(`Day ${nextRound} begins. $${bonus} added to your wallet.`);
    });
  }
  function finishMatch() {
    S.phase = "matchOver";
    const verdict =
      S.money >= 500
        ? "The bookmakers fear you."
        : S.money >= 100
          ? "A respectable day at the track."
          : "Maybe avoid the ATM.";
    HD.UI.showResult(
      "Match complete!",
      `You leave Hotdog Downs with $${S.money}. ${verdict}`,
      "PLAY AGAIN",
    );
    HD.UI.showRankings(true, "FINAL MATCH RANKINGS");
    setTimeout(() => HD.Network?.claimMatchWinReward?.(), 600);
  }
  function restart() {
    if (HD.Network?.isConnected() && !HD.Network.isHost()) {
      return HD.UI.announce("Waiting for the lobby host to restart the match.");
    }
    Object.assign(S, {
      money: 100,
      inventory: HD.createInventory(),
      round: 1,
      race: 1,
      selected: 0,
      bets: [],
      ledger: [],
      deliveries: [],
      phase: "betting",
      timer: C.preparationDuration,
      raceTime: 0,
      lastOdds: 0,
      sabotagePlans: [],
      raceAnnouncement: "",
      matchStarted: true,
      activeHorseIds: [],
      horseFieldRacesRemaining: 0,
      horseBag: C.horses.map((horse) => horse.id),
    });
    clearProjectiles();
    resetHorses();
    HD.UI.hideResult();
    HD.UI.showRoundBreak(false);
    HD.Controls.sitDown();
    HD.UI.countdown(String(C.preparationDuration));
    HD.UI.progress(0);
    HD.UI.addLedger("Round 1 bankroll", 100);
    HD.UI.announce("A fresh day at Hotdog Downs!");
    HD.UI.render();
  }
  function launch(type, start, velocity, options = {}) {
    const itemConfig = C.items[type];
    if (!itemConfig) return;
    const item = HD.Models.throwable(type);
    item.position.copy(start);
    item.scale.setScalar(1.25);
    HD.world.scene.add(item);
    S.projectiles.push({
      mesh: item,
      type,
      config: itemConfig,
      position: start.clone(),
      velocity: velocity.clone(),
      age: 0,
      visualOnly: Boolean(options.visualOnly),
    });
    if (options.consume !== false) {
      S.inventory[type] = Math.max(0, S.inventory[type] - 1);
      HD.UI.render();
    }
  }

  function launchNetwork(throwData, authoritative) {
    if (!throwData || !C.items[throwData.type]) return;
    if (!validVector(throwData.start) || !validVector(throwData.velocity)) return;
    launch(
      throwData.type,
      new THREE.Vector3().fromArray(throwData.start),
      new THREE.Vector3().fromArray(throwData.velocity),
      { consume: false, visualOnly: !authoritative },
    );
  }

  function validVector(value) {
    return Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
  }

  // ---------------------------------------------------------------------------
  // Throwable physics and horse effects
  // ---------------------------------------------------------------------------

  function updateProjectiles(dt) {
    S.projectiles.forEach((p) => {
      p.age += dt;
      if (!p.grounded) p.velocity.y -= p.config.gravity * dt;
      p.position.addScaledVector(p.velocity, dt);
      p.mesh.position.copy(p.position);
      p.mesh.rotation.x += dt * (4 + Math.abs(p.velocity.z) * 0.35);
      p.mesh.rotation.z += dt * (4 + Math.abs(p.velocity.x) * 0.35);

      let closest;
      let distance = Infinity;
      if (!p.visualOnly) {
        S.horses.forEach((horse) => {
          const deltaX = horse.position.x - p.position.x;
          const deltaY = horse.position.y + 2.2 - p.position.y;
          const deltaZ = horse.position.z - p.position.z;
          const distanceSquared = deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ;
          if (distanceSquared < distance) {
            distance = distanceSquared;
            closest = horse;
          }
        });
      }

      if (!p.impacted && distance < 5.2 * 5.2) {
        p.impacted = true;
        applyItemEffect(closest, p);
        p.velocity.multiplyScalar(0.38);
        p.velocity.y = Math.max(2.5, p.velocity.y * -0.3);
      } else if (p.position.y <= 0.5) {
        p.position.y = 0.5;
        p.mesh.position.y = 0.5;
        if (!p.visualOnly && !p.landed && !p.impacted) {
          HD.UI.announce(`Miss! The ${p.config.name.toLowerCase()} lands in the dirt.`);
        }
        if (!p.landed) createGroundEffect(p);
        p.landed = true;

        if (Math.abs(p.velocity.y) > 1.2) {
          p.velocity.y *= -0.34;
          p.velocity.x *= 0.72;
          p.velocity.z *= 0.72;
        } else {
          p.velocity.y = 0;
          p.velocity.x *= Math.pow(0.08, dt);
          p.velocity.z *= Math.pow(0.08, dt);
          p.grounded = p.velocity.lengthSq() < 0.16;
          if (p.grounded) p.velocity.set(0, 0, 0);
        }
      }
    });

    S.projectiles.filter((p) => p.age >= 18).forEach((p) => {
      HD.world.scene.remove(p.mesh);
      if (p.groundEffect) HD.world.scene.remove(p.groundEffect);
    });
    S.projectiles = S.projectiles.filter((p) => p.age < 18);
  }
  function createGroundEffect(projectile) {
    const effects = {
      soda: { color: 0x6e351e, radius: 1.8, opacity: 0.72 },
      nachos: { color: 0xe39a21, radius: 1.45, opacity: 0.82 },
      waterBottle: { color: 0x8ad7e8, radius: 1.2, opacity: 0.45 },
    };
    const effect = effects[projectile.type];
    if (!effect) return;

    const geometry = new THREE.CylinderGeometry(effect.radius, effect.radius * 0.8, 0.04, 18);
    const material = new THREE.MeshStandardMaterial({
      color: effect.color,
      roughness: 0.35,
      transparent: true,
      opacity: effect.opacity,
    });
    const spill = new THREE.Mesh(geometry, material);
    spill.position.set(projectile.position.x, 0.18, projectile.position.z);
    spill.scale.z = 0.65;
    spill.receiveShadow = true;
    HD.world.scene.add(spill);
    projectile.groundEffect = spill;
  }
  function applyItemEffect(horse, projectile) {
    const data = horse.userData.data;
    const item = projectile.config;

    if (item.boostDuration) {
      data.boost = item.boostDuration;
      data.resistance = item.resistanceDuration;
      data.momentum = Math.max(data.momentum, data.baseSpeed * 1.12);
      HD.UI.announce(`${data.name} gets a turbo boost and resistance!`);
      return;
    }

    const resistance = data.resistance > 0 ? 0.25 : 1;
    if (item.slowDuration) {
      data.slow = item.slowDuration * resistance;
      data.momentum *= 0.72 + (1 - resistance) * 0.2;
    }
    if (item.ragdollDuration) {
      data.ragdoll = item.ragdollDuration * resistance;
      data.momentum *= 0.28 + (1 - resistance) * 0.35;
    }

    const outcome = resistance < 1
      ? " partially resists it!"
      : item.ragdollDuration
        ? " tumbles from the hit!"
        : " is slowed down!";
    HD.UI.announce(`${item.name} connects — ${data.name}${outcome}`);
  }
  function clearProjectiles() {
    S.projectiles.forEach((p) => {
      HD.world.scene.remove(p.mesh);
      if (p.groundEffect) HD.world.scene.remove(p.groundEffect);
    });
    S.projectiles = [];
  }

  function networkSnapshot() {
    return {
      phase: S.phase,
      race: S.race,
      round: S.round,
      raceTime: S.raceTime,
      timer: S.timer,
      finishOrder: [...S.finishOrder],
      announcement: S.raceAnnouncement,
      activeHorseIds: [...S.activeHorseIds],
      horseFieldRacesRemaining: S.horseFieldRacesRemaining,
      horses: S.horses.map((horse) => {
        const data = horse.userData.data;
        return {
          progress: data.progress,
          lane: data.lane,
          targetLane: data.targetLane,
          speed: data.speed,
          momentum: data.momentum,
          motionSpeed: data.motionSpeed,
          slow: data.slow,
          ragdoll: data.ragdoll,
          boost: data.boost,
          resistance: data.resistance,
          sabotagePenalty: data.sabotagePenalty,
          startDelay: data.startDelay,
          odds: data.odds,
          finished: data.finished,
          place: data.place,
        };
      }),
    };
  }

  function applyNetworkSnapshot(snapshot) {
    if (!snapshot || !Array.isArray(snapshot.horses)) return;
    const incomingHorseIds = Array.isArray(snapshot.activeHorseIds)
      ? snapshot.activeHorseIds
      : [];
    const validHorseField = incomingHorseIds.length === C.raceHorseCount &&
      new Set(incomingHorseIds).size === C.raceHorseCount &&
      incomingHorseIds.every((horseId) => {
        return C.horses.some((horse) => horse.id === horseId);
      });
    const fieldChanged = validHorseField &&
      incomingHorseIds.join("|") !== S.activeHorseIds.join("|");
    if (fieldChanged) {
      S.activeHorseIds = [...incomingHorseIds];
      S.horseFieldRacesRemaining = Number(
        snapshot.horseFieldRacesRemaining,
      ) || 1;
      resetHorses();
    }
    if (snapshot.horses.length !== S.horses.length) return;
    const previousPhase = S.phase;
    const previousRace = S.race;
    const previousRound = S.round;
    const raceChanged = snapshot.race !== previousRace || snapshot.round !== previousRound;

    if (snapshot.round > previousRound) {
      const bonus = C.roundBonuses[snapshot.round - 1] || 0;
      S.money += bonus;
      HD.UI.addLedger(`Day ${snapshot.round} bankroll`, bonus);
      HD.UI.showDay(snapshot.round, () => {});
    }
    if (raceChanged) {
      S.selected = 0;
      S.bets = [];
      S.sabotagePlans = [];
      clearProjectiles();
    }
    if (
      previousPhase === "matchOver" &&
      snapshot.phase === "betting" &&
      snapshot.race === 1
    ) {
      S.money = 100;
      S.inventory = HD.createInventory();
      S.ledger = [];
    }
    S.phase = snapshot.phase;
    S.race = snapshot.race;
    S.round = snapshot.round;
    S.raceTime = snapshot.raceTime;
    S.timer = snapshot.timer;
    S.finishOrder = Array.isArray(snapshot.finishOrder) ? [...snapshot.finishOrder] : [];
    S.raceAnnouncement = snapshot.announcement || "";
    if (!fieldChanged && Number.isFinite(snapshot.horseFieldRacesRemaining)) {
      S.horseFieldRacesRemaining = snapshot.horseFieldRacesRemaining;
    }

    snapshot.horses.forEach((networkData, index) => {
      const data = S.horses[index].userData.data;
      data.networkProgress = networkData.progress;
      data.networkLane = networkData.lane;
      [
        "targetLane",
        "speed",
        "momentum",
        "motionSpeed",
        "slow",
        "ragdoll",
        "boost",
        "resistance",
        "sabotagePenalty",
        "startDelay",
        "odds",
        "finished",
        "place",
      ].forEach((key) => {
        if (networkData[key] !== undefined) data[key] = networkData[key];
      });
    });

    handleNetworkPhase(previousPhase);
    HD.UI.countdown(S.phase === "betting" ? Math.max(1, Math.ceil(S.timer)) : "");
    HD.UI.updateBreakTimer(S.timer);
    HD.UI.progress(networkLeaderProgress());
    if (raceChanged || previousPhase !== S.phase || S.elapsed - lastNetworkUi >= 0.5) {
      lastNetworkUi = S.elapsed;
      HD.UI.render();
    }
  }

  function updateNetworkHorses(dt) {
    const blend = 1 - Math.exp(-dt * 15);
    S.horses.forEach((horse) => {
      const data = horse.userData.data;
      if (Number.isFinite(data.networkProgress)) {
        data.progress = THREE.MathUtils.lerp(data.progress, data.networkProgress, blend);
      }
      if (Number.isFinite(data.networkLane)) {
        data.lane = THREE.MathUtils.lerp(data.lane, data.networkLane, blend);
      }
    });
    positionHorses();
  }

  function handleNetworkPhase(previousPhase) {
    const settlementKey = `${S.round}-${S.race}`;
    if (S.phase === "finished" && networkSettlement !== settlementKey) {
      networkSettlement = settlementKey;
      settleNetworkRace();
    }
    if (S.phase === "betting" && previousPhase !== "betting") {
      networkSettlement = "";
      HD.UI.hideResult();
      HD.UI.showRoundBreak(false);
      HD.UI.announce("The lobby host opened the next betting window.");
    }
    if (S.phase === "roundBreak") {
      HD.UI.hideResult();
      HD.UI.showRoundBreak(true);
      if (previousPhase !== "roundBreak") {
        HD.UI.showRankings(true, `DAY ${S.round} FINAL STANDINGS`);
      }
    }
    if (S.phase === "matchOver" && previousPhase !== "matchOver") {
      HD.UI.showResult(
        "Match complete!",
        `You leave Hotdog Downs with $${S.money}.`,
        "WAITING FOR HOST",
      );
      setTimeout(() => HD.Network?.claimMatchWinReward?.(), 600);
    }
    if (S.phase === "racing" && previousPhase === "betting") {
      HD.UI.announce(
        S.raceAnnouncement || "They're off! Race movement is synchronized by the lobby host.",
      );
    }
  }

  function settleNetworkRace() {
    const winner = S.finishOrder[0];
    if (!Number.isInteger(winner)) return;
    const winningTickets = S.bets.filter((bet) => bet.horse === winner);
    const returnedStake = winningTickets.reduce((total, bet) => total + bet.amount, 0);
    const profit = winningTickets.reduce((total, bet) => total + bet.amount * bet.odds, 0);
    const payout = returnedStake + profit;
    if (payout) {
      S.money += payout;
      HD.UI.addLedger(`Race ${S.race} payout`, payout);
    }
    HD.Controls.setMode("look");
    HD.UI.showRaceWinner(
      `#${winner + 1} ${S.horses[winner].userData.data.name} WINS!`,
    );
  }

  function networkLeaderProgress() {
    const leader = Math.max(...S.horses.map((horse) => horse.userData.data.progress));
    return Math.min(1, leader / C.raceLaps);
  }
  return {
    resetHorses,
    begin,
    update,
    updateIntermission,
    next,
    restart,
    launch,
    launchNetwork,
    updateProjectiles,
    networkSnapshot,
    applyNetworkSnapshot,
    trackPoint,
    purchaseSabotage,
    addNetworkSabotage,
  };
})();
