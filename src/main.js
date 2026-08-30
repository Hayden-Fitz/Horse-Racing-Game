"use strict";
HD.Game = (() => {
  const S = HD.state;
  let previous = performance.now();
  function init() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x83cee8);
    scene.fog = new THREE.Fog(0xb8d9dc, 155, 320);
    const camera = new THREE.PerspectiveCamera(64, innerWidth / innerHeight, 0.08, 500);
    camera.position.copy(HD.CONFIG.seat);
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
    renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.04;
    HD.world.scene = scene;
    HD.world.camera = camera;
    HD.world.renderer = renderer;
    document.querySelector("#viewport").prepend(renderer.domElement);
    scene.add(new THREE.HemisphereLight(0xd5f1ff, 0x36502a, 2.45));
    const sun = new THREE.DirectionalLight(0xffefc2, 3.3);
    sun.position.set(-45, 72, 35);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -82;
    sun.shadow.camera.right = sun.shadow.camera.top = 82;
    scene.add(sun);
    HD.Stadium.build(scene);
    HD.Race.resetHorses();
    HD.Controls.init();
    HD.UI.addLedger("Round 1 bankroll", 100);
    HD.UI.render();
    HD.UI.countdown(String(HD.CONFIG.preparationDuration));
    HD.UI.setMode("look");
    addEventListener("resize", resize);
    document.addEventListener("visibilitychange", () => {
      const menuIsOpen = !document.querySelector("#game-menu").classList.contains("closed");
      S.paused = document.hidden || menuIsOpen;
    });
    requestAnimationFrame(loop);
  }
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min((now - previous) / 1000, 0.04);
    previous = now;
    if (!S.paused) {
      S.elapsed += dt;
      if (S.phase === "betting") {
        S.timer -= dt;
        HD.UI.countdown(Math.max(1, Math.ceil(S.timer)));
        if (S.timer <= 0) HD.Race.begin();
      }
      HD.Race.update(dt);
      HD.Race.updateIntermission(dt);
      HD.Race.updateProjectiles(dt);
      HD.UI.updateDeliveries(dt);
      HD.Controls.update(dt);
      HD.Stadium.update(S.elapsed);
    }
    HD.world.renderer.render(HD.world.scene, HD.world.camera);
  }
  function resize() {
    const camera = HD.world.camera;
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    HD.world.renderer.setSize(innerWidth, innerHeight);
  }
  return { init };
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
