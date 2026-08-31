"use strict";
HD.Controls = (() => {
  const S = HD.state;
  const stairAngles = [
    0,
    Math.PI / 2,
    Math.PI,
    (Math.PI * 3) / 2,
  ];
  let canvas, camera, trajectory;
  const walkPrevious = new THREE.Vector3();
  const walkForward = new THREE.Vector3();
  const walkRight = new THREE.Vector3();
  const walkInput = new THREE.Vector3();
  const trajectoryStart = new THREE.Vector3();
  const trajectoryVelocity = new THREE.Vector3();
  let trajectoryPositions;
  let phoneRequested = false;
  let phoneBlend = 0;
  let throwAnimation = 0;

  // ---------------------------------------------------------------------------
  // Input registration and interaction modes
  // ---------------------------------------------------------------------------

  function init() {
    canvas = HD.world.renderer.domElement;
    camera = HD.world.camera;
    trajectory = HD.world.trajectory;
    trajectoryPositions = new Float32Array(42 * 3);
    trajectory.geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(trajectoryPositions, 3),
    );
    trajectory.geometry.setDrawRange(0, 0);
    canvas.addEventListener("click", click);
    canvas.addEventListener("pointerdown", beginCharge);
    canvas.addEventListener("pointerup", endCharge);
    document.addEventListener("mousemove", look);
    document.addEventListener("keydown", keydown);
    document.addEventListener("keyup", keyup);
    document.addEventListener("pointerlockchange", () => {
      if (!document.pointerLockElement && S.mode !== "phone")
        HD.UI.announce("Click the stadium to resume looking around.");
    });
  }
  function click() {
    if (S.mode === "phone") return;
    if (S.mode === "throw") return;
    if (document.pointerLockElement !== canvas) canvas.requestPointerLock();
  }
  function look(event) {
    if (document.pointerLockElement !== canvas || S.mode === "phone") return;
    const sensitivity = HD.Settings.sensitivity();
    S.yaw -= event.movementX * 0.0021 * sensitivity;
    S.yaw = THREE.MathUtils.euclideanModulo(S.yaw + Math.PI, Math.PI * 2) - Math.PI;
    S.pitch = THREE.MathUtils.clamp(
      S.pitch - event.movementY * 0.0018 * sensitivity,
      -0.72,
      0.48,
    );
  }
  function keydown(event) {
    if (setMovementKey(event.code, true)) return;
    if (event.repeat) return;
    if (/^Digit[1-8]$/.test(event.code)) {
      return selectHotbarSlot(Number(event.code.slice(-1)) - 1);
    }
    if (HD.Settings.matches(event, "menu")) {
      const rankings = document.querySelector("#rankings-overlay");
      if (!rankings.hidden) {
        HD.UI.showRankings(false);
        canvas.requestPointerLock?.();
        return;
      }
      return openMenu();
    }
    if (HD.Settings.matches(event, "stand")) {
      event.preventDefault();
      return toggleStanding();
    }
    if (HD.Settings.matches(event, "interact")) return interact();
    if (HD.Settings.matches(event, "phone")) {
      setMode(S.mode === "phone" ? "look" : "phone");
    }
    if (HD.Settings.matches(event, "throw")) {
      setMode(S.mode === "throw" ? "look" : "throw");
    }
    if (HD.Settings.matches(event, "item")) cycleItem();
    if (HD.Settings.matches(event, "rankings")) {
      HD.UI.showRankings(true, `DAY ${S.round} CURRENT RANKINGS`);
    }
  }
  function keyup(event) {
    setMovementKey(event.code, false);
  }
  function setMovementKey(code, pressed) {
    const direction = ["forward", "backward", "left", "right"]
      .find((action) => HD.Settings.binding(action) === code);
    if (!direction) return false;
    S.movement[direction] = pressed;
    return true;
  }
  function setMode(mode) {
    if (mode === "throw" && S.inventory[S.selectedItem] < 1) {
      const replacement = nextOwnedItem(S.selectedItem);
      if (replacement) selectItem(replacement, { announce: false });
      else {
        HD.UI.announce("You do not own a throwable item yet.");
        return setMode("look");
      }
    }
    S.mode = mode;
    const throwing = mode === "throw",
      phoning = mode === "phone";
    HD.world.heldItem.visible = throwing;
    phoneRequested = phoning;
    if (phoning) HD.world.phoneModel.visible = true;
    trajectory.visible = throwing;
    S.charging = false;
    S.throwPower = 0.55;
    HD.UI.power(S.throwPower, throwing);
    HD.UI.phone(phoning);
    if (HD.world.localPlayer) {
      HD.world.localPlayer.userData.activity = phoning
        ? "phone"
        : throwing
          ? "throw"
          : "watch";
      HD.Models.equipPlayer(HD.world.localPlayer, mode, S.selectedItem);
    }
    const displayMode = phoning ? "phone" : throwing ? "throw" : S.standing ? "walking" : "look";
    HD.UI.setMode(displayMode);
    if (phoning) document.exitPointerLock?.();
    else {
      canvas.requestPointerLock?.();
      HD.UI.announce(
        throwing
          ? `${HD.CONFIG.items[S.selectedItem].name} ready — hold, charge, and release to throw.`
          : "Looking around from your seat.",
      );
    }
  }
  function releaseThrow() {
    if (S.phase !== "racing") return HD.UI.announce("Hold that thought — the race hasn't started.");
    if (S.inventory[S.selectedItem] < 1) return setMode("look");
    const thrownType = S.selectedItem;
    const item = HD.CONFIG.items[thrownType];
    const start = new THREE.Vector3();
    camera.getWorldPosition(start);
    start.add(new THREE.Vector3(0.55, -0.35, -1).applyQuaternion(camera.quaternion));
    const velocity = new THREE.Vector3(0, 0, -1)
      .applyQuaternion(camera.quaternion)
      .normalize()
      .multiplyScalar(item.speed * S.throwPower);
    velocity.y += item.lift * S.throwPower;
    const visualOnly = HD.Network.isConnected() && !HD.Network.isHost();
    HD.Models.playPlayerThrow(HD.world.localPlayer, thrownType);
    throwAnimation = 0.38;
    HD.Race.launch(thrownType, start, velocity, { visualOnly });
    HD.Network.sendThrow(thrownType, start, velocity, S.throwPower);
    HD.UI.announce(`${item.name.toUpperCase()} AWAY!`);
    S.charging = false;
    S.throwPower = 0.55;
    autoSwapAfterThrow(thrownType);
  }
  function beginCharge(event) {
    if (event.button !== 0 || S.mode !== "throw") return;
    if (S.phase !== "racing") return HD.UI.announce("Wait for the race to start.");
    S.charging = true;
    S.throwPower = 0.55;
  }
  function endCharge(event) {
    if (event.button !== 0 || !S.charging) return;
    releaseThrow();
  }
  function update(dt) {
    if (S.standing) {
      if (!S.vendorOpen && !S.counterOpen && S.mode !== "phone") updateWalking(dt);
      else camera.position.copy(S.playerPosition);
    } else camera.position.copy(HD.CONFIG.seat);
    camera.rotation.order = "YXZ";
    camera.rotation.y = S.yaw;
    camera.rotation.x = S.pitch;
    if (!HD.Settings.reducedMotion()) {
      camera.position.y += Math.sin(S.elapsed * 2) * 0.008;
    }
    if (S.charging) S.throwPower = Math.min(1.35, S.throwPower + dt * 0.72);
    if (S.mode === "throw") {
      updateTrajectory();
      HD.UI.power(S.throwPower, true);
    }
    updatePhoneAnimation(dt);
    updateHeldAnimation(dt);
    syncLocalPlayer();
  }

  function updatePhoneAnimation(dt) {
    const phone = HD.world.phoneModel;
    if (!phone) return;

    const target = phoneRequested ? 1 : 0;
    phoneBlend = THREE.MathUtils.lerp(
      phoneBlend,
      target,
      1 - Math.exp(-dt * 10),
    );
    const eased = phoneBlend * phoneBlend * (3 - 2 * phoneBlend);
    phone.position.set(
      THREE.MathUtils.lerp(0.82, 0.46, eased),
      THREE.MathUtils.lerp(-1.45, -0.15, eased),
      THREE.MathUtils.lerp(-0.95, -1.08, eased),
    );
    phone.rotation.set(
      THREE.MathUtils.lerp(0.5, -0.12, eased),
      THREE.MathUtils.lerp(-0.5, -0.16, eased),
      THREE.MathUtils.lerp(0.18, -0.03, eased),
    );
    phone.scale.setScalar(0.86 + eased * 0.14);

    if (!phoneRequested && phoneBlend < 0.01) phone.visible = false;
  }

  function updateHeldAnimation(dt) {
    const hand = HD.world.heldItem;
    if (!hand?.visible) return;

    if (S.charging) {
      hand.position.set(0.7, -0.45, -1.12);
      hand.rotation.set(-1.08, -0.2, -0.48);
      return;
    }

    if (throwAnimation > 0) {
      throwAnimation = Math.max(0, throwAnimation - dt);
      const phase = 1 - throwAnimation / 0.55;
      const swing = THREE.MathUtils.clamp((phase - 0.28) / 0.5, 0, 1);
      hand.position.set(
        THREE.MathUtils.lerp(0.72, 0.35, swing),
        THREE.MathUtils.lerp(-0.42, 0.48, Math.sin(swing * Math.PI)),
        THREE.MathUtils.lerp(-1.05, -1.8, swing),
      );
      hand.rotation.set(
        THREE.MathUtils.lerp(-1.1, 1.2, swing),
        -0.2,
        THREE.MathUtils.lerp(-0.5, -0.12, swing),
      );
      return;
    }

    hand.position.set(0.65, -0.6, -1.4);
    hand.rotation.set(
      -0.25,
      -0.25,
      -0.3 + Math.sin(S.elapsed * 3) * 0.015,
    );
  }
  function syncLocalPlayer() {
    const player = HD.world.localPlayer;
    if (!player) return;

    player.userData.lookYaw = S.yaw;
    player.userData.lookPitch = S.pitch;
    if (S.standing) {
      player.position.set(
        camera.position.x,
        camera.position.y - HD.CONFIG.characterEyeOffset,
        camera.position.z,
      );
      if (!Number.isFinite(player.userData.bodyYaw)) {
        player.userData.bodyYaw = S.yaw;
      }
      const headLead = angleDifference(S.yaw, player.userData.bodyYaw);
      if (Math.abs(headLead) > 0.5 || player.userData.moving) {
        player.userData.bodyYaw += headLead * 0.1;
      }
      player.rotation.y = player.userData.bodyYaw;
      player.userData.headTurn = THREE.MathUtils.clamp(
        angleDifference(S.yaw, player.rotation.y),
        -0.85,
        0.85,
      );
    } else {
      player.position.set(
        HD.CONFIG.playerSeatRoot.x,
        camera.position.y - HD.CONFIG.characterEyeOffset,
        HD.CONFIG.playerSeatRoot.z,
      );
      player.rotation.y = HD.CONFIG.playerSeatYaw;
      player.userData.bodyYaw = player.rotation.y;
      player.userData.headTurn = THREE.MathUtils.clamp(
        angleDifference(S.yaw, player.rotation.y),
        -0.95,
        0.95,
      );
    }
    player.userData.moving = S.standing && Object.values(S.movement).some(Boolean);
  }

  function angleDifference(target, current) {
    return Math.atan2(Math.sin(target - current), Math.cos(target - current));
  }

  // ---------------------------------------------------------------------------
  // Walking, stairs, vendors, and seating
  // ---------------------------------------------------------------------------

  function updateWalking(dt) {
    walkPrevious.copy(S.playerPosition);
    const previousZone = walkZoneAt(S.playerPosition.x, S.playerPosition.z);
    walkForward.set(-Math.sin(S.yaw), 0, -Math.cos(S.yaw));
    walkRight.set(Math.cos(S.yaw), 0, -Math.sin(S.yaw));
    walkInput.set(0, 0, 0);
    if (S.movement.forward) walkInput.add(walkForward);
    if (S.movement.backward) walkInput.sub(walkForward);
    if (S.movement.right) walkInput.add(walkRight);
    if (S.movement.left) walkInput.sub(walkRight);
    if (walkInput.lengthSq() > 0) {
      walkInput.normalize().multiplyScalar(HD.CONFIG.walkSpeed * dt);
      S.playerPosition.add(walkInput);
    }
    const insideFence = Math.sqrt((S.playerPosition.x / 73.2) ** 2 + (S.playerPosition.z / 43.2) ** 2);
    const blocked = collidesWithBarrier(S.playerPosition.x, S.playerPosition.z);
    const nextZone = walkZoneAt(S.playerPosition.x, S.playerPosition.z);
    const skippedStairs = previousZone !== nextZone &&
      previousZone !== "stairs" &&
      nextZone !== "stairs";
    if (
      insideFence < 1.03 ||
      blocked ||
      !isWalkable(S.playerPosition.x, S.playerPosition.z) ||
      skippedStairs
    ) {
      S.playerPosition.x = walkPrevious.x;
      S.playerPosition.z = walkPrevious.z;
    }
    S.playerPosition.x = THREE.MathUtils.clamp(S.playerPosition.x, -119, 119);
    S.playerPosition.z = THREE.MathUtils.clamp(S.playerPosition.z, -82, 82);
    S.playerPosition.y = walkingEyeHeight(S.playerPosition.x, S.playerPosition.z);
    camera.position.copy(S.playerPosition);
  }
  function collidesWithBarrier(x, z) {
    return (HD.world.barriers || []).some((barrier) => {
      const dx = x - barrier.x;
      const dz = z - barrier.z;
      if (barrier.type === "box") {
        const cosine = Math.cos(barrier.angle);
        const sine = Math.sin(barrier.angle);
        const localX = dx * cosine - dz * sine;
        const localZ = dx * sine + dz * cosine;
        return Math.abs(localX) < barrier.halfWidth &&
          Math.abs(localZ) < barrier.halfDepth;
      }
      return dx * dx + dz * dz < barrier.radius * barrier.radius;
    });
  }

  function walkZoneAt(x, z) {
    if (staircaseProgress(x, z) !== null) return "stairs";
    const row = grandstandRowAt(x, z);
    if (row !== null) return `row-${row}`;

    const trackWalk = Math.sqrt((x / 77.25) ** 2 + (z / 47.25) ** 2);
    if (trackWalk >= 0.92 && trackWalk <= 1.08) return "track-walk";

    const upper = Math.sqrt((x / 110.6) ** 2 + (z / 75.4) ** 2);
    if (upper >= 0.9 && upper <= 1.1) return "upper-concourse";
    return null;
  }
  function isWalkable(x, z) {
    const onStairs = staircaseProgress(x, z) !== null;
    const grandstandRow = grandstandRowAt(x, z);
    const trackWalk = Math.sqrt((x / 77.25) ** 2 + (z / 47.25) ** 2);
    const onTrackWalk = trackWalk >= 0.92 && trackWalk <= 1.08;
    const upperConcourse = Math.sqrt((x / 110.6) ** 2 + (z / 75.4) ** 2);
    const onUpperConcourse = upperConcourse >= 0.9 && upperConcourse <= 1.1;
    return onStairs || grandstandRow !== null || onTrackWalk || onUpperConcourse;
  }
  function walkingEyeHeight(x, z) {
    const stairProgress = staircaseProgress(x, z);
    if (stairProgress !== null) return stairHeightForProgress(stairProgress) + HD.CONFIG.eyeHeight;

    const grandstandRow = grandstandRowAt(x, z);
    if (grandstandRow !== null) {
      return HD.CONFIG.grandstandBaseHeight +
        grandstandRow * 1.5 +
        HD.CONFIG.eyeHeight;
    }

    const ovalDistance = Math.sqrt((x / 77.25) ** 2 + (z / 47.25) ** 2);
    if (ovalDistance <= 1.08) return 1.65 + HD.CONFIG.eyeHeight;
    return 13.5 + HD.CONFIG.eyeHeight;
  }

  function grandstandRowAt(x, z) {
    for (let row = 0; row < 7; row++) {
      const radiusX = 82.1 + row * 3.25;
      const radiusZ = 51.85 + row * 2.75;
      const distance = Math.sqrt((x / radiusX) ** 2 + (z / radiusZ) ** 2);
      const tolerance = 1.2 / Math.min(radiusX, radiusZ);
      if (Math.abs(distance - 1) <= tolerance) return row;
    }
    return null;
  }
  function staircaseProgress(x, z) {
    const stairs = HD.CONFIG.stairs;
    for (const angle of stairAngles) {
      const startX = Math.cos(angle) * stairs.startX;
      const startZ = Math.sin(angle) * stairs.startZ;
      const deltaX = Math.cos(angle) * stairs.endX - startX;
      const deltaZ = Math.sin(angle) * stairs.endZ - startZ;
      const lengthSquared = deltaX * deltaX + deltaZ * deltaZ;
      const offsetX = x - startX;
      const offsetZ = z - startZ;
      const progress = (offsetX * deltaX + offsetZ * deltaZ) / lengthSquared;
      const perpendicular =
        Math.abs(deltaX * offsetZ - deltaZ * offsetX) / Math.sqrt(lengthSquared);

      if (perpendicular <= stairs.width / 2 && progress >= 0 && progress <= 1) {
        return progress;
      }
    }

    return null;
  }

  function stairHeightForProgress(progress) {
    return THREE.MathUtils.lerp(
      HD.CONFIG.stairs.bottomHeight,
      HD.CONFIG.stairs.topHeight,
      progress,
    );
  }
  function toggleStanding() {
    if (S.mode === "phone" || S.vendorOpen || S.counterOpen) return;
    S.standing = !S.standing;
    if (S.standing) {
      S.playerPosition.copy(camera.position);
      HD.Models.setPlayerStanding(HD.world.localPlayer, true);
      HD.UI.setMode("walking");
      HD.UI.announce("You stand up. Use WASD to walk, Space to return to your seat.");
    } else {
      S.playerPosition.copy(HD.CONFIG.seat);
      HD.Models.setPlayerStanding(HD.world.localPlayer, false);
      HD.UI.setMode("look");
      HD.UI.announce("You return to your seat.");
    }
  }
  function interact() {
    if (S.vendorOpen) return closeVendor();
    if (S.counterOpen) return closeBetCounter();
    if (!S.standing) return HD.UI.announce("Press Space to stand up first.");
    const shops = HD.world.shopPositions || [];
    const counters = HD.world.betCounterPositions || [];
    const shopDistance = nearestDistance(shops);
    const counterDistance = nearestDistance(counters);

    if (counterDistance < 7 && counterDistance < shopDistance) {
      S.counterOpen = true;
      document.exitPointerLock?.();
      HD.UI.betCounter(true);
      return;
    }

    if (shopDistance >= 8) {
      return HD.UI.announce("Move closer to a shop or a fee-free betting counter.");
    }

    S.vendorOpen = true;
    document.exitPointerLock?.();
    HD.UI.vendor(true);
  }
  function nearestDistance(positions) {
    return positions.reduce(
      (closest, position) => Math.min(closest, position.distanceTo(S.playerPosition)),
      Infinity,
    );
  }
  function closeVendor() {
    if (!S.vendorOpen) return;
    S.vendorOpen = false;
    HD.UI.vendor(false);
    canvas.requestPointerLock?.();
  }
  function closeBetCounter() {
    if (!S.counterOpen) return;
    S.counterOpen = false;
    HD.UI.betCounter(false);
    canvas.requestPointerLock?.();
  }
  function forceStand() {
    if (!S.standing) toggleStanding();
  }
  function sitDown() {
    closeVendor();
    closeBetCounter();
    S.standing = false;
    HD.Models.setPlayerStanding(HD.world.localPlayer, false);
    S.playerPosition.copy(HD.CONFIG.seat);
    HD.UI.setMode("look");
  }
  function updateTrajectory() {
    camera.getWorldPosition(trajectoryStart);
    trajectoryVelocity.set(0.55, -0.35, -1).applyQuaternion(camera.quaternion);
    trajectoryStart.add(trajectoryVelocity);
    const item = HD.CONFIG.items[S.selectedItem];
    trajectoryVelocity
      .set(0, 0, -1)
      .applyQuaternion(camera.quaternion)
      .normalize()
      .multiplyScalar(item.speed * S.throwPower);
    trajectoryVelocity.y += item.lift * S.throwPower;
    let pointCount = 0;
    for (let i = 0; i < 42; i++) {
      const t = i * 0.055;
      const offset = i * 3;
      const x = trajectoryStart.x + trajectoryVelocity.x * t;
      const y =
        trajectoryStart.y + trajectoryVelocity.y * t - item.gravity * 0.5 * t * t;
      const z = trajectoryStart.z + trajectoryVelocity.z * t;
      trajectoryPositions[offset] = x;
      trajectoryPositions[offset + 1] = y;
      trajectoryPositions[offset + 2] = z;
      pointCount++;
      if (y <= 0.35) break;
    }
    trajectory.geometry.attributes.position.needsUpdate = true;
    trajectory.geometry.setDrawRange(0, pointCount);
  }

  // ---------------------------------------------------------------------------
  // Equipped items and pause flow
  // ---------------------------------------------------------------------------

  function selectItem(type, options = {}) {
    if (!HD.CONFIG.items[type]) return;
    S.selectedItem = type;
    Object.entries(HD.world.heldItems).forEach(([id, model]) => {
      model.visible = id === type;
    });
    if (S.mode === "throw") {
      HD.Models.equipPlayer(HD.world.localPlayer, "throw", type);
    }
    if (options.announce !== false) {
      HD.UI.announce(`${HD.CONFIG.items[type].name} selected.`);
    }
    HD.UI.render();
  }
  function cycleItem() {
    const ids = Object.keys(HD.CONFIG.items).filter((id) => S.inventory[id] > 0);
    if (!ids.length) return HD.UI.announce("You do not own any throwable items yet.");
    const currentIndex = Math.max(-1, ids.indexOf(S.selectedItem));
    const next = ids[(currentIndex + 1) % ids.length];
    selectItem(next);
  }

  function selectHotbarSlot(index) {
    const type = Object.keys(HD.CONFIG.items)[index];
    if (!type) return;
    if (S.inventory[type] < 1) {
      return HD.UI.announce(`${HD.CONFIG.items[type].name} is out of stock.`);
    }
    selectItem(type);
  }

  function nextOwnedItem(afterType) {
    const ids = Object.keys(HD.CONFIG.items);
    const start = Math.max(0, ids.indexOf(afterType));
    for (let offset = 1; offset <= ids.length; offset++) {
      const candidate = ids[(start + offset) % ids.length];
      if (S.inventory[candidate] > 0) return candidate;
    }
    return null;
  }

  function autoSwapAfterThrow(thrownType) {
    if (S.inventory[thrownType] > 0) {
      setMode("throw");
      return;
    }

    const replacement = nextOwnedItem(thrownType);
    if (!replacement) {
      setMode("look");
      HD.UI.announce(`${HD.CONFIG.items[thrownType].name} depleted. No throwables remain.`);
      return;
    }

    selectItem(replacement, { announce: false });
    setMode("throw");
    HD.UI.announce(
      `${HD.CONFIG.items[thrownType].name} depleted — switched to ` +
      `${HD.CONFIG.items[replacement].name}.`,
    );
  }
  function openMenu() {
    S.paused = true;
    setMode("look");
    document.exitPointerLock?.();
    HD.UI.menu(true, true);
  }
  function closeMenu() {
    S.paused = false;
    HD.UI.menu(false);
    if (!S.matchStarted) {
      S.matchStarted = true;
      canvas.requestPointerLock?.();
      HD.UI.showDay(1, () => {});
      return;
    }
    canvas.requestPointerLock?.();
  }
  return {
    init,
    update,
    setMode,
    selectItem,
    openMenu,
    closeMenu,
    closeVendor,
    closeBetCounter,
    forceStand,
    sitDown,
  };
})();
