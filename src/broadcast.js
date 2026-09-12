"use strict";

// One bounded history and one off-screen render, not ten simultaneous feeds.
// Replay doubles never touch simulation, collision, betting, or network state.
HD.Broadcast = (() => {
  const S = HD.state;
  const history = [];
  const doubles = new Map();
  const camera = new THREE.PerspectiveCamera(48, 23.8 / 12.5, 0.2, 500);
  const projectileCamera = new THREE.PerspectiveCamera(
    52,
    23.8 / 12.5,
    0.12,
    500,
  );
  const focus = new THREE.Vector3();
  const desired = new THREE.Vector3();
  const chaseDirection = new THREE.Vector3();
  const chaseTarget = new THREE.Vector3();
  const posePosition = new THREE.Vector3();
  const poseRotation = new THREE.Quaternion();
  const poseScale = new THREE.Vector3();
  const nextRecords = new Map();
  let target, overlay, replay, pending;
  let time = 0, sampleClock = 0, renderClock = 0, cooldown = 0;
  let roster = "", previousPhase = "", shot = -1;
  let subjectId = null;
  let status = "LIVE";
  let active = false;
  let projectileChase = false;
  let newsCopyAt = -Infinity;
  let newsPixels = null;
  let newsImage = null;
  let smoothedFrameTime = 1 / 60;
  let newsReadbackFailures = 0;
  const lastEffects = new Map();
  const NEAR_LEADER_DISTANCE = 18;

  function currentLeader() {
    return S.horses.reduce((leader, horse) =>
      !leader || horse.userData.data.progress > leader.userData.data.progress
        ? horse : leader, null);
  }

  function visualClone(source) {
    // Horse userData contains rig references. Copy visuals, not that entire graph.
    const data = source.userData;
    let clone;
    try {
      source.userData = {};
      clone = source.clone(false);
    } finally {
      source.userData = data;
    }
    source.children.forEach(child => clone.add(visualClone(child)));
    return clone;
  }

  function initialize() {
    const board = HD.world.replayBillboard;
    if (!board || !HD.world.renderer) return false;
    target = new THREE.WebGLRenderTarget(768, 404, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false,
    });
    board.screen.material.map = target.texture;
    overlay = new THREE.Mesh(board.screen.geometry, new THREE.MeshBasicMaterial({
      map: board.texture, transparent: true, depthWrite: false, toneMapped: false,
    }));
    overlay.position.copy(board.screen.position);
    overlay.position.z -= 0.025;
    overlay.quaternion.copy(board.screen.quaternion);
    board.root.add(overlay);
    active = true;
    return true;
  }

  function reset() {
    history.length = 0;
    for (const entry of doubles.values()) HD.world.scene.remove(entry.mesh);
    // Geometry/materials belong to the game; do not dispose shared resources.
    doubles.clear();
    lastEffects.clear();
    subjectId = null;
    projectileChase = false;
    replay = pending = null;
    sampleClock = renderClock = cooldown = 0;
    newsCopyAt = -Infinity;
    shot = -1;
  }

  function remember(mesh) {
    let entry = doubles.get(mesh.uuid);
    if (!entry) {
      const clone = visualClone(mesh);
      clone.name = "Broadcast replay double";
      clone.visible = false;
      const nodes = [];
      clone.traverse(node => {
        node.matrixAutoUpdate = true;
        nodes.push(node);
      });
      entry = { mesh: clone, nodes, lastSeen: time };
      doubles.set(mesh.uuid, entry);
      HD.world.scene.add(clone);
    }
    entry.lastSeen = time;
    const pose = [];
    mesh.traverse(node => {
      pose.push(...node.position.toArray(), ...node.quaternion.toArray(),
        ...node.scale.toArray(), node.visible ? 1 : 0);
    });
    return { id: mesh.uuid, pose };
  }

  function capture() {
    // Replicated horse effects also trigger highlights on guest clients.
    for (const horse of S.horses) {
      const d = horse.userData.data;
      const effect = d.boost > 0 ? "speed boost" :
        d.ragdoll > 0 ? "big hit" : d.slow > 0 ? "slowdown" : "";
      if (effect && lastEffects.has(horse.uuid) && !lastEffects.get(horse.uuid)) {
        impact(horse, { type: effect, config: { boostDuration: 1 } });
      }
      lastEffects.set(horse.uuid, effect);
    }
    const horses = S.horses.map(remember);
    const items = S.projectiles.filter(p => p.mesh && p.velocity?.lengthSq() > 1)
      .slice(0, 24).map(p => remember(p.mesh));
    history.push({ time, horses, items });
    while (history.length && history[0].time < time - 12) history.shift();
    for (const [id, entry] of doubles) {
      if (time - entry.lastSeen > 13) {
        HD.world.scene.remove(entry.mesh);
        doubles.delete(id);
      }
    }
  }

  function impact(horse, projectile) {
    if (S.phase !== "racing" || replay || pending || cooldown > 0) return;
    const leader = currentLeader();
    if (!leader || history.length < 8 ||
        horse.position.distanceToSquared(leader.position) > NEAR_LEADER_DISTANCE ** 2 ||
        Math.abs(leader.userData.data.progress - horse.userData.data.progress) > 0.12) return;
    pending = {
      at: time, id: horse.uuid,
      projectileId: projectile.mesh?.uuid || null,
      label: horse.userData.data.name + " — " + projectile.type,
    };
  }

  function applyPose(record, next, alpha) {
    const entry = doubles.get(record.id);
    if (!entry) return;
    entry.nodes.forEach((node, index) => {
      const offset = index * 11;
      node.position.fromArray(record.pose, offset);
      node.quaternion.fromArray(record.pose, offset + 3);
      node.scale.fromArray(record.pose, offset + 7);
      node.visible = !!record.pose[offset + 10];
      if (next && next.pose.length === record.pose.length) {
        node.position.lerp(posePosition.fromArray(next.pose, offset), alpha);
        node.quaternion.slerp(poseRotation.fromArray(next.pose, offset + 3), alpha);
        node.scale.lerp(poseScale.fromArray(next.pose, offset + 7), alpha);
      }
    });
    entry.mesh.visible = true;
  }

  function frameReplay() {
    const frames = replay.frames;
    let index = frames.findIndex(frame => frame.time >= replay.cursor);
    if (index < 0) index = frames.length - 1;
    const a = frames[Math.max(0, index - 1)], b = frames[index];
    const alpha = THREE.MathUtils.clamp(
      (replay.cursor - a.time) / Math.max(0.001, b.time - a.time), 0, 1,
    );
    for (const key of ["horses", "items"]) {
      nextRecords.clear();
      for (const record of b[key]) nextRecords.set(record.id, record);
      for (const record of a[key]) {
        applyPose(record, nextRecords.get(record.id), alpha);
      }
    }
    nextRecords.clear();
    return {
      horse: doubles.get(replay.id)?.mesh,
      projectile: replay.projectileId
        ? doubles.get(replay.projectileId)?.mesh
        : null,
    };
  }

  function frameProjectileCamera(projectile, horse) {
    chaseDirection.copy(horse.position).sub(projectile.position);
    if (chaseDirection.lengthSq() < 0.001) {
      chaseDirection.set(0, 0, 1);
    } else {
      chaseDirection.normalize();
    }

    // Stay just behind and above the flying prop. Looking down its travel line
    // keeps both the projectile and the horse it eventually hits in frame.
    projectileCamera.position
      .copy(projectile.position)
      .addScaledVector(chaseDirection, -5);
    projectileCamera.position.y += 3.2;
    chaseTarget.copy(horse.position);
    chaseTarget.y += 1.35;
    projectileCamera.lookAt(chaseTarget);
    projectileCamera.fov = 52;
    projectileCamera.updateProjectionMatrix();
  }

  function chooseCamera(subject, dt) {
    focus.copy(subject.position).add(new THREE.Vector3(0, 3.2, 0));
    const stations = HD.world.broadcastCameras || [];
    if (!stations.length) return;
    const nextShot = Math.floor(time / 5);
    if (shot !== nextShot || subjectId !== subject.uuid) {
      const ranked = [...stations].sort((a, b) =>
        a.camera.position.distanceToSquared(focus) - b.camera.position.distanceToSquared(focus));
      const station = ranked[nextShot % Math.min(3, ranked.length)];
      desired.copy(station.camera.position);
      // Crew geometry is part of the static stadium batch. Put the viewpoint
      // beyond its lens housing rather than rendering from inside that mesh.
      desired.add(station.target.clone().sub(station.camera.position)
        .setY(0).normalize().multiplyScalar(3.8));
      desired.y += 0.6;
      shot = nextShot;
      if (!subjectId) camera.position.copy(desired);
      subjectId = subject.uuid;
    }
    const framingPosition = desired.clone();
    if (framingPosition.distanceTo(focus) < 24) {
      framingPosition.y = Math.max(framingPosition.y, focus.y + 24);
    }
    camera.position.lerp(framingPosition, 1 - Math.exp(-dt * 3));
    if (camera.position.distanceTo(focus) < 14) camera.position.y = focus.y + 24;
    camera.lookAt(focus);
    const distance = camera.position.distanceTo(focus);
    // Maintain a readable horse-sized frame while showing nearby overtakes.
    const fov = THREE.MathUtils.clamp(
      THREE.MathUtils.radToDeg(2 * Math.atan((replay ? 10 : 15) / distance)), 20, 65,
    );
    camera.fov = THREE.MathUtils.lerp(camera.fov, fov, 1 - Math.exp(-dt * 4));
    camera.updateProjectionMatrix();
  }

  function graphics() {
    const board = HD.world.replayBillboard;
    const c = board.context;
    c.clearRect(0, 0, 1024, 576);
    c.fillStyle = "rgba(7,19,30,0.88)";
    c.fillRect(0, 0, 1024, 58);
    c.fillRect(0, 478, 1024, 98);
    c.textAlign = "left";
    c.fillStyle = replay ? "#ffca63" : "#79edaa";
    c.font = "bold 28px sans-serif";
    c.fillText(status, 24, 39);
    c.fillStyle = "#ffffff";
    c.font = "bold 23px sans-serif";
    const leader = currentLeader();
    c.fillText(replay ? replay.label : "HOTDOG DERBY  •  " +
      (S.phase === "racing" ? "Leader: " + (leader?.userData.data.name || "") : "Trackside live"),
    24, 513, 970);
    if (replay) {
      c.fillStyle = "#ffca63";
      c.fillRect(0, 572, 1024 * (replay.cursor - replay.start) /
        Math.max(0.1, replay.end - replay.start), 4);
    }
    board.texture.needsUpdate = true;
  }

  function copyFeedToDerbyNews(renderer) {
    if (
      typeof document === 'undefined' ||
      typeof document.querySelector !== 'function'
    ) return;
    const canvas = document.querySelector('#news-live-canvas');
    const panel = canvas?.closest?.('[data-panel="news"]');
    if (!canvas || !panel?.classList.contains('active')) return;
    if (typeof renderer.readRenderTargetPixels !== 'function') return;
    const previewInterval = smoothedFrameTime > 0.04
      ? 0.2
      : smoothedFrameTime > 0.025
        ? 0.1
        : 0.05;
    if (time - newsCopyAt < previewInterval) return;

    const width = target.width;
    const height = target.height;
    const requiredBytes = width * height * 4;
    if (!newsPixels || newsPixels.length !== requiredBytes) {
      newsPixels = new Uint8Array(requiredBytes);
      newsImage = canvas.getContext('2d').createImageData(width, height);
    }
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;

    try {
      renderer.readRenderTargetPixels(
        target,
        0,
        0,
        width,
        height,
        newsPixels,
      );
    } catch (error) {
      newsReadbackFailures++;
      newsCopyAt = time;
      return;
    }
    const rowBytes = width * 4;
    for (let row = 0; row < height; row++) {
      const source = row * rowBytes;
      const destination = (height - row - 1) * rowBytes;
      newsImage.data.set(
        newsPixels.subarray(source, source + rowBytes),
        destination,
      );
    }
    canvas.getContext('2d').putImageData(newsImage, 0, 0);
    const statusLabel = document.querySelector('#news-live-status');
    const caption = document.querySelector('#news-live-caption');
    if (statusLabel) statusLabel.textContent = status;
    if (caption) {
      const leader = currentLeader();
      caption.textContent = replay
        ? replay.label
        : (leader?.userData.data.name || 'Stadium Vision') + ' leads';
    }
    newsCopyAt = time;
  }

  function update(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    smoothedFrameTime = THREE.MathUtils.lerp(
      smoothedFrameTime,
      Math.min(dt, 0.1),
      0.05,
    );
    if (!active && !initialize()) return;
    time += dt;
    cooldown = Math.max(0, cooldown - dt);
    const signature = S.horses.map(h => h.uuid).join(",");
    if (signature !== roster || (S.phase === "betting" && previousPhase !== "betting")) {
      reset();
      roster = signature;
    }
    previousPhase = S.phase;
    sampleClock += dt;
    if (sampleClock >= 0.1) {
      sampleClock %= 0.1;
      if (S.phase === "racing" || pending) capture();
    }
    if (pending && time >= pending.at + 1) {
      const frames = history.filter(f => f.time >= pending.at - 2);
      if (frames.length > 1) {
        replay = { ...pending, frames, start: frames[0].time,
          end: frames[frames.length - 1].time, cursor: frames[0].time };
        shot = -1;
      }
      pending = null;
    }
    if (replay) {
      replay.cursor += dt * 0.65;
      if (replay.cursor >= replay.end) {
        replay = null;
        cooldown = 3;
        shot = -1;
      }
    }
    renderClock += dt;
    if (renderClock < 1 / 20) return;
    const renderDt = renderClock;
    renderClock = 0;
    const world = HD.world, renderer = world.renderer;
    const hidden = [];
    const previousTarget = renderer.getRenderTarget();
    const shadows = renderer.shadowMap.autoUpdate;
    const hide = object => {
      if (!object) return;
      hidden.push([object, object.visible]);
      object.visible = false;
    };
    try {
      let subject;
      let activeCamera = camera;
      projectileChase = false;
      if (replay) {
        const replayFrame = frameReplay();
        subject = replayFrame.horse;
        if (subject && replayFrame.projectile) {
          frameProjectileCamera(replayFrame.projectile, subject);
          activeCamera = projectileCamera;
          projectileChase = true;
        }
        S.horses.forEach(hide);
        S.projectiles.forEach(p => hide(p.mesh));
      } else {
        subject = currentLeader();
      }
      if (!subject) return;
      if (activeCamera === camera) chooseCamera(subject, renderDt);
      status = replay
        ? projectileChase
          ? "REPLAY  •  PROJECTILE CAM  •  SLOW MOTION"
          : "REPLAY  •  SLOW MOTION"
        : "LIVE";
      graphics();
      hide(world.replayBillboard.root);
      hide(world.camera); // First-person hands/phone must never appear in the feed.
      renderer.shadowMap.autoUpdate = false;
      renderer.setRenderTarget(target);
      renderer.render(world.scene, activeCamera);
      copyFeedToDerbyNews(renderer);
    } finally {
      renderer.setRenderTarget(previousTarget);
      renderer.shadowMap.autoUpdate = shadows;
      hidden.forEach(([object, visible]) => { object.visible = visible; });
      doubles.forEach(entry => { entry.mesh.visible = false; });
    }
  }

  return {
    update, impact,
    get active() { return active; },
    get diagnostics() {
      return { status, samples: history.length, doubles: doubles.size,
        pending: !!pending, replaying: !!replay, subjectId,
        projectileChase,
        newsPreviewFps: smoothedFrameTime > 0.04
          ? 5
          : smoothedFrameTime > 0.025 ? 10 : 20,
        newsReadbackFailures,
        cameras: HD.world.broadcastCameras?.length || 0 };
    },
  };
})();
