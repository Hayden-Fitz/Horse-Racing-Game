"use strict";

// These cameras are data only: no crew meshes and no background render cost.
HD.Photo = (() => {
  const presets = [
    { id: "arena-hero", name: "Arena panorama", position: [122.45, 158.63, 161.95], target: [0, 3, 0], fov: 40 },
    { id: "arena-overhead", name: "Straight overhead", position: [0, 222, 0], target: [0, 0, 0], fov: 44 },
    { id: "arena-reverse", name: "Opposite grandstand", position: [-108, 141.24, -144], target: [0, 3, 0], fov: 48 },
    { id: "arena-infield", name: "Infield aerial", position: [19.5, 94.04, 78], target: [0, 2, 0], fov: 53 },
  ];
  const cameras = new Map();
  let panel;
  let pausedBefore = true;

  function cameraFor(id, aspect = 16 / 9) {
    const preset = presets.find(entry => entry.id === id);
    if (!preset) throw new Error("Unknown photo viewpoint.");
    let camera = cameras.get(id);
    if (!camera) {
      camera = new THREE.PerspectiveCamera(preset.fov, aspect, 0.1, 1200);
      camera.name = preset.name + " (invisible photo camera)";
      camera.position.fromArray(preset.position);
      if (id === "arena-overhead") camera.up.set(0, 0, -1);
      camera.lookAt(...preset.target);
      camera.layers.enable(2);
      cameras.set(id, camera);
    }
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    return camera;
  }

  function capture(id = "arena-hero", requestedWidth = 7680) {
    const world = HD.world;
    const renderer = world.renderer;
    if (!renderer || renderer.getContext().isContextLost()) {
      throw new Error("The game renderer is not ready.");
    }
    if (!Number.isFinite(requestedWidth)) throw new Error("Invalid image size.");
    const gl = renderer.getContext();
    const limit = Math.min(
      7680,
      gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
      gl.getParameter(gl.MAX_TEXTURE_SIZE),
    );
    const width = Math.floor(Math.min(limit, Math.max(640, requestedWidth)) / 16) * 16;
    const height = width * 9 / 16;
    const camera = cameraFor(id, width / height);
    const size = renderer.getSize(new THREE.Vector2());
    const pixelRatio = renderer.getPixelRatio();
    const target = renderer.getRenderTarget();
    const shadows = renderer.shadowMap.enabled;
    const updateShadows = renderer.shadowMap.autoUpdate;
    const firstPersonVisible = world.camera.visible;
    const originalFog = world.scene.fog;
    const cloudLayer = world.scene.getObjectByName("Stadium cloud layer");
    const cloudVisible = cloudLayer?.visible;
    const shadowLights = [];
    const textureSettings = new Map();
    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
    world.scene.traverse(light => {
      const materials = Array.isArray(light.material) ? light.material : [light.material];
      for (const material of materials) {
        const texture = material?.map;
        if (!texture || textureSettings.has(texture) || texture.isRenderTargetTexture) continue;
        textureSettings.set(texture, texture.anisotropy);
        texture.anisotropy = maxAnisotropy;
        texture.needsUpdate = true;
      }
      if (!light.isDirectionalLight || !light.shadow) return;
      shadowLights.push({
        light, cast: light.castShadow, map: light.shadow.map,
        size: light.shadow.mapSize.clone(),
      });
      light.castShadow = true;
      light.shadow.map = null;
      light.shadow.mapSize.set(4096, 4096);
    });
    try {
      HD.Stadium.showAllViewCulled();
      // Ground-level fog distances would wash out a camera hundreds of units up.
      if (originalFog?.isFog) {
        world.scene.fog = originalFog.clone();
        world.scene.fog.near = camera.position.length() + 130;
        world.scene.fog.far = world.scene.fog.near + 400;
      }
      if (cloudLayer) cloudLayer.visible = false;
      world.camera.visible = false;
      renderer.setRenderTarget(null);
      renderer.setPixelRatio(1);
      renderer.setSize(width, height, false);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.autoUpdate = true;
      renderer.render(world.scene, camera);
      const dataUrl = renderer.domElement.toDataURL("image/png");
      if (dataUrl === "data:,") throw new Error("This device cannot export that image size.");
      return { dataUrl, width, height, preset: id };
    } finally {
      world.scene.fog = originalFog;
      if (cloudLayer) cloudLayer.visible = cloudVisible;
      world.camera.visible = firstPersonVisible;
      for (const [texture, anisotropy] of textureSettings) {
        texture.anisotropy = anisotropy;
        texture.needsUpdate = true;
      }
      for (const entry of shadowLights) {
        entry.light.shadow.map?.dispose();
        entry.light.shadow.map = entry.map;
        entry.light.shadow.mapSize.copy(entry.size);
        entry.light.castShadow = entry.cast;
      }
      renderer.shadowMap.enabled = shadows;
      renderer.shadowMap.autoUpdate = updateShadows;
      HD.Stadium.updateViewCulling(world.camera);
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(size.x, size.y, false);
      renderer.setRenderTarget(target);
    }
  }

  function open() {
    if (!HD.world.renderer || panel?.open) return;
    if (!panel) {
      panel = document.createElement("dialog");
      panel.className = "arena-photo-panel";
      panel.setAttribute("aria-label", "Arena photo cameras");
      panel.innerHTML = '<h2>Arena photos</h2>' +
        '<p>Invisible aerial cameras. Clean PNGs with no interface or first-person hands.</p>' +
        '<label>Viewpoint <select></select></label>' +
        '<img alt="Preview of the selected arena camera" />' +
        '<p role="status"></p><div><button data-preview>Preview</button>' +
        '<button data-export>Save 8K PNG</button><button data-close>Close</button></div>';
      const select = panel.querySelector("select");
      for (const preset of presets) select.add(new Option(preset.name, preset.id));
      panel.querySelector("[data-close]").onclick = () => panel.close();
      panel.addEventListener("close", () => { HD.state.paused = pausedBefore; });
      const render = (download) => {
        const status = panel.querySelector('[role="status"]');
        try {
          const result = capture(select.value, download ? 7680 : 1280);
          panel.querySelector("img").src = result.dataUrl;
          status.textContent = result.width + " × " + result.height + " — actual game capture";
          if (download) {
            const link = document.createElement("a");
            link.href = result.dataUrl;
            link.download = result.preset + "-" + Date.now() + ".png";
            link.click();
          }
        } catch (error) {
          status.textContent = error.message + " Try Preview or a lower size with HD.Photo.capture().";
        }
      };
      panel.querySelector("[data-preview]").onclick = () => render(false);
      panel.querySelector("[data-export]").onclick = () => render(true);
      select.onchange = () => render(false);
      document.body.append(panel);
    }
    pausedBefore = HD.state.paused;
    HD.state.paused = true;
    document.exitPointerLock?.();
    panel.showModal();
    panel.querySelector("[data-preview]").click();
  }

  addEventListener("keydown", event => {
    if (event.code !== "F8" || event.repeat ||
        /INPUT|TEXTAREA|SELECT/.test(event.target?.tagName || "")) return;
    event.preventDefault();
    if (panel?.open) panel.close();
    else open();
  });
  return { presets, cameraFor, capture, open };
})();
