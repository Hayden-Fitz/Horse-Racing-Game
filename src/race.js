"use strict";
HD.Race = (() => {
  const S = HD.state,
    C = HD.CONFIG;

  // ---------------------------------------------------------------------------
  // Horse lifecycle and three-lap simulation
  // ---------------------------------------------------------------------------

  function resetHorses() {
    S.horses.forEach((h) => HD.world.scene.remove(h));
    S.horses = C.horses.map(HD.Models.horse);
    S.horses.forEach((h) => HD.world.scene.add(h));
    S.finishOrder = [];
    positionHorses();
  }
  function trackPoint(progress, lane = 0) {
    const lapProgress = progress % 1;
    const a = lapProgress * Math.PI * 2,
      rx = 52.5 + lane * 3.1,
      rz = 25.5 + lane * 3.1;
    return {
      position: new THREE.Vector3(Math.cos(a) * rx, 0.75, Math.sin(a) * rz),
      angle: Math.atan2(-Math.cos(a) * rz, -Math.sin(a) * rx),
    };
  }
  function positionHorses() {
    S.horses.forEach((horse, i) => {
      const d = horse.userData.data,
        p = trackPoint(d.progress, i);
      horse.position.copy(p.position);
      horse.rotation.y = p.angle;
      const gallop = S.phase === "racing" && !d.finished ? Math.sin(S.elapsed * 14 + i) : 0;
      const tumble = d.ragdoll > 0 ? Math.sin(S.elapsed * 15) : 0;
      horse.userData.body.position.y = d.ragdoll > 0 ? 0.55 : Math.abs(gallop) * 0.28;
      horse.userData.body.rotation.x = d.ragdoll > 0 ? tumble * 1.15 : 0;
      horse.userData.body.rotation.z = d.ragdoll > 0 ? 1.15 + tumble * 0.35 : 0;
      horse.userData.legs.forEach(
        (leg) => (leg.rotation.z = gallop * 0.6 * Math.cos(leg.userData.phase)),
      );
    });
  }
  function begin() {
    if (S.phase !== "betting") return;
    S.phase = "racing";
    S.raceTime = 0;
    HD.UI.countdown("GO!");
    HD.UI.announce("They're off! Live betting remains open for 30 seconds.");
    setTimeout(() => HD.UI.countdown(""), 700);
    HD.UI.render();
  }
  function update(dt) {
    if (S.phase !== "racing") return;
    const bookWasOpen = S.raceTime < 30;
    S.raceTime += dt;
    if (bookWasOpen && S.raceTime >= 30) {
      HD.UI.announce("The live betting book is closed!");
      HD.UI.render();
    }
    S.horses.forEach((horse, i) => {
      const d = horse.userData.data;
      if (d.finished) return;
      d.slow = Math.max(0, d.slow - dt);
      d.ragdoll = Math.max(0, (d.ragdoll || 0) - dt);
      d.boost = Math.max(0, (d.boost || 0) - dt);
      d.resistance = Math.max(0, (d.resistance || 0) - dt);
      const surge =
        Math.sin(S.raceTime * (0.7 + i * 0.08) + i * 2.4) * 0.0035 +
        Math.sin(S.raceTime * 2.1 + i) * 0.0015;
      d.speed += (d.baseSpeed + surge - d.speed) * dt * 1.25;
      const statusMultiplier = d.ragdoll > 0 ? 0.12 : d.slow > 0 ? 0.35 : d.boost > 0 ? 1.45 : 1;
      d.progress += Math.max(0.005, d.speed) * statusMultiplier * dt;
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
    const leaderProgress = Math.max(...S.horses.map((h) => h.userData.data.progress));
    HD.UI.progress(Math.min(1, leaderProgress / C.raceLaps));
    positionHorses();
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
    const winner = S.finishOrder[0];
    let payout = 0;
    S.bets.filter((b) => b.horse === winner).forEach((b) => (payout += b.amount * (b.odds + 1)));
    if (payout) {
      S.money += payout;
      HD.UI.addLedger(`Race ${S.race} payout`, payout);
    }
    HD.Controls.setMode("look");
    HD.UI.showResult(
      `#${winner + 1} ${C.horses[winner].name} wins!`,
      payout
        ? `Your tickets paid $${payout}. You now have $${S.money}.`
        : `No winning ticket this time. You have $${S.money} left.`,
    );
    HD.UI.render();
  }
  function next() {
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
    HD.Controls.forceStand();
    HD.UI.announce("Round complete! Two minutes to visit the cheaper concourse shops.");
  }
  function updateIntermission(dt) {
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
  }
  function restart() {
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
  function launch(type, start, velocity) {
    const itemConfig = C.items[type];
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
    });
    S.inventory[type]--;
    HD.UI.render();
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
      S.horses.forEach((horse) => {
        const hitCenter = horse.position.clone().add(new THREE.Vector3(0, 2.2, 0));
        const currentDistance = hitCenter.distanceTo(p.position);
        if (currentDistance < distance) {
          distance = currentDistance;
          closest = horse;
        }
      });

      if (!p.impacted && distance < 7.2) {
        p.impacted = true;
        applyItemEffect(closest, p);
        p.velocity.multiplyScalar(0.38);
        p.velocity.y = Math.max(2.5, p.velocity.y * -0.3);
      } else if (p.position.y <= 0.5) {
        p.position.y = 0.5;
        p.mesh.position.y = 0.5;
        if (!p.landed && !p.impacted) {
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
    if (projectile.type !== "soda") return;
    const geometry = new THREE.CylinderGeometry(1.8, 1.45, 0.04, 18);
    const material = new THREE.MeshStandardMaterial({
      color: 0x6e351e,
      roughness: 0.35,
      transparent: true,
      opacity: 0.72,
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
      HD.UI.announce(`${data.name} gets a turbo boost and resistance!`);
      return;
    }

    const resistance = data.resistance > 0 ? 0.25 : 1;
    if (item.slowDuration) data.slow = item.slowDuration * resistance;
    if (item.ragdollDuration) data.ragdoll = item.ragdollDuration * resistance;

    const resisted = resistance < 1 ? " partially resists it!" : " takes the full hit!";
    HD.UI.announce(`${item.name} connects — ${data.name}${resisted}`);
  }
  function clearProjectiles() {
    S.projectiles.forEach((p) => {
      HD.world.scene.remove(p.mesh);
      if (p.groundEffect) HD.world.scene.remove(p.groundEffect);
    });
    S.projectiles = [];
  }
  return {
    resetHorses,
    begin,
    update,
    updateIntermission,
    next,
    restart,
    launch,
    updateProjectiles,
    trackPoint,
  };
})();
