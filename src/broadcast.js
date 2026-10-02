"use strict";

// One bounded history and one off-screen render, not ten simultaneous feeds.
// Replay doubles never touch simulation, collision, betting, or network state.
HD.Broadcast = (() => {
  const S = HD.state;
  const history = [];
  const doubles = new Map();
  const posePools = new Map();
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
  const displayDirection = new THREE.Vector3();
  const playerForward = new THREE.Vector3();
  const displayPosition = new THREE.Vector3();
  const posePosition = new THREE.Vector3();
  const poseRotation = new THREE.Quaternion();
  const poseScale = new THREE.Vector3();
  const nextRecords = new Map();
  const actorVersions = new WeakMap();
  let actorVersion = 0;
  let newsScene, newsCamera;
  let target, overlay, replay, pending;
  let time = 0, sampleClock = 0, renderClock = 0, cooldown = 0;
  let roster = "", previousPhase = "", shot = -1;
  let subjectId = null;
  let status = "LIVE";
  let active = false;
  let projectileChase = false;
  let newsCopyAt = -Infinity;
  let smoothedFrameTime = 1 / 60;
  let newsReadbackFailures = 0;
  let allocatedPoseBuffers = 0;
  let reusedPoseBuffers = 0;
  const lastEffects = new Map();
  const NEAR_LEADER_DISTANCE = 18;
  const sightline = new THREE.Raycaster();
  const sightDirection = new THREE.Vector3();
  let cameraStation = null, previousStation = null;
  let lastCameraCut = -Infinity, lastCameraCheck = -Infinity;
  let blockedSince = null, cameraCuts = 0;
  let activeFeedFps = 30;
  let displayVisible = true;
  let displayVisibilityCheckedAt = -Infinity;
  let prewarmIndex = 0;
  let raceStartAt = -Infinity;
  let renderPauseFrames = 0;

  function isOutputVisible() {
    if (typeof document === 'undefined') return true;
    const newsPanel = document.querySelector?.('[data-panel=news]');
    if (newsPanel?.classList.contains('active')) return true;
    if (time - displayVisibilityCheckedAt < 0.25) return displayVisible;
    displayVisibilityCheckedAt = time;
    const playerCamera = HD.world.camera;
    const screen = HD.world.replayBillboard?.screen;
    const renderer = HD.world.renderer;
    if (!playerCamera || !screen || !renderer?.domElement) return true;
    screen.getWorldPosition(displayPosition);
    displayDirection.copy(displayPosition).sub(playerCamera.position);
    if (displayDirection.lengthSq() < 400) return (displayVisible = true);
    displayDirection.normalize();
    playerCamera.getWorldDirection(playerForward);
    // A little wider than the 120-degree arena budget prevents visible pop-in
    // while turning toward the large board.
    displayVisible = playerForward.dot(displayDirection) > Math.cos(THREE.MathUtils.degToRad(80));
    return displayVisible;
  }

  function feedFrameRate() {
    // Stadium Vision is a secondary view. Keep it fluid on fast machines but
    // give the main first-person render breathing room as frame time rises.
    if (!isOutputVisible()) return 4;
    if (S.phase !== 'racing' && !replay && !pending) return 6;
    if (S.phase === 'racing' && time - raceStartAt < 2) return 6;
    if (smoothedFrameTime >= 1 / 30) return 6;
    if (smoothedFrameTime >= 1 / 50) return 15;
    return 30;
  }

  function replayCaptureRate() {
    // Replay poses interpolate between samples. Cut traversal and allocation
    // work when the main view is already struggling to finish a frame.
    if (smoothedFrameTime >= 1 / 32) return 15;
    if (smoothedFrameTime >= 1 / 50) return 24;
    return 30;
  }
  function newsPreviewFrameRate() {
    if (smoothedFrameTime >= 1 / 30) return 6;
    if (smoothedFrameTime >= 1 / 50) return 8;
    return 15;
  }

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
    const preset = typeof document === 'undefined'
      ? 'performance' : document.querySelector?.('#graphics-quality')?.value || 'performance';
    const feedWidth = preset === 'high' ? 768 : preset === 'balanced' ? 640 : 480;
    const feedHeight = Math.round(feedWidth * 404 / 768);
    target = new THREE.WebGLRenderTarget(feedWidth, feedHeight, {
      type: THREE.UnsignedByteType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false,
      stencilBuffer: false,
    });
    // Unlit white video surface: stadium lighting must not tint the broadcast.
    board.screen.material = new THREE.MeshBasicMaterial({ map: target.texture });
    camera.layers.enable(2);
    projectileCamera.layers.enable(2);
    newsScene = new THREE.Scene();
    newsCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
    newsCamera.position.z = 1;
    newsScene.add(new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicMaterial({ map: target.texture, depthTest: false }),
    ));
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
    while (history.length) recycleFrame(history.pop());
    for (const entry of doubles.values()) HD.world.scene.remove(entry.mesh);
    // Geometry/materials belong to the game; do not dispose shared resources.
    doubles.clear();
    prewarmIndex = 0;
    raceStartAt = -Infinity;
    renderPauseFrames = 0;
    lastEffects.clear();
    subjectId = null;
    projectileChase = false;
    replay = pending = null;
    sampleClock = renderClock = cooldown = 0;
    newsCopyAt = -Infinity;
    shot = -1;
    cameraStation = previousStation = null;
    lastCameraCut = lastCameraCheck = -Infinity;
    blockedSince = null;
  }

  function takePoseBuffer(length) {
    const pool = posePools.get(length);
    if (pool?.length) {
      reusedPoseBuffers++;
      return pool.pop();
    }
    allocatedPoseBuffers++;
    return new Float32Array(length);
  }

  function recyclePoseBuffer(pose) {
    if (!pose) return;
    let pool = posePools.get(pose.length);
    if (!pool) posePools.set(pose.length, (pool = []));
    if (pool.length < 96) pool.push(pose);
  }

  function recycleFrame(frame) {
    if (!frame) return;
    for (const key of ['horses', 'items', 'players']) {
      for (const record of frame[key] || []) recyclePoseBuffer(record.pose);
    }
  }

  function remember(mesh, id = mesh.uuid) {
    let entry = doubles.get(id);
    if (!entry) {
      const clone = visualClone(mesh);
      clone.name = "Broadcast replay double";
      clone.visible = false;
      const nodes = [];
      clone.traverse(node => {
        node.matrixAutoUpdate = true;
        node.layers.set(0);
        nodes.push(node);
      });
      entry = { mesh: clone, nodes, lastSeen: time };
      doubles.set(id, entry);
      HD.world.scene.add(clone);
    }
    entry.lastSeen = time;
    const pose = takePoseBuffer(entry.nodes.length * 11);
    let offset = 0;
    mesh.traverse(node => {
      node.position.toArray(pose, offset);
      node.quaternion.toArray(pose, offset + 3);
      node.scale.toArray(pose, offset + 7);
      pose[offset + 10] = node.visible ? 1 : 0;
      offset += 11;
    });
    return { id, pose };
  }

  function playerActors() {
    return [...new Set([
      HD.world.localPlayer,
      ...(HD.world.remotePlayers?.values() || []),
    ].filter(Boolean))];
  }

  function rememberActor(mesh) {
    // Equipping an item or changing an outfit can change the hierarchy. Keep
    // the old visual version for old frames instead of mixing incompatible rigs.
    const nodes = [];
    mesh.traverse(node => nodes.push(node.uuid));
    const signature = nodes.join(',');
    let version = actorVersions.get(mesh);
    if (!version || version.signature !== signature) {
      version = { signature, id: mesh.uuid + ':actor:' + (++actorVersion) };
      actorVersions.set(mesh, version);
    }
    return remember(mesh, version.id);
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
    const horses = S.horses.map(horse => remember(horse));
    const items = S.projectiles.filter(p => p.mesh && p.velocity?.lengthSq() > 1)
      .slice(0, 24).map(p => remember(p.mesh));
    const players = playerActors().filter(mesh => mesh.visible).map(rememberActor);
    history.push({ time, horses, items, players });
    while (history.length && history[0].time < time - 12) {
      recycleFrame(history.shift());
    }
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
    for (const key of ["horses", "items", "players"]) {
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
    chaseDirection.y = 0;
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
    projectileCamera.position.y += 1.25;
    // Aim at the prop itself, not the horse: it stays at screen centre while
    // the struck horse remains behind it along the camera's viewing direction.
    chaseTarget.copy(projectile.position);
    projectileCamera.lookAt(chaseTarget);
    projectileCamera.fov = 58;
    projectileCamera.updateProjectionMatrix();
  }

  function isObstructed(from, to) {
    const obstacles = HD.world.broadcastOccluders || [];
    if (!obstacles.length) return false;
    sightDirection.copy(to).sub(from);
    const distance = sightDirection.length();
    if (distance < 0.5) return false;
    sightline.set(from, sightDirection.divideScalar(distance));
    sightline.near = 0.2;
    sightline.far = Math.max(0.2, distance - 0.8);
    return sightline.intersectObjects(obstacles, false).length > 0;
  }

  function stationPosition(station) {
    const position = station.camera.position.clone();
    position.add(station.target.clone().sub(position).setY(0).normalize().multiplyScalar(3.8));
    position.y += 0.6;
    if (position.distanceTo(focus) < 24) position.y = Math.max(position.y, focus.y + 24);
    return position;
  }

  function chooseCamera(subject, dt) {
    focus.copy(subject.position).add(new THREE.Vector3(0, 3.2, 0));
    subjectId = subject.uuid;
    const stations = HD.world.broadcastCameras || [];
    if (!stations.length) return;
    // Changing the leading horse changes the target, not automatically the shot.
    if (!cameraStation || time - lastCameraCheck >= 0.25) {
      lastCameraCheck = time;
      const blocked = cameraStation && isObstructed(camera.position, focus);
      if (blocked) blockedSince ??= time;
      else blockedSince = null;
      const held = time - lastCameraCut;
      const obstructedLongEnough = blockedSince !== null && time - blockedSince >= 0.35;
      const shouldReview = !cameraStation ||
        (obstructedLongEnough && held >= 1.2) || held >= 7;
      if (shouldReview) {
        const ranked = stations.map(station => {
          const position = stationPosition(station);
          return { id: station.id, position, score: position.distanceTo(focus),
            clear: !isObstructed(position, focus) };
        }).filter(candidate => candidate.clear &&
          (!obstructedLongEnough || candidate.id !== cameraStation) &&
          (candidate.id !== previousStation || held >= 8));
        ranked.sort((a, b) => a.score - b.score);
        const best = ranked[0];
        const currentScore = camera.position.distanceTo(focus);
        if (best && best.id !== cameraStation &&
            (!cameraStation || obstructedLongEnough || best.score < currentScore * 0.75)) {
          previousStation = cameraStation;
          cameraStation = best.id;
          desired.copy(best.position);
          // Cut cleanly between stations; never sweep through scenery.
          camera.position.copy(desired);
          lastCameraCut = time;
          blockedSince = null;
          cameraCuts++;
        } else if (!best && (!cameraStation || obstructedLongEnough)) {
          // Safe in-track aerial fallback if every fixed camera is obstructed.
          for (const offset of [[12, 30, 10], [-12, 36, -10], [0, 48, 0]]) {
            const position = focus.clone().add(new THREE.Vector3(...offset));
            if (isObstructed(position, focus)) continue;
            previousStation = cameraStation;
            cameraStation = "clear-aerial";
            camera.position.copy(position);
            lastCameraCut = time;
            blockedSince = null;
            cameraCuts++;
            break;
          }
        }
      }
    }
    camera.lookAt(focus);
    const distance = Math.max(1, camera.position.distanceTo(focus));
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
    if (!renderer.domElement || !renderer.getViewport) return;
    if (time - newsCopyAt + 1e-6 < 1 / newsPreviewFrameRate()) return;

    const width = target.width;
    const height = target.height;
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;

    const viewport = renderer.getViewport(new THREE.Vector4());
    const scissor = renderer.getScissor(new THREE.Vector4());
    const scissorTest = renderer.getScissorTest();
    const previousTarget = renderer.getRenderTarget();
    const pixelRatio = renderer.getPixelRatio();
    const copyWidth = Math.min(width, renderer.domElement.width);
    const copyHeight = Math.min(height, renderer.domElement.height);
    try {
      // Resolve through the same tone mapping and output colour space as the TV.
      // A small fullscreen GPU pass + canvas copy avoids synchronous pixel
      // readback, CPU row-flipping and the old dark/green linear-colour preview.
      renderer.setRenderTarget(null);
      renderer.setViewport(0, 0, copyWidth / pixelRatio, copyHeight / pixelRatio);
      renderer.setScissor(0, 0, copyWidth / pixelRatio, copyHeight / pixelRatio);
      renderer.setScissorTest(true);
      renderer.render(newsScene, newsCamera);
      canvas.getContext('2d').drawImage(
        renderer.domElement,
        0, renderer.domElement.height - copyHeight, copyWidth, copyHeight,
        0, 0, width, height,
      );
    } catch (error) {
      newsReadbackFailures++;
      newsCopyAt = time;
      return;
    } finally {
      renderer.setRenderTarget(previousTarget);
      renderer.setViewport(viewport);
      renderer.setScissor(scissor);
      renderer.setScissorTest(scissorTest);
    }
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

  function update(dt, frameDt = dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    if (Number.isFinite(frameDt) && frameDt > 0.12) renderPauseFrames = 12;
    smoothedFrameTime = THREE.MathUtils.lerp(
      smoothedFrameTime,
      Math.min(Number.isFinite(frameDt) ? frameDt : dt, 0.2),
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
    if (S.phase === "racing" && previousPhase !== "racing") raceStartAt = time;
    previousPhase = S.phase;
    // Build one replay mesh per betting frame so race start does not clone the
    // entire field and every player on its first rendered frame.
    if (S.phase === 'betting') {
      const actors = playerActors();
      const target = prewarmIndex < S.horses.length
        ? S.horses[prewarmIndex] : actors[prewarmIndex - S.horses.length];
      if (target) {
        const record = prewarmIndex < S.horses.length
          ? remember(target) : rememberActor(target);
        recyclePoseBuffer(record.pose);
        prewarmIndex++;
      }
    }
    sampleClock += dt;
    const sampleInterval = 1 / replayCaptureRate();
    if (sampleClock >= sampleInterval) {
      sampleClock %= sampleInterval;
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
    const feedFps = feedFrameRate();
    activeFeedFps = feedFps;
    if (renderPauseFrames > 0) {
      renderPauseFrames--;
      return;
    }
    if (renderClock + 1e-6 < 1 / feedFps) return;
    const renderDt = renderClock;
    renderClock %= 1 / feedFps;
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
        if (replay.chaseStarted && !replayFrame.projectile?.visible) replay.chaseComplete = true;
        if (subject && replayFrame.projectile?.visible &&
            !replay.chaseBlocked && !replay.chaseComplete) {
          frameProjectileCamera(replayFrame.projectile, subject);
          replay.chaseBlocked = isObstructed(projectileCamera.position, replayFrame.projectile.position);
          if (!replay.chaseBlocked) {
            activeCamera = projectileCamera;
            projectileChase = true;
            replay.chaseStarted = true;
          }
        }
        S.horses.forEach(hide);
        S.projectiles.forEach(p => hide(p.mesh));
        playerActors().forEach(hide);
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
      // Apply the same bounded arena visibility pass from the broadcast camera
      // instead of drawing every rear-side stadium sector a second time.
      HD.Stadium?.updateViewCulling?.(activeCamera);
      renderer.render(world.scene, activeCamera);
      copyFeedToDerbyNews(renderer);
    } finally {
      renderer.setRenderTarget(previousTarget);
      renderer.shadowMap.autoUpdate = shadows;
      hidden.forEach(([object, visible]) => { object.visible = visible; });
      doubles.forEach(entry => { entry.mesh.visible = false; });
      HD.Stadium?.showAllViewCulled?.();
    }
  }

  return {
    update, impact,
    get active() { return active; },
    get diagnostics() {
      return { status, samples: history.length, doubles: doubles.size,
        pending: !!pending, replaying: !!replay, subjectId,
        projectileChase,
        cameraStation, cameraCuts,
        allocatedPoseBuffers,
        reusedPoseBuffers,
        cameraObstructed: blockedSince !== null,
        feedFps: activeFeedFps,
        feedSize: target ? [target.width, target.height] : null,
        captureFps: replayCaptureRate(),
        renderPauseFrames,
        newsPreviewFps: newsPreviewFrameRate(),
        recordedPlayers: history.at(-1)?.players.length || 0,
        newsReadbackFailures,
        cameras: HD.world.broadcastCameras?.length || 0 };
    },
  };
})();
