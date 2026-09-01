"use strict";
HD.Race = (() => {
  const S = HD.state,
    C = HD.CONFIG;
  const MIN_LANE_GAP = 0.82;
  const MIN_PROGRESS_GAP = 0.018;
  let networkSettlement = "";
  let lastNetworkUi = -1;
  let ambientThrowSchedule = [];
  let ambientThrowWindow = 0;

  // ---------------------------------------------------------------------------
  // Horse lifecycle and three-lap simulation
  // ---------------------------------------------------------------------------

  function resetHorses(options = {}) {
    const forceStart = Boolean(options.forceStart);
    const previousProgress = new Map(
      S.horses.map((horse) => [horse.userData.data.id, horse.userData.data.progress]),
    );
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
    S.horses.forEach((horse) => {
      const data = horse.userData.data;
      data.maxSpeedBonus = S.horseSpeedBonuses?.[data.id] || 0;
      const oldProgress = forceStart ? undefined : previousProgress.get(data.id);
      if (!Number.isFinite(oldProgress)) return;
      data.progress = oldProgress;
      data.stagingStart = oldProgress;
      data.stagingTarget = Math.floor(oldProgress) + 1;
      data.staging = true;
    });
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
      rx = C.trackLanes.centerX + lane * C.trackLanes.spacingX,
      rz = C.trackLanes.centerZ + lane * C.trackLanes.spacingZ;
    return {
      position: new THREE.Vector3(Math.cos(a) * rx, 0.75, Math.sin(a) * rz),
      angle: Math.atan2(-Math.cos(a) * rz, -Math.sin(a) * rx),
    };
  }
  function positionHorses() {
    S.horses.forEach((horse, i) => {
      const d = horse.userData.data;
      const angle = (d.progress % 1) * Math.PI * 2;
      const radiusX = C.trackLanes.centerX + d.lane * C.trackLanes.spacingX;
      const radiusZ = C.trackLanes.centerZ + d.lane * C.trackLanes.spacingZ;
      horse.position.set(
        Math.cos(angle) * radiusX,
        0.75,
        Math.sin(angle) * radiusZ,
      );
      horse.rotation.y = Math.atan2(
        -Math.cos(angle) * radiusZ,
        -Math.sin(angle) * radiusX,
      );
      const safeBaseSpeed = Math.max(0.001, Number.isFinite(d.baseSpeed) ? d.baseSpeed : 0.04);
      const safeMotionSpeed = Number.isFinite(d.motionSpeed) ? Math.max(0, d.motionSpeed) : 0;
      const movement = THREE.MathUtils.clamp(safeMotionSpeed / safeBaseSpeed, 0, 1.35);
      const moving = S.phase === "racing" || S.phase === "finished" || d.staging;
      const previousGaitTime = Number.isFinite(d.lastGaitTime) ? d.lastGaitTime : S.elapsed;
      const gaitDelta = THREE.MathUtils.clamp(S.elapsed - previousGaitTime, 0, 0.05);
      d.lastGaitTime = S.elapsed;
      d.gaitPhase = Number.isFinite(d.gaitPhase) ? d.gaitPhase : i * 0.7;
      if (moving && movement > 0.01) {
        d.gaitPhase += gaitDelta * THREE.MathUtils.lerp(4.5, 15.5, movement / 1.35);
      }
      const stridePhase = d.gaitPhase;
      const gallop = moving ? Math.sin(stridePhase) * movement : 0;
      const tumble = d.ragdoll > 0 ? Math.sin(S.elapsed * 15) : 0;
      horse.userData.body.position.x = 0;
      horse.userData.body.position.y = d.ragdoll > 0
        ? 0.55
        : Math.abs(gallop) * 0.28;
      horse.userData.body.rotation.x = d.ragdoll > 0 ? tumble * 1.15 : 0;
      horse.userData.body.rotation.z = d.ragdoll > 0
        ? 1.15 + tumble * 0.35
        : 0;
      if (d.ragdoll <= 0) {
        horse.userData.body.rotation.x = -0.035 * movement + Math.sin(stridePhase * 2) * 0.018 * movement;
      }
      if (horse.userData.tail) {
        horse.userData.tail.rotation.z = -0.8 + gallop * 0.18;
      }
      (horse.userData.ears || []).forEach((ear) => {
        ear.rotation.z = -0.3;
      });
      if (horse.userData.jockey) {
        horse.userData.jockey.position.y = 3.2 + Math.abs(gallop) * 0.12;
        horse.userData.jockey.rotation.z = -0.08 - movement * 0.08;
      }
      (horse.userData.legs || []).forEach((leg) => {
        if (!leg?.rotation || !leg.position) return;
        const cycle = Math.sin(stridePhase + leg.userData.phase);
        leg.rotation.z = cycle * 0.72 * movement;
        leg.position.y = 0.55 + Math.max(0, -cycle) * 0.12 * movement;
      });
    });
  }
  function begin() {
    if (S.phase !== "betting") return;
    S.phase = "racing";
    S.raceTime = 0;
    ambientThrowWindow = 0;
    ambientThrowSchedule = createAmbientThrowSchedule(ambientThrowWindow);
    S.horses.forEach((horse) => {
      const data = horse.userData.data;
      data.progress = 0;
      data.staging = false;
    });
    const sabotageReport = resolveSabotage();
    const bettingNotice =
      "Live betting remains open until the leader completes lap one.";
    S.raceAnnouncement = sabotageReport
      ? `${sabotageReport} ${bettingNotice}`
      : `They're off! ${bettingNotice}`;
    HD.UI.countdown("GO!");
    HD.UI.announce(S.raceAnnouncement);
    if (sabotageReport) HD.UI.showRaceNotice(sabotageReport.replace("PADDOCK ALERT: ", ""));
    HD.Audio?.raceStart?.(S.raceAnnouncement);
    setTimeout(() => HD.UI.countdown(""), 700);
    HD.UI.render();
  }
  function purchaseSabotage(horseIndex, optionId) {
    if (S.phase !== "betting") {
      HD.Audio?.cue?.("error");
      return HD.UI.announce("The fixer only works before the race.");
    }
    if (S.sabotagePlans.some((plan) => !plan.ai && !plan.remote)) {
      return HD.UI.announce("You already hired a fixer this race.");
    }
    const option = C.sabotageOptions[optionId];
    if (!option) return;
    const price = S.atSabotageCounter
      ? Math.ceil(option.price * (1 - C.vendorDiscount))
      : option.price;
    if (S.money < price) {
      HD.Audio?.cue?.("error");
      return HD.UI.announce(`The fixer needs $${price}.`);
    }

    S.money -= price;
    S.sabotagePlans.push({ horse: horseIndex, optionId });
    HD.Network?.sendSabotage(horseIndex, optionId);
    HD.UI.addLedger(`Secret fixer: #${horseIndex + 1}`, -price);
    HD.UI.announce("The fixer accepted the job. The outcome remains sealed until race start.");
    HD.Audio?.cue?.("sabotage");
    HD.Audio?.cue?.("moneySpend");
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
      if (option.boostDuration) {
        horse.userData.data.boost = option.boostDuration;
        return `#${plan.horse + 1} received a ${option.boostDuration}s opening boost`;
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

  function addAISabotage(horse, optionId, actor) {
    if (S.phase !== "betting" || !S.horses[horse] || !C.sabotageOptions[optionId]) return;
    S.sabotagePlans.push({ horse, optionId, actor, ai: true });
  }
  function update(dt) {
    if (HD.Network?.isConnected() && !HD.Network.isHost()) {
      updateNetworkHorses(dt);
      return;
    }
    if (S.phase === "betting") {
      updateStagingHorses();
      return;
    }
    if (S.phase === "finished") {
      updateFinishedHorses(dt);
      positionHorses();
      return;
    }
    if (S.phase !== "racing") return;
    const bookWasOpen = liveBettingOpen();
    S.raceTime += dt;
    updateAmbientCrowdThrows(dt);
    const leaderProgress = Math.max(...S.horses.map((horse) => horse.userData.data.progress));

    S.horses.forEach((horse, i) => {
      const d = horse.userData.data;
      if (d.finished) {
        d.progress += Math.max(0.012, d.coastSpeed || d.baseSpeed * 0.55) * dt;
        d.coastSpeed = Math.max(d.baseSpeed * 0.35, (d.coastSpeed || d.baseSpeed) * (1 - dt * 0.22));
        return;
      }
      d.slow = Math.max(0, d.slow - dt);
      d.ragdoll = Math.max(0, (d.ragdoll || 0) - dt);
      d.boost = Math.max(0, (d.boost || 0) - dt);
      d.resistance = Math.max(0, (d.resistance || 0) - dt);
      d.weave = Math.max(0, (d.weave || 0) - dt);
      d.panic = Math.max(0, (d.panic || 0) - dt);
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
      const panicPace = d.panic > 0
        ? 0.72 + Math.sin(S.raceTime * 7 + i) * 0.12
        : 1;
      const targetSpeed =
        d.baseSpeed *
          (1 + (d.maxSpeedBonus || 0)) *
          gateAcceleration *
          earlyPace *
          stamina *
          lateFieldSeparation *
          finishingKick *
          drafting *
          panicPace *
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
      if (d.weave > 0 && Math.sin(S.raceTime * 5 + i) > 0.94) {
        const direction = Math.sin(S.raceTime * 2.3 + i) > 0 ? 1 : -1;
        d.targetLane = THREE.MathUtils.clamp(
          Math.round(d.lane) + direction,
          0,
          C.raceHorseCount - 1,
        );
        d.passing = true;
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
        d.coastSpeed = d.motionSpeed;
        d.place = S.finishOrder.length + 1;
        d.finishTime = S.raceTime;
        S.finishOrder.push(d.index);
        if (d.place === 1) HD.UI.announce(`${d.name} crosses the line first!`);
      }
    });
    const bookIsOpen = liveBettingOpen();
    if (bookWasOpen && !bookIsOpen) {
      HD.UI.announce("Lap one is complete. The live betting book is closed!");
      HD.UI.render();
    }
    if (bookIsOpen && S.raceTime - S.lastOdds > 0.6) {
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

  function updateStagingHorses() {
    const elapsed = C.preparationDuration - S.timer;
    const blend = THREE.MathUtils.smoothstep(elapsed / C.preparationDuration, 0, 1);
    S.horses.forEach((horse) => {
      const data = horse.userData.data;
      if (!data.staging) return;
      data.progress = THREE.MathUtils.lerp(data.stagingStart, data.stagingTarget, blend);
      data.motionSpeed = data.baseSpeed * 0.42;
    });
    positionHorses();
  }

  function updateFinishedHorses(dt) {
    S.horses.forEach((horse) => {
      const data = horse.userData.data;
      data.progress += Math.max(0.01, data.coastSpeed || data.baseSpeed * 0.4) * dt;
      data.coastSpeed = Math.max(data.baseSpeed * 0.28, (data.coastSpeed || data.baseSpeed) * (1 - dt * 0.3));
      data.motionSpeed = data.coastSpeed;
    });
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
        data.laneDecisionTime -= dt;
        if (Math.abs(data.lane - data.targetLane) < 0.08) {
          data.passing = false;
        }
        if (data.laneDecisionTime <= 0) {
          chooseRandomLane(horse, runners);
          data.laneDecisionTime = 2.2 + Math.random() * 3.2;
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

      const leaderImpaired =
        leaderData.slow > 0 ||
        leaderData.ragdoll > 0 ||
        leaderData.motionSpeed < leaderData.baseSpeed * 0.62;
      if (leaderImpaired && gap < 0.09 && choosePassingLane(horse, runners)) {
        data.motionSpeed = Math.min(data.motionSpeed, data.momentum);
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
    const directions = Math.random() < 0.5 ? [-1, 1] : [1, -1];

    for (const direction of directions) {
      const candidateLane = roundedLane + direction;
      if (candidateLane < 0 || candidateLane >= C.raceHorseCount) continue;
      const clear = laneIsClear(candidateLane, horse, runners);
      if (!clear) continue;

      data.targetLane = candidateLane;
      data.passing = true;
      data.blockedTime = 0;
      return true;
    }
    return false;
  }

  function chooseRandomLane(horse, runners) {
    const data = horse.userData.data;
    const roundedLane = Math.round(data.lane);
    const firstDirection = Math.random() < 0.5 ? -1 : 1;
    const directions = [firstDirection, -firstDirection];

    for (const direction of directions) {
      const candidateLane = roundedLane + direction;
      if (candidateLane < 0 || candidateLane >= C.raceHorseCount) continue;
      if (!laneIsClear(candidateLane, horse, runners)) continue;

      data.targetLane = candidateLane;
      data.passing = true;
      return true;
    }

    return false;
  }

  function laneIsClear(candidateLane, horse, runners) {
    const data = horse.userData.data;
    return runners.every((other) => {
      if (other === horse) return true;
      const otherData = other.userData.data;
      const laneClear = Math.abs(otherData.lane - candidateLane) >= MIN_LANE_GAP;
      const progressClear = Math.abs(otherData.progress - data.progress) >= 0.014;
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
    const leaderProgress = Math.max(
      ...S.horses.map((horse) => horse.userData.data.progress),
    );
    const weights = S.horses.map((horse) => {
      const data = horse.userData.data;
      const racePosition = Math.exp((data.progress - leaderProgress) * 18);
      const form = Math.pow(data.ability, 6);
      const status = data.ragdoll > 0 ? 0.25 : data.slow > 0 ? 0.62 : 1;
      return Math.max(0.001, racePosition * form * status);
    });
    const totalWeight = weights.reduce((total, weight) => total + weight, 0);

    S.horses.forEach((horse, index) => {
      const data = horse.userData.data;
      const chance = weights[index] / totalWeight;
      data.liveChance = chance;
      data.odds = THREE.MathUtils.clamp(
        Math.round((1 - chance) / Math.max(0.01, chance)),
        1,
        30,
      );
    });
  }

  function liveBettingOpen() {
    if (S.phase === "betting") return true;
    if (S.phase !== "racing" || !S.horses.length) return false;
    return Math.max(
      ...S.horses.map((horse) => horse.userData.data.progress),
    ) < 1;
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
    HD.AI?.settleRace?.(winner);
    const winningTickets = S.bets.filter((bet) => bet.horse === winner);
    const returnedStake = winningTickets.reduce((total, bet) => total + bet.amount, 0);
    const profit = winningTickets.reduce((total, bet) => total + bet.amount * bet.odds, 0);
    const payout = returnedStake + profit;
    if (payout) {
      S.money += payout;
      HD.UI.addLedger(`Race ${S.race} payout`, payout);
      HD.Audio?.cue?.("moneyGain");
    }
    HD.Controls.setMode("look");
    HD.UI.showRaceWinner(`#${winner + 1} ${winnerData.name} WINS!`);
    const runnerUp = S.horses[S.finishOrder[1]]?.userData.data;
    const closeFinish = runnerUp
      ? Math.abs((runnerUp.finishTime || S.raceTime) - winnerData.finishTime) < 0.5
      : false;
    HD.Audio?.raceFinish?.(winnerData, closeFinish);
    HD.UI.render();
    setTimeout(next, 4300);
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
    HD.UI.announce("Forty-five seconds until the next race. Study the field!");
  }
  function prepareRace(options = {}) {
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
    resetHorses({ forceStart: options.forceStart });
    HD.AI?.prepareRace?.();
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
      prepareRace({ forceStart: true });
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
      horseSpeedBonuses: {},
    });
    clearProjectiles();
    resetHorses();
    HD.AI?.resetMatch?.();
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
      ambient: Boolean(options.ambient),
    });
    HD.Audio?.throwItem?.(type, Boolean(options.ambient));
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
      {
        consume: false,
        visualOnly: !authoritative,
        ambient: Boolean(throwData.ambient),
      },
    );
    if (throwData.ambient) {
      markAmbientThrow(throwData.throwerIndex);
    }
  }

  function validVector(value) {
    return Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
  }

  function predictTrajectory(
    type,
    start,
    velocity,
    positions,
    maxPoints = 42,
    interval = 0.055,
  ) {
    const item = C.items[type];
    if (!item || !positions || maxPoints < 2) return 0;

    const groundY = 0.5;
    const gravity = item.gravity;
    const landingTime = projectileLandingTime(
      start.y,
      velocity.y,
      gravity,
      groundY,
    );
    const sampleInterval = Math.max(
      interval,
      landingTime / (maxPoints - 1),
    );
    const regularPoints = Math.min(
      maxPoints - 1,
      Math.max(1, Math.floor(landingTime / sampleInterval)),
    );

    for (let index = 0; index < regularPoints; index++) {
      writeTrajectoryPoint(
        positions,
        index,
        index * sampleInterval,
        start,
        velocity,
        gravity,
      );
    }

    writeTrajectoryPoint(positions, regularPoints, landingTime, start, velocity, gravity);
    positions[regularPoints * 3 + 1] = Math.max(groundY, positions[regularPoints * 3 + 1]);
    return regularPoints + 1;
  }

  function writeTrajectoryPoint(positions, index, time, start, velocity, gravity) {
    const offset = index * 3;
    positions[offset] = start.x + velocity.x * time;
    positions[offset + 1] = start.y + velocity.y * time - gravity * 0.5 * time * time;
    positions[offset + 2] = start.z + velocity.z * time;
  }

  function projectileLandingTime(startY, velocityY, gravity, groundY = 0.5) {
    const discriminant = Math.max(
      0,
      velocityY * velocityY + 2 * gravity * Math.max(0, startY - groundY),
    );
    return (velocityY + Math.sqrt(discriminant)) / gravity;
  }

  function updateAmbientCrowdThrows(dt) {
    const throwers = HD.world.crowdThrowers || [];
    if (throwers.length !== 3) return;
    if (!S.horses.length) return;

    if (!ambientThrowSchedule.length && S.raceTime >= ambientThrowWindow + 10) {
      ambientThrowWindow += 10;
      ambientThrowSchedule = createAmbientThrowSchedule(ambientThrowWindow);
    }

    const nextThrow = ambientThrowSchedule[0];
    if (!nextThrow || S.raceTime < nextThrow.time) return;

    ambientThrowSchedule.shift();
    const throwerIndex = nextThrow.throwerIndex;

    const thrower = throwers[throwerIndex];
    const start = thrower.position.clone().add(new THREE.Vector3(0, 2.45, 0));
    const aimedAtHorse = Math.random() < 0.72;
    const horse = S.horses[Math.floor(Math.random() * S.horses.length)];
    const target = aimedAtHorse
      ? horse.position.clone().add(new THREE.Vector3(0, 1.4, 0))
      : trackPoint(Math.random(), Math.floor(Math.random() * C.raceHorseCount)).position;
    const itemTypes = Object.keys(C.items);
    const type = itemTypes[Math.floor(Math.random() * itemTypes.length)];
    const flightTime = 1.35 + Math.random() * 0.65;
    const velocity = target.clone().sub(start).divideScalar(flightTime);
    velocity.y += C.items[type].gravity * flightTime * 0.5;

    launch(type, start, velocity, {
      consume: false,
      visualOnly: false,
      ambient: true,
    });
    markAmbientThrow(throwerIndex);
    HD.Network?.sendAmbientThrow?.(type, start, velocity, throwerIndex);
  }

  function createAmbientThrowSchedule(windowStart) {
    const throwerOrder = [0, 1, 2];

    for (let index = throwerOrder.length - 1; index > 0; index--) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [throwerOrder[index], throwerOrder[swapIndex]] = [
        throwerOrder[swapIndex],
        throwerOrder[index],
      ];
    }

    return [
      0.8 + Math.random() * 1.8,
      3.8 + Math.random() * 1.7,
      6.8 + Math.random() * 1.8,
    ].map((offset, index) => ({
      time: windowStart + offset,
      throwerIndex: throwerOrder[index],
    }));
  }

  function markAmbientThrow(index) {
    const thrower = HD.world.crowdThrowers?.[Number(index)];
    if (!thrower) return;
    thrower.userData.lastThrowAt = S.elapsed;
  }

  // ---------------------------------------------------------------------------
  // Throwable physics and horse effects
  // ---------------------------------------------------------------------------

  function updateProjectiles(dt) {
    S.projectiles.forEach((p) => {
      p.age += dt;
      if (p.landed) p.landedAge = (p.landedAge || 0) + dt;
      const stepStartX = p.position.x;
      const stepStartY = p.position.y;
      const stepStartZ = p.position.z;
      const stepVelocityY = p.velocity.y;
      if (!p.grounded) p.position.y -= p.config.gravity * 0.5 * dt * dt;
      p.position.addScaledVector(p.velocity, dt);
      if (!p.grounded) p.velocity.y -= p.config.gravity * dt;
      p.mesh.position.copy(p.position);
      if (!p.grounded) {
        p.mesh.rotation.x += dt * (4 + Math.abs(p.velocity.z) * 0.35);
        p.mesh.rotation.z += dt * (4 + Math.abs(p.velocity.x) * 0.35);
      }

      if (
        !p.grounded &&
        !p.blockedByGlass &&
        projectileHitsGlass(p, stepStartX, stepStartY, stepStartZ)
      ) {
        p.impacted = true;
        p.blockedByGlass = true;
        p.removeAt = Math.min(p.removeAt || Infinity, p.age + 3);
        HD.Audio?.cue?.("glassImpact", {
          scale: p.ambient ? 0.35 : 0.85,
        });

        if (!p.visualOnly && !p.ambient) {
          HD.UI.announce("The throw bounces off the commentator booth glass!");
        }
      }

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

      const trapCanHit = !p.config.trap || p.grounded;
      if (!p.impacted && trapCanHit && distance < 5.2 * 5.2) {
        p.impacted = true;
        applyItemEffect(closest, p);
        if (p.config.trap) {
          p.velocity.set(0, 0, 0);
          p.grounded = true;
          p.removeAt = p.age + 1;
        } else {
          p.velocity.multiplyScalar(0.24);
          p.velocity.y = Math.max(1.2, p.velocity.y * -0.2);
        }
      } else if (p.position.y <= 0.5) {
        if (!p.landed && stepStartY > 0.5) {
          const impactTime = Math.min(
            dt,
            projectileLandingTime(
              stepStartY,
              stepVelocityY,
              p.config.gravity,
            ),
          );
          p.position.x = stepStartX + p.velocity.x * impactTime;
          p.position.z = stepStartZ + p.velocity.z * impactTime;
          p.velocity.y = stepVelocityY - p.config.gravity * impactTime;
        }
        p.position.y = 0.5;
        p.mesh.position.y = 0.5;
        if (!p.visualOnly && !p.ambient && !p.landed && !p.impacted) {
          HD.UI.announce(`Miss! The ${p.config.name.toLowerCase()} lands in the dirt.`);
          HD.Audio?.notifyMiss?.(p.type);
        }
        if (!p.landed) {
          HD.Audio?.trackImpact?.(p.type, p.ambient);
          createGroundEffect(p);
          if (p.config.trap) {
            p.velocity.set(0, 0, 0);
            snapTrapToLane(p);
            p.grounded = true;
          }
        }
        p.landed = true;

        if (Math.abs(p.velocity.y) > 1.2) {
          p.velocity.y *= -0.34;
          p.velocity.x *= 0.72;
          p.velocity.z *= 0.72;
        } else {
          p.velocity.y = 0;
          p.velocity.x *= Math.pow(0.015, dt);
          p.velocity.z *= Math.pow(0.015, dt);
          p.grounded = p.velocity.lengthSq() < 0.16;
          if (p.grounded) p.velocity.set(0, 0, 0);
        }
        if (!p.config.trap && p.landedAge > 2.4) {
          p.velocity.set(0, 0, 0);
          p.grounded = true;
        }
      }
    });

    S.projectiles.filter((p) => p.age >= (p.removeAt || 18)).forEach((p) => {
      HD.world.scene.remove(p.mesh);
      if (p.groundEffect) HD.world.scene.remove(p.groundEffect);
    });
    S.projectiles = S.projectiles.filter((p) => p.age < (p.removeAt || 18));
  }

  function projectileHitsGlass(projectile, startX, startY, startZ) {
    const barriers = HD.world.projectileBarriers || [];
    const endX = projectile.position.x;
    const endY = projectile.position.y;
    const endZ = projectile.position.z;
    const moveX = endX - startX;
    const moveZ = endZ - startZ;

    for (const barrier of barriers) {
      const [glassStartX, glassStartZ] = barrier.start;
      const [glassEndX, glassEndZ] = barrier.end;
      const glassX = glassEndX - glassStartX;
      const glassZ = glassEndZ - glassStartZ;
      const denominator = moveX * glassZ - moveZ * glassX;
      let travel = null;

      if (Math.abs(denominator) > 0.00001) {
        const offsetX = glassStartX - startX;
        const offsetZ = glassStartZ - startZ;
        const pathProgress = (offsetX * glassZ - offsetZ * glassX) /
          denominator;
        const glassProgress = (offsetX * moveZ - offsetZ * moveX) /
          denominator;

        if (
          pathProgress >= 0 &&
          pathProgress <= 1 &&
          glassProgress >= 0 &&
          glassProgress <= 1
        ) {
          travel = pathProgress;
        }
      }

      if (travel === null) {
        const glassLengthSquared = glassX * glassX + glassZ * glassZ;
        const glassProgress = THREE.MathUtils.clamp(
          ((endX - glassStartX) * glassX +
            (endZ - glassStartZ) * glassZ) /
            Math.max(0.0001, glassLengthSquared),
          0,
          1,
        );
        const nearestX = glassStartX + glassX * glassProgress;
        const nearestZ = glassStartZ + glassZ * glassProgress;
        const distance = Math.hypot(endX - nearestX, endZ - nearestZ);

        if (distance <= (barrier.thickness || 0.12) + 0.22) {
          travel = 1;
        }
      }

      if (travel === null) continue;

      const impactY = THREE.MathUtils.lerp(startY, endY, travel);
      if (impactY < barrier.bottom - 0.22 || impactY > barrier.top + 0.22) {
        continue;
      }

      const glassLength = Math.max(0.0001, Math.hypot(glassX, glassZ));
      const normalX = -glassZ / glassLength;
      const normalZ = glassX / glassLength;
      const velocityAlongNormal =
        projectile.velocity.x * normalX + projectile.velocity.z * normalZ;

      projectile.position.set(
        THREE.MathUtils.lerp(startX, endX, Math.max(0, travel - 0.015)),
        impactY,
        THREE.MathUtils.lerp(startZ, endZ, Math.max(0, travel - 0.015)),
      );
      projectile.velocity.x =
        (projectile.velocity.x - 1.65 * velocityAlongNormal * normalX) * 0.3;
      projectile.velocity.z =
        (projectile.velocity.z - 1.65 * velocityAlongNormal * normalZ) * 0.3;
      projectile.velocity.y *= 0.34;
      projectile.mesh.position.copy(projectile.position);
      return true;
    }

    return false;
  }

  function snapTrapToLane(projectile) {
    let best = null;
    for (let lane = 0; lane < C.raceHorseCount; lane++) {
      const radiusX = C.trackLanes.centerX + lane * C.trackLanes.spacingX;
      const radiusZ = C.trackLanes.centerZ + lane * C.trackLanes.spacingZ;
      const angle = Math.atan2(projectile.position.z / radiusZ, projectile.position.x / radiusX);
      const x = Math.cos(angle) * radiusX;
      const z = Math.sin(angle) * radiusZ;
      const error = Math.hypot(x - projectile.position.x, z - projectile.position.z);
      if (!best || error < best.error) best = { lane, angle, x, z, error };
    }
    projectile.trapLane = best.lane;
    projectile.position.set(best.x, 0.72, best.z);
    projectile.mesh.position.copy(projectile.position);
    projectile.mesh.rotation.set(0, -best.angle, 0);
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
    const leader = [...S.horses].sort((a, b) => {
      return b.userData.data.progress - a.userData.data.progress;
    })[0];
    HD.Audio?.horseImpact?.(
      projectile.type,
      data.name,
      projectile.ambient,
      { wasLeader: leader === horse },
    );

    if (item.maxSpeedBonus) {
      const previousBonus = data.maxSpeedBonus || 0;
      data.maxSpeedBonus = Math.min(
        item.maxSpeedBonusCap,
        previousBonus + item.maxSpeedBonus,
      );
      S.horseSpeedBonuses = S.horseSpeedBonuses || {};
      S.horseSpeedBonuses[data.id] = data.maxSpeedBonus;
      const percent = Math.round(data.maxSpeedBonus * 100);
      HD.UI.announce(`${data.name}'s maximum speed permanently rises to +${percent}%!`);
      return;
    }

    if (item.forceLaneChange) {
      const currentLane = Math.round(data.lane);
      const outward = currentLane < C.raceHorseCount - 1 ? currentLane + 1 : currentLane - 1;
      data.targetLane = THREE.MathUtils.clamp(outward, 0, C.raceHorseCount - 1);
      data.passing = true;
      data.weave = Math.max(data.weave, 2.5);
      data.momentum *= 0.72;
      HD.UI.announce(`${data.name} dodges the hurdle and changes lanes!`);
    }

    if (item.boostDuration) {
      data.boost = item.boostDuration;
      data.resistance = item.resistanceDuration;
      data.momentum = Math.max(data.momentum, data.baseSpeed * 1.12);
      HD.UI.announce(`${data.name} gets a turbo boost and resistance!`);
      return;
    }

    if (item.weaveDuration) {
      data.weave = item.weaveDuration;
      data.targetLane = Math.min(
        C.raceHorseCount - 1,
        Math.round(data.lane) + 1,
      );
      data.passing = true;
    }
    if (item.panicDuration) {
      data.panic = item.panicDuration;
      data.targetLane = Math.max(0, Math.round(data.lane) - 1);
      data.passing = true;
      data.momentum *= 0.68;
    }

    const naturalResistance = THREE.MathUtils.lerp(
      1.08,
      0.68,
      (data.resistanceRating || 75) / 100,
    );
    const resistance = data.resistance > 0 ? 0.25 : naturalResistance;
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
      : item.panicDuration
        ? " panics and swerves toward the rail!"
        : item.weaveDuration
          ? " loses its line and starts weaving!"
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
          weave: data.weave,
          panic: data.panic,
          sabotagePenalty: data.sabotagePenalty,
          maxSpeedBonus: data.maxSpeedBonus || 0,
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
        "weave",
        "panic",
        "sabotagePenalty",
        "maxSpeedBonus",
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
    predictTrajectory,
    updateProjectiles,
    networkSnapshot,
    applyNetworkSnapshot,
    trackPoint,
    purchaseSabotage,
    addNetworkSabotage,
    addAISabotage,
    liveBettingOpen,
  };
})();
