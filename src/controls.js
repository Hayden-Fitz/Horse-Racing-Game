"use strict";
HD.Controls = (() => {
  const S = HD.state;
  let canvas, camera, trajectory;

  // ---------------------------------------------------------------------------
  // Input registration and interaction modes
  // ---------------------------------------------------------------------------

  function init() {
    canvas = HD.world.renderer.domElement;
    camera = HD.world.camera;
    trajectory = HD.world.trajectory;
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
    S.yaw = THREE.MathUtils.clamp(S.yaw - event.movementX * 0.0021, -2.35, 2.35);
    S.pitch = THREE.MathUtils.clamp(S.pitch - event.movementY * 0.0018, -0.72, 0.48);
  }
  function keydown(event) {
    if (setMovementKey(event.code, true)) return;
    if (event.repeat) return;
    if (event.code === "Escape") return openMenu();
    if (event.code === "Space") {
      event.preventDefault();
      return toggleStanding();
    }
    if (event.code === "KeyE") return interact();
    if (event.code === "KeyP") setMode(S.mode === "phone" ? "look" : "phone");
    if (event.code === "KeyF") setMode(S.mode === "throw" ? "look" : "throw");
    if (event.code === "KeyQ") cycleItem();
  }
  function keyup(event) {
    setMovementKey(event.code, false);
  }
  function setMovementKey(code, pressed) {
    const bindings = {
      KeyW: "forward",
      KeyS: "backward",
      KeyA: "left",
      KeyD: "right",
    };
    const direction = bindings[code];
    if (!direction) return false;
    S.movement[direction] = pressed;
    return true;
  }
  function setMode(mode) {
    if (mode === "throw" && S.inventory[S.selectedItem] < 1) {
      HD.UI.announce(`Buy a ${HD.CONFIG.items[S.selectedItem].name} in TrackMart first.`);
      return setMode("phone");
    }
    S.mode = mode;
    const throwing = mode === "throw",
      phoning = mode === "phone";
    HD.world.heldItem.visible = throwing;
    HD.world.phoneModel.visible = phoning;
    trajectory.visible = throwing;
    S.charging = false;
    S.throwPower = 0.55;
    HD.UI.power(S.throwPower, throwing);
    HD.UI.phone(phoning);
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
    const item = HD.CONFIG.items[S.selectedItem];
    const start = new THREE.Vector3();
    camera.getWorldPosition(start);
    start.add(new THREE.Vector3(0.55, -0.35, -1).applyQuaternion(camera.quaternion));
    const velocity = new THREE.Vector3(0, 0, -1)
      .applyQuaternion(camera.quaternion)
      .normalize()
      .multiplyScalar(item.speed * S.throwPower);
    velocity.y += item.lift * S.throwPower;
    HD.Race.launch(S.selectedItem, start, velocity);
    HD.UI.announce(`${item.name.toUpperCase()} AWAY!`);
    S.charging = false;
    S.throwPower = 0.55;
    setMode(S.inventory[S.selectedItem] > 0 ? "throw" : "look");
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
    if (S.standing && !S.vendorOpen && S.mode !== "phone") updateWalking(dt);
    else camera.position.copy(HD.CONFIG.seat);
    camera.rotation.order = "YXZ";
    camera.rotation.y = S.yaw;
    camera.rotation.x = S.pitch;
    camera.position.y += Math.sin(S.elapsed * 2) * 0.008;
    if (S.charging) S.throwPower = Math.min(1.35, S.throwPower + dt * 0.72);
    if (S.mode === "throw") {
      updateTrajectory();
      HD.UI.power(S.throwPower, true);
    }
    if (HD.world.heldItem.visible)
      HD.world.heldItem.rotation.z = -0.3 + Math.sin(S.elapsed * 3) * 0.015;
  }

  // ---------------------------------------------------------------------------
  // Walking, stairs, vendors, and seating
  // ---------------------------------------------------------------------------

  function updateWalking(dt) {
    const forward = new THREE.Vector3(-Math.sin(S.yaw), 0, -Math.cos(S.yaw));
    const right = new THREE.Vector3(Math.cos(S.yaw), 0, -Math.sin(S.yaw));
    const input = new THREE.Vector3();
    if (S.movement.forward) input.add(forward);
    if (S.movement.backward) input.sub(forward);
    if (S.movement.right) input.add(right);
    if (S.movement.left) input.sub(right);
    if (input.lengthSq() > 0) {
      input.normalize().multiplyScalar(HD.CONFIG.walkSpeed * dt);
      S.playerPosition.add(input);
    }
    S.playerPosition.x = THREE.MathUtils.clamp(S.playerPosition.x, -84, 84);
    S.playerPosition.z = THREE.MathUtils.clamp(S.playerPosition.z, -72, 78);
    S.playerPosition.y = walkingEyeHeight(S.playerPosition.x, S.playerPosition.z);
    camera.position.copy(S.playerPosition);
  }
  function walkingEyeHeight(x, z) {
    const inMainAisle = Math.abs(x) < 4.5 && z > 43;
    if (inMainAisle) return THREE.MathUtils.clamp(3.4 + (z - 43) * 0.72, 3.4, 18.2);
    const ovalDistance = Math.sqrt((x / 76) ** 2 + (z / 47) ** 2);
    if (ovalDistance < 1.12) return 3.4;
    return 17.2;
  }
  function toggleStanding() {
    if (S.mode === "phone" || S.vendorOpen) return;
    S.standing = !S.standing;
    if (S.standing) {
      S.playerPosition.copy(camera.position);
      HD.UI.setMode("walking");
      HD.UI.announce("You stand up. Use WASD to walk, Space to return to your seat.");
    } else {
      S.playerPosition.copy(HD.CONFIG.seat);
      HD.UI.setMode("look");
      HD.UI.announce("You return to your seat.");
    }
  }
  function interact() {
    if (S.vendorOpen) return closeVendor();
    if (!S.standing) return HD.UI.announce("Press Space to stand up first.");
    const shops = HD.world.shopPositions || [];
    const closeShop = shops.some((position) => position.distanceTo(S.playerPosition) < 8);
    if (!closeShop) return HD.UI.announce("Move closer to a concourse shop.");
    S.vendorOpen = true;
    document.exitPointerLock?.();
    HD.UI.vendor(true);
  }
  function closeVendor() {
    if (!S.vendorOpen) return;
    S.vendorOpen = false;
    HD.UI.vendor(false);
    canvas.requestPointerLock?.();
  }
  function forceStand() {
    if (!S.standing) toggleStanding();
  }
  function sitDown() {
    closeVendor();
    S.standing = false;
    S.playerPosition.copy(HD.CONFIG.seat);
    HD.UI.setMode("look");
  }
  function updateTrajectory() {
    const start = new THREE.Vector3();
    camera.getWorldPosition(start);
    start.add(new THREE.Vector3(0.55, -0.35, -1).applyQuaternion(camera.quaternion));
    const item = HD.CONFIG.items[S.selectedItem];
    const velocity = new THREE.Vector3(0, 0, -1)
      .applyQuaternion(camera.quaternion)
      .normalize()
      .multiplyScalar(item.speed * S.throwPower);
    velocity.y += item.lift * S.throwPower;
    const gravity = new THREE.Vector3(0, -item.gravity, 0),
      points = [];
    for (let i = 0; i < 42; i++) {
      const t = i * 0.055,
        point = start
          .clone()
          .addScaledVector(velocity, t)
          .addScaledVector(gravity, 0.5 * t * t);
      points.push(point);
      if (point.y <= 0.35) break;
    }
    trajectory.geometry.dispose();
    trajectory.geometry = new THREE.BufferGeometry().setFromPoints(points);
    trajectory.computeLineDistances();
  }

  // ---------------------------------------------------------------------------
  // Equipped items and pause flow
  // ---------------------------------------------------------------------------

  function selectItem(type) {
    S.selectedItem = type;
    Object.entries(HD.world.heldItems).forEach(([id, model]) => {
      model.visible = id === type;
    });
    HD.UI.announce(`${HD.CONFIG.items[type].name} selected.`);
    HD.UI.render();
  }
  function cycleItem() {
    const ids = Object.keys(HD.CONFIG.items);
    const next = ids[(ids.indexOf(S.selectedItem) + 1) % ids.length];
    selectItem(next);
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
    forceStand,
    sitDown,
  };
})();
