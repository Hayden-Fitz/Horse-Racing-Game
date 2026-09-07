"use strict";
HD.Game = (() => {
  const S = HD.state;
  const QUALITY = {
    performance: { minimum: 0.58, maximum: 0.78, start: 0.72, shadows: false },
    balanced: { minimum: 0.68, maximum: 1, start: 0.88, shadows: false },
    high: { minimum: 0.82, maximum: 1.2, start: 1, shadows: true },
  };
  let previous = performance.now();
  let qualityName = readQuality();
  let renderScale = Math.min(devicePixelRatio, QUALITY[qualityName].start);
  let performanceWindow = 0;
  let performanceFrames = 0;
  let sunlight;

  function init() {
    HD.Settings.init();
    HD.Audio.init();
    renderScale = desiredRenderScale();
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x83cee8);
    scene.fog = new THREE.Fog(0xb8d9dc, 155, 320);
    const camera = new THREE.PerspectiveCamera(
      HD.Settings.fov(),
      innerWidth / innerHeight,
      0.08,
      500,
    );
    camera.position.copy(HD.CONFIG.seat);
    const renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(renderScale);
    renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.enabled = QUALITY[qualityName].shadows;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.04;
    HD.world.scene = scene;
    HD.world.camera = camera;
    HD.world.renderer = renderer;
    document.querySelector("#viewport").prepend(renderer.domElement);
    scene.add(new THREE.HemisphereLight(0xd5f1ff, 0x36502a, 2.45));
    sunlight = new THREE.DirectionalLight(0xffefc2, 3.3);
    sunlight.position.set(-45, 72, 35);
    sunlight.castShadow = QUALITY[qualityName].shadows;
    sunlight.shadow.mapSize.set(512, 512);
    sunlight.shadow.camera.left = sunlight.shadow.camera.bottom = -82;
    sunlight.shadow.camera.right = sunlight.shadow.camera.top = 82;
    scene.add(sunlight);
    HD.Stadium.build(scene);
    freezeStaticStadium(scene);
    camera.position.copy(HD.CONFIG.seat);
    HD.Race.resetHorses();
    HD.AI.init();
    HD.Controls.init();
    HD.Network.init();
    HD.UI.addLedger("Round 1 bankroll", 100);
    HD.UI.render();
    HD.UI.countdown(String(HD.CONFIG.preparationDuration));
    HD.UI.setMode("look");
    bindGraphicsControl();
    addEventListener("resize", resize);
    document.addEventListener("visibilitychange", () => {
      const menuIsOpen = !document.querySelector("#game-menu").classList.contains("closed");
      S.paused = document.hidden || menuIsOpen;
    });
    requestAnimationFrame(loop);
  }
  function loop(now) {
    requestAnimationFrame(loop);
    const realDt = Math.min((now - previous) / 1000, 0.2);
    const dt = Math.min(realDt, 0.04);
    previous = now;
    const onlineSimulation = HD.Network.isConnected() && HD.Network.isPlaying();
    const simulationActive = !S.paused || onlineSimulation;
    if (simulationActive) {
      S.elapsed += dt;
      if (S.phase === "betting" && HD.Network.isHost()) {
        S.timer -= dt;
        HD.UI.countdown(Math.max(1, Math.ceil(S.timer)));
        if (S.timer <= 0) HD.Race.begin();
      }
      HD.Race.update(dt);
      HD.AI.update(dt);
      HD.Race.updateIntermission(dt);
      HD.Race.updateProjectiles(dt);
      HD.UI.updateDeliveries(dt);
      if (!S.paused) HD.Controls.update(dt);
      HD.Stadium.update(S.elapsed);
    }
    HD.Network.update(dt);
    HD.Audio.update(realDt);
    const menuOpen = !document.querySelector("#game-menu").classList.contains("closed");
    if (menuOpen && !onlineSimulation) return;
    updateRenderScale(realDt);
    HD.world.renderer.render(HD.world.scene, HD.world.camera);
  }

  function updateRenderScale(dt) {
    performanceWindow += dt;
    performanceFrames++;
    if (performanceWindow < 2) return;

    const framesPerSecond = performanceFrames / performanceWindow;
    if (HD.Settings.renderHeight()) {
      updatePerformanceStatus(framesPerSecond, renderScale);
      performanceWindow = 0;
      performanceFrames = 0;
      return;
    }
    const settings = QUALITY[qualityName];
    const maximum = Math.min(devicePixelRatio, settings.maximum);
    let nextScale = renderScale;
    if (framesPerSecond < 48) {
      nextScale = Math.max(settings.minimum, renderScale - 0.1);
    }
    if (framesPerSecond > 57) nextScale = Math.min(maximum, renderScale + 0.06);
    updatePerformanceStatus(framesPerSecond, nextScale);
    performanceWindow = 0;
    performanceFrames = 0;
    if (Math.abs(nextScale - renderScale) < 0.01) return;

    renderScale = nextScale;
    HD.world.renderer.setPixelRatio(renderScale);
    HD.world.renderer.setSize(innerWidth, innerHeight, false);
  }

  function bindGraphicsControl() {
    const selectors = [
      document.querySelector("#graphics-quality"),
      document.querySelector("#settings-graphics-quality"),
    ];
    selectors.forEach((select) => {
      select.value = qualityName;
      select.addEventListener("change", () => setQuality(select.value));
    });
    updatePerformanceStatus(60, renderScale);
  }

  function setQuality(name) {
    if (!QUALITY[name]) return;
    qualityName = name;
    const settings = QUALITY[name];
    renderScale = desiredRenderScale();
    HD.world.renderer.shadowMap.enabled = settings.shadows;
    sunlight.castShadow = settings.shadows;
    HD.world.renderer.shadowMap.needsUpdate = true;
    HD.world.renderer.setPixelRatio(renderScale);
    HD.world.renderer.setSize(innerWidth, innerHeight, false);
    try {
      localStorage.setItem("hotdog-downs-quality", name);
    } catch {}
    document.querySelector("#graphics-quality").value = name;
    document.querySelector("#settings-graphics-quality").value = name;
    updatePerformanceStatus(60, renderScale);
  }

  function updatePerformanceStatus(framesPerSecond, scale) {
    const status = document.querySelector("#performance-status");
    const label = qualityName.toUpperCase();
    const targetHeight = HD.Settings.renderHeight();
    const resolution = targetHeight
      ? `${targetHeight}p`
      : `${Math.round(scale * 100)}% ADAPTIVE`;
    status.textContent = `${label} · ${Math.round(framesPerSecond)} FPS · ${resolution}`;
  }

  function readQuality() {
    try {
      const saved = localStorage.getItem("hotdog-downs-quality");
      if (QUALITY[saved]) return saved;
    } catch {}
    return "performance";
  }

  function freezeStaticStadium(scene) {
    const dynamicRoots = new Set([
      HD.world.localPlayer,
      ...(HD.world.players || []).filter((player) => !player.userData.staticPlaceholder),
    ]);
    scene.traverse((object) => {
      if (!object.isMesh || belongsToDynamicRoot(object, dynamicRoots)) return;
      object.updateMatrix();
      object.matrixAutoUpdate = false;
    });
  }

  function belongsToDynamicRoot(object, roots) {
    let current = object;
    while (current) {
      if (roots.has(current)) return true;
      current = current.parent;
    }
    return false;
  }
  function resize() {
    const camera = HD.world.camera;
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderScale = desiredRenderScale();
    HD.world.renderer.setPixelRatio(renderScale);
    HD.world.renderer.setSize(innerWidth, innerHeight);
  }

  function desiredRenderScale() {
    const fixedHeight = HD.Settings.renderHeight();
    if (fixedHeight) return THREE.MathUtils.clamp(fixedHeight / innerHeight, 0.25, 6);
    return Math.min(devicePixelRatio, QUALITY[qualityName].start);
  }

  function applyResolution() {
    if (!HD.world.renderer) return;
    renderScale = desiredRenderScale();
    HD.world.renderer.setPixelRatio(renderScale);
    HD.world.renderer.setSize(innerWidth, innerHeight, false);
    updatePerformanceStatus(60, renderScale);
  }

  return { init, applyResolution };
})();
document.querySelector("#phone").classList.add("closed");
try {
  HD.Game.init();
} catch (error) {
  console.error(error);
  const banner = document.querySelector("#announcement");
  banner.textContent = `Game startup failed: ${error.message}`;
  banner.style.background = "#8d321f";
}
