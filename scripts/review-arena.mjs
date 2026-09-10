import fs from 'node:fs/promises';

const port = process.argv[2] || '9355';
const endpoint = `http://127.0.0.1:${port}`;
const page = await fetch(`${endpoint}/json/new?about:blank`, { method: 'PUT' }).then(r => r.json());
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
let sequence = 0;
const pending = new Map();
const errors = [];
socket.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data);
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
  if (!message.id) return;
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  clearTimeout(request.timer);
  if (message.error) request.reject(new Error(JSON.stringify(message.error)));
  else request.resolve(message.result);
});
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(method + ' timed out')); }, 45000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await call('Runtime.evaluate', { expression, returnByValue: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
try {
  await call('Runtime.enable');
  await call('Page.enable');
  await call('Network.enable');
  await call('Network.setCacheDisabled', { cacheDisabled: true });
  await call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await call('Page.navigate', { url: 'http://127.0.0.1:8080/index.html' });
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    ready = await evaluate('Boolean(window.HD?.world?.renderer && HD.state.horses.length)');
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error('Game did not boot: ' + JSON.stringify(errors));
  const shopping = await evaluate(`(() => {
    const money = HD.state.money;
    HD.state.money = 1000;
    HD.UI.phone(true);
    document.querySelector('[data-app="shop"]').click();
    HD.UI.render();
    const shop = document.querySelector('#shop-items');
    const before = shop.offsetTop;
    for (let order = 0; order < 5; order++) {
      shop.querySelector('[data-buy-item]').click();
    }
    const after = shop.offsetTop;
    HD.state.money = money;
    HD.state.deliveries = [];
    HD.UI.phone(false);
    HD.UI.render();
    return { before, after, stable: Math.abs(after - before) < 1 };
  })()`);
  console.log('Repeated concessions orders:', JSON.stringify(shopping));
  if (!shopping.stable) throw new Error('Ordering moved the concessions shopping controls');
  await evaluate(`(() => {
    const style = document.createElement('style');
    style.textContent = '#app > :not(#viewport), #viewport > :not(canvas), body > :not(#app):not(script):not(style) { display:none !important; }';
    document.head.appendChild(style);
    HD.state.paused = true;
    HD.Stadium.refreshBettingDisplays();
    HD.world.renderer.setPixelRatio(1);
    HD.world.renderer.setSize(1280, 800);
    HD.world.camera.aspect = 1.6;
    HD.world.camera.updateProjectionMatrix();
  })()`);
  await fs.mkdir('artifacts', { recursive: true });
  const routes = await evaluate(`(() => {
    const failures = [];
    const S = HD.state;
    S.standing = true;
    S.mode = 'look';
    S.vendorOpen = S.counterOpen = false;
    const mainStairs = HD.world.staircases.map((stairs, index) => {
      const info = stairs.userData.staircase;
      const startPoint = new THREE.Vector3(...info.start).setY(HD.CONFIG.stairs.bottomHeight);
      const endPoint = new THREE.Vector3(...info.end).setY(HD.CONFIG.stairs.topHeight);
      const direction = endPoint.clone().sub(startPoint).setY(0).normalize();
      startPoint.addScaledVector(direction, -0.7);
      endPoint.addScaledVector(direction, 0.7);
      return { id: 'main-stairs-' + index, startPoint, endPoint };
    });
    for (const route of [...HD.world.arenaSurfaces.filter(surface => surface.stairs), ...mainStairs]) {
      for (const reverse of [false, true]) {
        const start = reverse ? route.endPoint : route.startPoint;
        const end = reverse ? route.startPoint : route.endPoint;
        S.playerPosition.copy(start).y += HD.CONFIG.eyeHeight;
        S.yaw = Math.atan2(start.x - end.x, start.z - end.z);
        Object.assign(S.movement, { forward: true, backward: false, left: false, right: false });
        let remaining = Infinity;
        for (let frame = 0; frame < 800; frame++) {
          remaining = Math.hypot(S.playerPosition.x - end.x, S.playerPosition.z - end.z);
          if (remaining < 0.4) break;
          HD.Controls.update(0.02);
        }
        if (remaining >= 0.4) {
          failures.push({
            id: route.id,
            reverse,
            remaining,
            position: S.playerPosition.toArray(),
            upperSurface: HD.Stadium.upperWalkSurfaceAt(
              S.playerPosition.x,
              S.playerPosition.z,
              S.playerPosition.y - HD.CONFIG.eyeHeight,
              end.clone().sub(start).setY(0),
            )?.zone || null,
          });
        }
      }
    }
    // Enter every lower-bowl stair sideways from every seating row. This is
    // the route players use most often, and catches mismatched row/stair
    // heights that a straight bottom-to-top traversal cannot detect.
    for (let stairIndex = 0; stairIndex < 4; stairIndex++) {
      const angle = stairIndex * Math.PI / 2;
      const tangent = new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle));
      for (let row = 0; row < 7; row++) {
        const radiusX = 82.1 + row * 3.25;
        const radiusZ = 51.85 + row * 2.75;
        const crossing = new THREE.Vector3(
          Math.cos(angle) * radiusX,
          HD.CONFIG.grandstandBaseHeight + row * 1.5 + HD.CONFIG.eyeHeight,
          Math.sin(angle) * radiusZ,
        );
        const start = crossing.clone().addScaledVector(tangent, HD.CONFIG.stairs.width / 2 + 1.8);
        const end = crossing.clone();
        S.playerPosition.copy(start);
        S.yaw = Math.atan2(start.x - end.x, start.z - end.z);
        Object.assign(S.movement, { forward: true, backward: false, left: false, right: false });
        HD.Controls.update(0.02);
        const entryLateral = Math.abs(
          S.playerPosition.clone().sub(crossing).dot(tangent),
        );
        if (entryLateral < 3) {
          failures.push({
            id: 'row-entry-centered-' + stairIndex + '-' + row,
            entryLateral,
          });
        }
        let remaining = Infinity;
        for (let frame = 0; frame < 140; frame++) {
          remaining = Math.hypot(S.playerPosition.x - end.x, S.playerPosition.z - end.z);
          if (remaining < 0.45) break;
          HD.Controls.update(0.02);
        }
        if (remaining >= 0.45) {
          failures.push({
            id: 'row-entry-' + stairIndex + '-' + row,
            remaining,
            position: S.playerPosition.toArray(),
          });
        }

        for (const side of [-1, 1]) {
          const rowTarget = crossing.clone().addScaledVector(
            tangent,
            side * (HD.CONFIG.stairs.width / 2 + 1.2),
          );
          S.playerPosition.copy(crossing);
          S.yaw = Math.atan2(
            crossing.x - rowTarget.x,
            crossing.z - rowTarget.z,
          );
          let exitRemaining = Infinity;
          for (let frame = 0; frame < 100; frame++) {
            exitRemaining = Math.hypot(
              S.playerPosition.x - rowTarget.x,
              S.playerPosition.z - rowTarget.z,
            );
            if (exitRemaining < 0.45) break;
            HD.Controls.update(0.02);
          }
          if (exitRemaining >= 0.45) {
            failures.push({
              id: 'row-exit-' + stairIndex + '-' + row + '-' + side,
              remaining: exitRemaining,
              position: S.playerPosition.toArray(),
            });
          }
        }
      }
    }
    S.movement.forward = false;
    return failures;
  })()`);
  console.log('Movement route failures:', JSON.stringify(routes));
  if (routes.length) process.exitCode = 1;
  const stairViews = await evaluate(`(() => {
    return HD.world.staircases.slice(0, 3).map((staircase, index) => {
      const info = staircase.userData.staircase;
      const startPoint = new THREE.Vector3(...info.start)
        .setY(HD.CONFIG.stairs.bottomHeight);
      const endPoint = new THREE.Vector3(...info.end)
        .setY(HD.CONFIG.stairs.topHeight);
      const direction = endPoint.clone().sub(startPoint).setY(0).normalize();
      const camera = startPoint.clone().addScaledVector(direction, -0.5);
      camera.y += HD.CONFIG.eyeHeight;
      const target = startPoint.clone().lerp(endPoint, 0.5);
      target.y += 1.2;
      return ['stair-detail-' + index, camera.toArray(), target.toArray()];
    });
  })()`);
  for (const [name, position, target] of [
    ...stairViews,
    ['main-stair-detail', [9, 8, 43], [0, 8, 59]],
    ['seat-detail', [27, 11.5, 48], [20.4, 9, 53]],
    ['overview', [145, 115, 155], [0, 8, 0]],
    ['opposite', [-140, 100, -145], [0, 9, 0]],
    ['shop-concourse', [14, 18.3, 64], [0, 13.5, 81]],
    ['concourse', [74, 17.2, 50], [82, 16.4, 57]],
    ['restrooms', [101.5, 16.8, 13.4], [112.71, 16.3, 15.6]],
    ['first-aid', [-58.9, 16.8, 57.8], [-63.9, 16.3, 65.26]],
    ['betting-counter', [65.4, 17.2, 57.6], [72.5, 16.2, 64.7]],
    ['fixer-hub', [-99, 18.2, 14], [-108, 16.1, 21]],
    ['public-entry', [145, 9, 0], [126, 4, 0]],
    ['exterior-facade', [151, 17, -80], [102, 7, -58]],
    ['replay-board', [-20, 25, -42], [-27, 27, -78]],
    ['infield-crew', [42, 7, 17], [35, 2, 9]],
  ]) {
    const info = await evaluate(`(() => {
      HD.world.camera.position.set(${position.join(',')});
      HD.world.camera.lookAt(${target.join(',')});
      HD.world.renderer.render(HD.world.scene, HD.world.camera);
      return { calls: HD.world.renderer.info.render.calls, triangles: HD.world.renderer.info.render.triangles };
    })()`);
    const screenshot = await call('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
    await fs.writeFile(`artifacts/arena-${name}.jpg`, Buffer.from(screenshot.data, 'base64'));
    console.log(name, info);
  }
  console.log('Runtime errors:', JSON.stringify(errors));
  if (errors.length) process.exitCode = 1;
} finally {
  socket.close();
  await fetch(`${endpoint}/json/close/${page.id}`).catch(() => {});
}
