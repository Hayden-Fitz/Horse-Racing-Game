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
  const throwOffset = new THREE.Vector3();
  let trajectoryPositions;
  let phoneRequested = false;
  let phoneBlend = 0;
  let throwAnimation = 0;
  let chargeSource = null;
  let chargeTime = 0;
  const gamepadMove = { x: 0, y: 0 };
  let gamepadButtons = [];
  let gamepadTrigger = false;
  let activeGamepad = null;
  let jumpVelocity = 0;
  let jumpOffset = 0;

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
    document.addEventListener("pointerup", endCharge);
    document.addEventListener("pointercancel", cancelCharge);
    document.addEventListener("mousemove", look);
    document.addEventListener("keydown", keydown);
    document.addEventListener("keyup", keyup);
    window.addEventListener("blur", () => {
      cancelCharge();
      Object.keys(S.movement).forEach((direction) => { S.movement[direction] = false; });
    });
    document.addEventListener("pointerlockchange", () => {
      if (!document.pointerLockElement) cancelCharge();
      if (!document.pointerLockElement && S.mode !== "phone")
        HD.UI.announce("Click the stadium to resume looking around.");
    });
  }
  function click() {
    if (S.paused || !S.matchStarted) return;
    if (S.mode === "phone") return;
    if (S.mode === "throw") return;
    if (document.pointerLockElement !== canvas) canvas.requestPointerLock();
  }
  function look(event) {
    if (S.paused || !S.matchStarted) return;
    if (document.pointerLockElement !== canvas || S.mode === "phone") return;
    const sensitivity = HD.Settings.sensitivity();
    S.yaw -= event.movementX * 0.0021 * sensitivity;
    S.yaw = THREE.MathUtils.euclideanModulo(S.yaw + Math.PI, Math.PI * 2) - Math.PI;
    S.pitch = THREE.MathUtils.clamp(
      S.pitch - event.movementY * 0.0018 * sensitivity,
      -Math.PI / 2 + 0.02,
      Math.PI / 2 - 0.02,
    );
  }
  function keydown(event) {
    // Typing in Messages, lobby names or settings must never trigger movement,
    // item selection, throwing or the remappable phone shortcut.
    if (isTextEntry(event.target)) return;
    if (S.paused || !S.matchStarted) return;
    if (setMovementKey(event.code, true)) return;
    if (event.repeat) return;
    if (/^Digit[0-9]$/.test(event.code)) {
      const digit = Number(event.code.slice(-1));
      return selectHotbarSlot(digit === 0 ? 9 : digit - 1);
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
      return jump();
    }
    if (HD.Settings.matches(event, "interact")) return interact();
    if (HD.Settings.matches(event, "phone")) {
      setMode(S.mode === "phone" ? "look" : "phone");
    }
    if (HD.Settings.matches(event, "throw")) {
      return setMode(S.mode === "throw" ? "look" : "throw");
    }
    if (HD.Settings.matches(event, "item")) cycleItem();
  }
  function keyup(event) {
    setMovementKey(event.code, false);
    if (isTextEntry(event.target)) return;
  }
  function setMovementKey(code, pressed) {
    const direction = ["forward", "backward", "left", "right"]
      .find((action) => HD.Settings.binding(action) === code);
    if (!direction) return false;
    S.movement[direction] = pressed;
    return true;
  }

  function isTextEntry(target) {
    return Boolean(
      target?.isContentEditable ||
      /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName || ""),
    );
  }
  function setMode(mode) {
    if (mode !== "phone") S.atSabotageCounter = false;
    if (mode === "throw" && !ownsItem(S.selectedItem)) {
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
    setTrajectoryVisible(false);
    S.charging = false;
    S.throwPower = 0;
    chargeSource = null;
    chargeTime = 0;
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
    const displayMode = phoning ? "phone" : throwing ? "throw" : "walking";
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
    if (!S.charging) return;
    if (chargeTime < 0.12) {
      cancelCharge();
      HD.UI.announce("Hold the throw control, watch the power meter, then release.");
      return;
    }
    if (S.paused || S.phase !== "racing") {
      cancelCharge();
      return;
    }
    if (S.inventory[S.selectedItem] < 1) return setMode("look");
    const thrownType = S.selectedItem;
    const item = HD.CONFIG.items[thrownType];
    const start = new THREE.Vector3();
    const velocity = new THREE.Vector3();
    calculateThrowLaunch(item, S.throwPower, start, velocity);
    const visualOnly = HD.Network.isConnected() && !HD.Network.isHost();
    HD.Models.playPlayerThrow(HD.world.localPlayer, thrownType);
    throwAnimation = 0.55;
    HD.Race.launch(thrownType, start, velocity, { visualOnly });
    HD.Network.sendThrow(thrownType, start, velocity, S.throwPower);
    HD.UI.announce(`${item.name.toUpperCase()} AWAY!`);
    S.charging = false;
    chargeSource = null;
    chargeTime = 0;
    S.throwPower = 0;
    setTrajectoryVisible(false);
    autoSwapAfterThrow(thrownType);
  }
  function beginCharge(event) {
    if (event.button !== 0 || S.mode !== "throw") return;
    event.preventDefault();
    startCharge("pointer");
  }
  function startCharge(source) {
    if (S.paused || !S.matchStarted || !ownsItem(S.selectedItem)) return;
    if (S.mode !== "throw" || S.charging) return;
    if (S.phase !== "racing") {
      HD.UI.announce("Wait for the race to start.");
      return;
    }
    S.charging = true;
    chargeSource = source;
    chargeTime = 0;
    S.throwPower = 0;
    setTrajectoryVisible(false);
  }
  function endCharge(event) {
    if (event.button !== 0 || !S.charging || chargeSource !== "pointer") return;
    releaseThrow();
  }
  function cancelCharge() {
    if (!S.charging) return;
    S.charging = false;
    chargeSource = null;
    chargeTime = 0;
    S.throwPower = 0;
    setTrajectoryVisible(false);
  }
  function update(dt) {
    if (S.charging && (S.paused || S.phase !== "racing")) cancelCharge();
    if (!S.vendorOpen && !S.counterOpen) {
      updateWalking(dt, S.mode !== "phone");
    }
    else camera.position.copy(S.playerPosition);
    camera.rotation.order = "YXZ";
    camera.rotation.y = S.yaw;
    camera.rotation.x = S.pitch;
    if (!HD.Settings.reducedMotion()) {
      camera.position.y += Math.sin(S.elapsed * 2) * 0.008;
    }
    if (S.charging) {
      chargeTime += dt;
      S.throwPower = Math.min(1, chargeTime / 1.35);
    }
    const showTrajectory = S.mode === "throw" && S.charging && S.throwPower > 0.01;
    setTrajectoryVisible(showTrajectory);
    if (showTrajectory) {
      updateTrajectory();
    }
    HD.UI.power(S.throwPower, S.mode === "throw");
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
      const windup = THREE.MathUtils.clamp((S.throwPower - 0.4) / 0.95, 0, 1);
      hand.position.set(
        0.7,
        THREE.MathUtils.lerp(-0.5, -0.34, windup),
        THREE.MathUtils.lerp(-1.12, -0.92, windup),
      );
      hand.rotation.set(
        THREE.MathUtils.lerp(-0.82, -1.28, windup),
        -0.2,
        THREE.MathUtils.lerp(-0.38, -0.58, windup),
      );
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
    player.userData.headPitch = S.pitch;
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
    player.userData.moving = Object.values(S.movement).some(Boolean) ||
      Math.abs(gamepadMove.x) > 0 || Math.abs(gamepadMove.y) > 0;
  }

  function angleDifference(target, current) {
    return Math.atan2(Math.sin(target - current), Math.cos(target - current));
  }

  // ---------------------------------------------------------------------------
  // Walking, stairs, vendors, and seating
  // ---------------------------------------------------------------------------

  function updateWalking(dt, allowMovement = true) {
    walkPrevious.copy(S.playerPosition);
    const previousGroundHeight = walkingEyeHeight(walkPrevious.x, walkPrevious.z);
    const previousEyeHeight = S.playerPosition.y;
    const previousZone = walkZoneAt(S.playerPosition.x, S.playerPosition.z);
    walkForward.set(-Math.sin(S.yaw), 0, -Math.cos(S.yaw));
    walkRight.set(Math.cos(S.yaw), 0, -Math.sin(S.yaw));
    walkInput.set(0, 0, 0);
    if (allowMovement) {
      if (S.movement.forward) walkInput.add(walkForward);
      if (S.movement.backward) walkInput.sub(walkForward);
      if (S.movement.right) walkInput.add(walkRight);
      if (S.movement.left) walkInput.sub(walkRight);
      walkInput.addScaledVector(walkRight, gamepadMove.x);
      walkInput.addScaledVector(walkForward, -gamepadMove.y);
    }
    if (walkInput.lengthSq() > 0) {
      walkInput.normalize().multiplyScalar(HD.CONFIG.walkSpeed * dt);
      S.playerPosition.add(walkInput);
    }

    // Follow stair elevation without pulling the player sideways into the aisle.

    const insideFence = Math.sqrt((S.playerPosition.x / 73.2) ** 2 + (S.playerPosition.z / 43.2) ** 2);
    const nextZone = walkZoneAt(S.playerPosition.x, S.playerPosition.z);
    const blocked = collidesWithBarrier(S.playerPosition.x, S.playerPosition.z);
    const nextHeight = walkingEyeHeight(S.playerPosition.x, S.playerPosition.z);
    const stairTransition = previousZone === 'stairs' || nextZone === 'stairs';
    const maximumStepHeight = stairTransition ? 1.2 : 0.85;
    const rise = nextHeight - previousGroundHeight;
    const hasJumpClearance = jumpOffset > 0.001 &&
      previousEyeHeight >= nextHeight - 0.08;
    const unsafeRise = rise > maximumStepHeight && !hasJumpClearance;
    const adjacentRows = areAdjacentRows(previousZone, nextZone);
    const skippedStairs = previousZone !== nextZone &&
      previousZone !== "stairs" &&
      nextZone !== "stairs" &&
      !adjacentRows;
    if (
      insideFence < 1.03 ||
      blocked ||
      unsafeRise ||
      !isWalkable(S.playerPosition.x, S.playerPosition.z) ||
      skippedStairs
    ) {
      S.playerPosition.x = walkPrevious.x;
      S.playerPosition.z = walkPrevious.z;
    }
    S.playerPosition.x = THREE.MathUtils.clamp(S.playerPosition.x, -128, 128);
    S.playerPosition.z = THREE.MathUtils.clamp(S.playerPosition.z, -136, 89);

    const groundEyeHeight = walkingEyeHeight(
      S.playerPosition.x,
      S.playerPosition.z,
    );
    const steppingOnSupportedSurface = jumpOffset <= 0.001 &&
      groundEyeHeight >= previousGroundHeight - 0.08;

    if (steppingOnSupportedSurface) {
      S.playerPosition.y = groundEyeHeight;
      jumpOffset = 0;
      jumpVelocity = 0;
    } else {
      // Game characters are larger than metre scale. Keep a natural, quicker
      // fall and integrate acceleration analytically for consistent frame rates.
      const gravity = 28;
      S.playerPosition.y = previousEyeHeight + jumpVelocity * dt
        - 0.5 * gravity * dt * dt;
      jumpVelocity -= gravity * dt;

      if (S.playerPosition.y <= groundEyeHeight) {
        S.playerPosition.y = groundEyeHeight;
        jumpVelocity = 0;
      }

      jumpOffset = Math.max(0, S.playerPosition.y - groundEyeHeight);
    }

    camera.position.copy(S.playerPosition);
  }

  function areAdjacentRows(firstZone, secondZone) {
    if ((firstZone === 'row-0' && secondZone === 'track-walk') ||
        (secondZone === 'row-0' && firstZone === 'track-walk')) {
      return true;
    }
    if (!firstZone?.startsWith('row-') || !secondZone?.startsWith('row-')) {
      return false;
    }

    const firstRow = Number(firstZone.slice(4));
    const secondRow = Number(secondZone.slice(4));
    return Math.abs(firstRow - secondRow) <= 1;
  }

  function jump() {
    if (S.paused || S.mode === 'phone' || S.vendorOpen || S.counterOpen) return;
    if (jumpOffset > 0.001) return;
    // A 1.78-unit apex clears the 1.5-unit rise between seating rows.
    jumpVelocity = 10;
    jumpOffset = 0.01;
    HD.Audio?.cue?.('jump');
  }
  function collidesWithBarrier(x, z) {
    return [...(HD.world.barriers || []), ...(HD.world.structuralBarriers || [])].some((barrier) => {
      // Jump height never bypasses fences or storefront walls. Barrier-level
      // filtering follows the floor beneath the player instead of their arc.
      const floorY = S.playerPosition.y - HD.CONFIG.eyeHeight - jumpOffset;
      if (floorY > (barrier.maxY ?? 19) || floorY + HD.CONFIG.eyeHeight < (barrier.minY ?? 13.5)) return false;
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
    if (staircaseProgress(x, z) !== null) {
      return 'stairs';
    }
    const upper = HD.Stadium?.upperWalkSurfaceAt?.(
      x, z, S.playerPosition.y - HD.CONFIG.eyeHeight, walkInput,
    );
    if (upper) return upper.stairs ? 'stairs' : upper.zone;
    if (staircaseProgress(x, z) !== null) {
      return "stairs";
    }
    const row = grandstandRowAt(x, z);
    if (row !== null) return `row-${row}`;

    const trackWalk = Math.sqrt((x / 77.25) ** 2 + (z / 47.25) ** 2);
    if (trackWalk >= 0.92 && trackWalk <= 1.08) return "track-walk";

    if (onUpperConcourseSurface(x, z)) return "upper-concourse";
    return null;
  }
  function isWalkable(x, z) {
    if (HD.Stadium?.upperWalkSurfaceAt?.(
      x, z, S.playerPosition.y - HD.CONFIG.eyeHeight, walkInput,
    )) return true;
    const onStairs = staircaseProgress(x, z) !== null;
    const grandstandRow = grandstandRowAt(x, z);
    const trackWalk = Math.sqrt((x / 77.25) ** 2 + (z / 47.25) ** 2);
    const onTrackWalk = trackWalk >= 0.92 && trackWalk <= 1.08;
    const onUpperConcourse = onUpperConcourseSurface(x, z);
    return onStairs || grandstandRow !== null || onTrackWalk || onUpperConcourse;
  }
  function walkingEyeHeight(x, z) {
    const mainStair = stairCollisionSnap(x, z);
    if (mainStair) {
      return mainStair.height + HD.CONFIG.eyeHeight;
    }
    const upper = HD.Stadium?.upperWalkSurfaceAt?.(
      x, z, S.playerPosition.y - HD.CONFIG.eyeHeight, walkInput,
    );
    if (upper) return upper.y + HD.CONFIG.eyeHeight;
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

  function insideCommentatorBooth(x, z) {
    const booth = HD.world.commentatorBox;
    if (!booth?.polygon) return false;
    let inside = false;
    for (let index = 0, previous = booth.polygon.length - 1; index < booth.polygon.length; previous = index++) {
      const [x1, z1] = booth.polygon[index];
      const [x2, z2] = booth.polygon[previous];
      const crosses = (z1 > z) !== (z2 > z) &&
        x < ((x2 - x1) * (z - z1)) / (z2 - z1) + x1;
      if (crosses) inside = !inside;
    }
    return inside;
  }

  function commentatorEntranceProgress(x, z) {
    const entrance = HD.world.commentatorBox?.entrance;
    if (!entrance?.top || !entrance?.bottom) return null;

    const [topX, topZ] = entrance.top;
    const [bottomX, bottomZ] = entrance.bottom;
    const pathX = bottomX - topX;
    const pathZ = bottomZ - topZ;
    const pathLengthSquared = pathX * pathX + pathZ * pathZ;
    if (pathLengthSquared < 0.01) return null;

    const progress = (
      (x - topX) * pathX +
      (z - topZ) * pathZ
    ) / pathLengthSquared;
    if (progress < -0.04 || progress > 1.04) return null;

    const clampedProgress = THREE.MathUtils.clamp(progress, 0, 1);
    const closestX = topX + pathX * clampedProgress;
    const closestZ = topZ + pathZ * clampedProgress;
    const distanceFromCenter = Math.hypot(x - closestX, z - closestZ);
    if (distanceFromCenter > entrance.width / 2) return null;

    return clampedProgress;
  }

  function onUpperConcourseSurface(x, z) {
    const insideOuterEdge = (x / 120) ** 2 + (z / 83) ** 2 <= 1;
    const outsideInnerEdge = (x / 103.25) ** 2 + (z / 69.75) ** 2 >= 1;
    return insideOuterEdge && outsideInnerEdge;
  }

  function grandstandRowAt(x, z) {
    for (let row = 0; row < 7; row++) {
      const radiusX = 82.1 + row * 3.25;
      const radiusZ = 51.85 + row * 2.75;
      const distance = Math.sqrt((x / radiusX) ** 2 + (z / radiusZ) ** 2);
      // Tier slabs meet one another. A slightly overlapping movement surface
      // prevents invisible dead strips between the visible concrete rows.
      const tolerance = 1.55 / Math.min(radiusX, radiusZ);
      if (Math.abs(distance - 1) <= tolerance) return row;
    }
    return null;
  }
  function staircaseProgress(x, z) {
    return stairCollisionSnap(x, z)?.progress ?? null;
  }

  function stairCollisionSnap(x, z) {
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
      const pathLength = Math.sqrt(lengthSquared);
      const sideX = -deltaZ / pathLength;
      const sideZ = deltaX / pathLength;
      const lateral = offsetX * sideX + offsetZ * sideZ;
      const perpendicular = Math.abs(lateral);

      if (
        // The visible aisle is eight units wide. A generous invisible capture
        // strip lets players enter it sideways from any seating row without
        // having to line their feet up with the concrete edge pixel-perfectly.
        perpendicular <= stairs.width / 2 + 2.6 &&
        progress >= -0.2 &&
        progress <= 1.18
      ) {
        const clampedProgress = THREE.MathUtils.clamp(progress, 0, 1);
        const expectedFloor = stairHeightForProgress(clampedProgress, angle);
        const currentFloor = S.playerPosition.y - HD.CONFIG.eyeHeight;
        if (Math.abs(expectedFloor - currentFloor) <= 1.25) {
          const usableHalfWidth = stairs.width / 2 - 0.45;
          const safeLateral = THREE.MathUtils.clamp(
            lateral,
            -usableHalfWidth,
            usableHalfWidth,
          );
          return {
            progress: clampedProgress,
            height: expectedFloor,
            x: startX + deltaX * progress + sideX * safeLateral,
            z: startZ + deltaZ * progress + sideZ * safeLateral,
          };
        }
      }
    }

    return null;
  }

  function stairHeightForProgress(progress, angle = 0) {
    const stairs = HD.CONFIG.stairs;
    const startX = Math.cos(angle) * stairs.startX;
    const startZ = Math.sin(angle) * stairs.startZ;
    const deltaX = Math.cos(angle) * stairs.endX - startX;
    const deltaZ = Math.sin(angle) * stairs.endZ - startZ;
    const lengthSquared = deltaX * deltaX + deltaZ * deltaZ;
    const segments = [];
    let cursor = 0;
    let previousHeight = stairs.bottomHeight;

    for (let row = 0; row < 7; row++) {
      const innerX = Math.cos(angle) * (80.5 + row * 3.25);
      const innerZ = Math.sin(angle) * (50.5 + row * 2.75);
      const outerX = Math.cos(angle) * (83.75 + row * 3.25);
      const outerZ = Math.sin(angle) * (53.25 + row * 2.75);
      const innerProgress = (
        (innerX - startX) * deltaX +
        (innerZ - startZ) * deltaZ
      ) / lengthSquared;
      const outerProgress = (
        (outerX - startX) * deltaX +
        (outerZ - startZ) * deltaZ
      ) / lengthSquared;
      const center = (innerProgress + outerProgress) / 2;
      const halfWidth = (outerProgress - innerProgress) * 0.29;
      const landingStart = THREE.MathUtils.clamp(center - halfWidth, cursor, 1);
      const landingEnd = THREE.MathUtils.clamp(center + halfWidth, landingStart, 1);
      const height = HD.CONFIG.grandstandBaseHeight + row * 1.5;
      const middle = (cursor + landingStart) / 2;
      if (middle > cursor + 0.001) {
        segments.push({
          end: middle,
          height: THREE.MathUtils.lerp(previousHeight, height, 0.5),
        });
      }
      if (landingStart > middle + 0.001) {
        segments.push({ end: landingStart, height });
      }
      segments.push({ end: landingEnd, height });
      cursor = landingEnd;
      previousHeight = height;
    }
    const finalSplit = (cursor + 1) / 2;
    segments.push({
      end: finalSplit,
      height: THREE.MathUtils.lerp(previousHeight, stairs.topHeight, 0.5),
    });
    segments.push({ end: 1, height: stairs.topHeight });
    const surface = segments.find(segment => progress <= segment.end + 0.0001);
    if (surface) return surface.height;
    return stairs.topHeight;
  }
  function interact() {
    if (S.vendorOpen) return closeVendor();
    if (S.counterOpen) return closeBetCounter();
    const shops = HD.world.shopPositions || [];
    const counters = HD.world.betCounterPositions || [];
    const fixers = HD.world.sabotageCounterPositions || [];
    const shopDistance = nearestDistance(shops);
    const counterDistance = nearestDistance(counters);
    const fixerDistance = nearestDistance(fixers);

    if (fixerDistance < 7 && fixerDistance < Math.min(shopDistance, counterDistance)) {
      setMode("phone");
      S.atSabotageCounter = true;
      document.querySelector('[data-app="sabotage"]')?.click();
      HD.UI.render();
      HD.UI.announce("The paddock fixer offers two cash jobs at 33% off.");
      return;
    }

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
    S.standing = true;
    HD.Models.setPlayerStanding(HD.world.localPlayer, true);
  }
  function updateTrajectory() {
    const item = HD.CONFIG.items[S.selectedItem];
    calculateThrowLaunch(item, S.throwPower, trajectoryStart, trajectoryVelocity);
    const pointCount = HD.Race.predictTrajectory(
      S.selectedItem,
      trajectoryStart,
      trajectoryVelocity,
      trajectoryPositions,
      42,
      0.055,
    );
    trajectory.geometry.attributes.position.needsUpdate = true;
    trajectory.geometry.setDrawRange(0, pointCount);
  }

  function calculateThrowLaunch(item, power, start, velocity) {
    const profile = HD.itemThrowProfile(item);
    camera.getWorldPosition(start);
    throwOffset
      .set(0.55, -0.35, -1)
      .applyQuaternion(camera.quaternion);
    start.add(throwOffset);

    velocity
      .set(0, 0, -1)
      .applyQuaternion(camera.quaternion)
      .normalize()
      .multiplyScalar(
        item.speed * power * HD.CONFIG.throwVelocityMultiplier,
      );
    velocity.x *= profile.rangeMultiplier;
    velocity.z *= profile.rangeMultiplier;
    velocity.y = (velocity.y + item.lift * power * HD.CONFIG.throwVelocityMultiplier) *
      profile.liftMultiplier;
  }

  function setTrajectoryVisible(visible) {
    if (trajectory) trajectory.visible = visible;
    if (HD.world.trajectoryGlow) HD.world.trajectoryGlow.visible = visible;
  }

  // ---------------------------------------------------------------------------
  // Equipped items and pause flow
  // ---------------------------------------------------------------------------

  function ownsItem(type) {
    return Object.hasOwn(HD.CONFIG.items, type) &&
      Number.isFinite(S.inventory[type]) && S.inventory[type] > 0;
  }

  function selectItem(type, options = {}) {
    if (!ownsItem(type)) return;
    cancelCharge();
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
    return HD.nextInventoryItem(S.inventory, afterType);
  }

  function autoSwapAfterThrow(thrownType) {
    if (S.inventory[thrownType] > 0) {
      setMode("throw");
      return;
    }

    const replacement = nextOwnedItem(thrownType);
    if (!replacement) {
      S.selectedItem = null;
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
    Object.keys(S.movement).forEach((direction) => { S.movement[direction] = false; });
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

  function updateGamepad(dt) {
    const pads = navigator.getGamepads?.() || [];
    const pad = [...pads].find(Boolean);
    if (!pad) {
      if (activeGamepad !== null) HD.UI.announce('Controller disconnected.');
      activeGamepad = null;
      gamepadMove.x = gamepadMove.y = 0;
      gamepadButtons = [];
      gamepadTrigger = false;
      return;
    }
    if (activeGamepad !== pad.index) HD.UI.announce('Controller connected.');
    activeGamepad = pad.index;
    const deadzone = HD.Settings.controllerDeadzone();
    gamepadMove.x = gamepadAxis(pad.axes[0], deadzone);
    gamepadMove.y = gamepadAxis(pad.axes[1], deadzone);
    if (!S.paused && S.matchStarted && S.mode !== 'phone') {
      S.yaw -= gamepadAxis(pad.axes[2], deadzone) * dt * 2.5;
      S.pitch = THREE.MathUtils.clamp(
        S.pitch - gamepadAxis(pad.axes[3], deadzone) * dt * 2.1,
        -Math.PI / 2 + 0.02,
        Math.PI / 2 - 0.02,
      );
    }
    const pressed = pad.buttons.map((button) => button.pressed);
    const edge = (index) => pressed[index] && !gamepadButtons[index];
    if (edge(9)) {
      if (S.paused && S.matchStarted) closeMenu();
      else if (!S.paused && S.matchStarted) openMenu();
    }
    if (S.paused || !S.matchStarted) {
      navigateInterface(pad, edge);
      gamepadButtons = pressed;
      return;
    }
    if (edge(3)) setMode(S.mode === 'phone' ? 'look' : 'phone');
    if (edge(1) && S.mode === 'phone') setMode('look');
    if (S.mode === 'phone') {
      navigateInterface(pad, edge);
      gamepadButtons = pressed;
      return;
    }
    if (edge(0)) interact();
    if (edge(2)) setMode(S.mode === 'throw' ? 'look' : 'throw');
    if (edge(4) || edge(5)) cycleItem();
    const trigger = pad.buttons[7]?.value || 0;
    const triggerPressed = trigger > 0.35;
    if (triggerPressed && !gamepadTrigger) startCharge('gamepad');
    if (!triggerPressed && gamepadTrigger && chargeSource === 'gamepad') releaseThrow();
    gamepadTrigger = triggerPressed;
    gamepadButtons = pressed;
  }

  function gamepadAxis(value = 0, deadzone = 0.16) {
    const magnitude = Math.abs(value);
    if (magnitude <= deadzone) return 0;
    return Math.sign(value) * (magnitude - deadzone) / (1 - deadzone);
  }

  function navigateInterface(pad, edge) {
    const direction = edge(12) || edge(14) ? -1 : edge(13) || edge(15) ? 1 : 0;
    const controls = [...document.querySelectorAll(
      'button:not([hidden]):not(:disabled), select:not([hidden]):not(:disabled), input:not([hidden]):not(:disabled)',
    )].filter((element) => element.offsetParent !== null);
    if (direction && controls.length) {
      const current = Math.max(0, controls.indexOf(document.activeElement));
      controls[(current + direction + controls.length) % controls.length].focus();
      HD.Audio?.cue?.('uiHover');
    }
    if (edge(0) && document.activeElement?.click) document.activeElement.click();
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
    updateGamepad,
    gamepadAxis,
  };
})();
