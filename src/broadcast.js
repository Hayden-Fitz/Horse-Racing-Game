"use strict";

// One bounded history and one off-screen render, not ten simultaneous feeds.
// Replay doubles never touch simulation, collision, betting, or network state.
HD.Broadcast = (() => {
  const S = HD.state;
  const history = [];
  const doubles = new Map();
  const camera = new THREE.PerspectiveCamera(48, 23.8 / 12.5, 0.2, 500);
  const focus = new THREE.Vector3();
  const desired = new THREE.Vector3();
  let target, overlay, replay, pending;
  let time = 0, sampleClock = 0, renderClock = 0, cooldown = 0;
  let roster = "", previousPhase = "", shot = -1;
  let subjectId = null;
  let status = "LIVE";
  let active = false;
  const lastEffects = new Map();
  let lastLeader = null;

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
    lastLeader = null;
    replay = pending = null;
    sampleClock = renderClock = cooldown = 0;
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
    const leader = [...S.horses].sort((a, b) =>
      b.userData.data.progress - a.userData.data.progress)[0];
    if (leader && lastLeader && leader.uuid !== lastLeader &&
        leader.userData.data.progress > 0.35 && !pending && !replay &&
        cooldown <= 0 && history.length >= 8) {
      pending = { at: time, id: leader.uuid,
        label: leader.userData.data.name + " takes the lead" };
    }
    lastLeader = leader?.uuid;
    // Replicated horse effects also trigger highlights on guest clients.
    for (const horse of S.horses) {
      const d = horse.userData.data;
      const effect = d.boost > 0 ? "speed boost" : d.ragdoll > 0 ? "big hit" : "";
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
    const config = projectile.config || {};
    const major = config.boostDuration || config.maxSpeedBonus ||
      config.ragdollDuration || config.slowDuration;
    if (!major || history.length < 8) return;
    pending = {
      at: time, id: horse.uuid,
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
        node.position.lerp(new THREE.Vector3().fromArray(next.pose, offset), alpha);
        node.quaternion.slerp(new THREE.Quaternion().fromArray(next.pose, offset + 3), alpha);
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
      for (const record of a[key]) {
        applyPose(record, b[key].find(other => other.id === record.id), alpha);
      }
    }
    return doubles.get(replay.id)?.mesh;
  }

  function chooseCamera(subject, dt) {
    focus.copy(subject.position).add(new THREE.Vector3(0, 3.2, 0));
    const stations = HD.world.broadcastCameras || [];
    if (!stations.length) return;
    const nextShot = Math.floor(time / 5);
    if (shot !== nextShot || !subjectId) {
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
    const leader = [...S.horses].sort((a,b) =>
      b.userData.data.progress - a.userData.data.progress)[0];
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

  function update(dt) {
    if (!active && !initialize()) return;
    if (dt <= 0) return;
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
    if (pending && time >= pending.at + 2.5) {
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
        cooldown = 12;
        shot = -1;
      }
    }
    renderClock += dt;
    if (renderClock < 1 / 20) return;
    const renderDt = renderClock;
    renderClock = 0;
    status = replay ? "REPLAY  •  SLOW MOTION" : "LIVE";
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
      if (replay) {
        subject = frameReplay();
        S.horses.forEach(hide);
        S.projectiles.forEach(p => hide(p.mesh));
      } else {
        subject = [...S.horses].sort((a,b) =>
          b.userData.data.progress - a.userData.data.progress)[0];
        // Occasionally follow an airborne item rather than the pack.
        if (Math.floor(time / 5) % 3 === 2) {
          subject = S.projectiles.find(p => p.position?.y > 5 && p.mesh)?.mesh || subject;
        }
      }
      if (!subject) return;
      chooseCamera(subject, renderDt);
      graphics();
      hide(world.replayBillboard.root);
      hide(world.camera); // First-person hands/phone must never appear in the feed.
      renderer.shadowMap.autoUpdate = false;
      renderer.setRenderTarget(target);
      renderer.render(world.scene, camera);
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
        pending: !!pending, replaying: !!replay, cameras: HD.world.broadcastCameras?.length || 0 };
    },
  };
})();
