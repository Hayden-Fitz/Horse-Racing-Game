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
  await evaluate(`(() => {
    const style = document.createElement('style');
    style.textContent = '#app > :not(#viewport), #viewport > :not(canvas), body > :not(#app):not(script):not(style) { display:none !important; }';
    document.head.appendChild(style);
    HD.state.paused = true;
    HD.world.renderer.setPixelRatio(1);
    HD.world.renderer.setSize(1280, 800);
    HD.world.camera.aspect = 1.6;
    HD.world.camera.updateProjectionMatrix();
  })()`);
  await fs.mkdir('artifacts', { recursive: true });
  for (const [name, position, target] of [
    ['overview', [145, 115, 155], [0, 8, 0]],
    ['opposite', [-140, 100, -145], [0, 9, 0]],
    ['upper-stairs', [14, 23, 64], [0, 19, 81]],
    ['infield-crew', [42, 7, 17], [35, 2, 9]],
  ]) {
    const info = await evaluate(`(() => {
      HD.world.camera.position.set(${position.join(',')});
      HD.world.camera.lookAt(${target.join(',')});
      HD.world.renderer.render(HD.world.scene, HD.world.camera);
      return { calls: HD.world.renderer.info.render.calls, triangles: HD.world.renderer.info.render.triangles };
    })()`);
    const screenshot = await call('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(`artifacts/arena-${name}.png`, Buffer.from(screenshot.data, 'base64'));
    console.log(name, info);
  }
  console.log('Runtime errors:', JSON.stringify(errors));
  if (errors.length) process.exitCode = 1;
} finally {
  socket.close();
  await fetch(`${endpoint}/json/close/${page.id}`).catch(() => {});
}
