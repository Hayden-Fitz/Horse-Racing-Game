import fs from 'node:fs/promises';
const port = process.argv[2] || '9361';
const target = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' }).then(r => r.json());
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
let serial = 0;
const pending = new Map();
const errors = [];
socket.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data);
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails?.text || 'runtime error');
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  clearTimeout(request.timer);
  if (message.error) request.reject(new Error(JSON.stringify(message.error)));
  else request.resolve(message.result);
});
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++serial;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 45000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const response = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
  return response.result.value;
}
async function screenshot(name) {
  const result = await call('Page.captureScreenshot', { format: 'png' });
  await fs.mkdir('artifacts', { recursive: true });
  await fs.writeFile(`artifacts/race-review-${name}.png`, Buffer.from(result.data, 'base64'));
}
try {
  await call('Runtime.enable');
  await call('Page.enable');
  await call('Network.enable');
  await call('Network.setCacheDisabled', { cacheDisabled: true });
  await call('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__webglLosses=0; document.addEventListener("webglcontextlost", () => {window.__webglLosses++}, true);' });
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await call('Page.navigate', { url: 'http://127.0.0.1:8080/index.html' });
  let ready = false;
  for (let i = 0; i < 150; i++) {
    ready = await evaluate('Boolean(window.HD?.world?.renderer && HD.state.horses.length)');
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  if (!ready) throw new Error('Game did not boot: ' + JSON.stringify(errors));
  await evaluate('HD.Controls.closeMenu()');
  await evaluate(`(() => {
    window.__renderSamples = [];
    const renderer = HD.world.renderer;
    const original = renderer.render.bind(renderer);
    renderer.render = (scene, camera) => {
      const secondary = Boolean(renderer.getRenderTarget());
      const start = performance.now();
      try { return original(scene, camera); }
      finally { window.__renderSamples.push({ secondary, ms: performance.now() - start }); }
    };
  })()`);
  await new Promise(resolve => setTimeout(resolve, 100));
  await screenshot('loading');
  await new Promise(resolve => setTimeout(resolve, 650));
  await screenshot('day-card');
  await new Promise(resolve => setTimeout(resolve, 4600));
  const before = await evaluate(`(() => ({ phase: HD.state.phase, timer: HD.state.timer,
    transition: HD.state.transitionActive, broadcast: HD.Broadcast.diagnostics,
    renderer: HD.world.renderer.info.render, webglLost: HD.world.renderer.getContext().isContextLost(), losses: window.__webglLosses }))()`);
  const baseline = await evaluate(`new Promise(resolve => {
    const intervals=[]; let last=0, started=0;
    function frame(t) {
      if (!started) started=t;
      if (last) intervals.push(t-last);
      last=t;
      if (t-started < 2500) requestAnimationFrame(frame);
      else { intervals.sort((a,b)=>a-b);
        const p=q=>Number(intervals[Math.min(intervals.length-1,Math.floor(intervals.length*q))].toFixed(1));
        resolve({frames:intervals.length,medianMs:p(.5),p95Ms:p(.95),maxMs:p(1)}); }
    }
    requestAnimationFrame(frame);
  })`);
  const metrics = await evaluate(`new Promise(resolve => {
    const intervals = [], phases = [];
    let last = 0, started = 0;
    HD.state.timer = 0.15;
    function frame(t) {
      if (!started) started = t;
      if (last) intervals.push(t - last);
      last = t;
      if (phases.at(-1)?.phase !== HD.state.phase) phases.push({ phase: HD.state.phase, at: Math.round(t - started) });
      if (t - started < 4200) requestAnimationFrame(frame);
      else {
        intervals.sort((a,b) => a-b);
        const percentile = p => Number(intervals[Math.min(intervals.length-1, Math.floor(intervals.length*p))].toFixed(1));
        resolve({ frames: intervals.length, medianMs: percentile(.5), p95Ms: percentile(.95),
          p99Ms: percentile(.99), maxMs: percentile(1), over100ms: intervals.filter(ms => ms > 100).length,
          phases, broadcast: HD.Broadcast.diagnostics, renderer: HD.world.renderer.info.render, webglLost: HD.world.renderer.getContext().isContextLost(), losses: window.__webglLosses });
      }
    }
    requestAnimationFrame(frame);
  })`);
  await screenshot('race');
  const withoutBroadcast = await evaluate(`new Promise(resolve => {
    const original = HD.Broadcast.update; HD.Broadcast.update = () => {};
    const intervals=[]; let last=0, started=0;
    function frame(t) {
      if (!started) started=t;
      if (last) intervals.push(t-last);
      last=t;
      if (t-started < 3500) requestAnimationFrame(frame);
      else { HD.Broadcast.update=original; intervals.sort((a,b)=>a-b);
        const p=q=>Number(intervals[Math.min(intervals.length-1,Math.floor(intervals.length*q))].toFixed(1));
        resolve({frames:intervals.length,medianMs:p(.5),p95Ms:p(.95),maxMs:p(1)}); }
    }
    requestAnimationFrame(frame);
  })`);
  const lowResolution = await evaluate(`new Promise(resolve => {
    HD.Settings.renderHeight = () => 360; HD.Game.applyResolution();
    const intervals=[]; let last=0, started=0;
    function frame(t) {
      if (!started) started=t;
      if (last) intervals.push(t-last);
      last=t;
      if (t-started < 3500) requestAnimationFrame(frame);
      else { intervals.sort((a,b)=>a-b);
        const p=q=>Number(intervals[Math.min(intervals.length-1,Math.floor(intervals.length*q))].toFixed(1));
        resolve({frames:intervals.length,medianMs:p(.5),p95Ms:p(.95),maxMs:p(1),
          pixelRatio:HD.world.renderer.getPixelRatio()}); }
    }
    requestAnimationFrame(frame);
  })`);
  const renderCosts = await evaluate(`(() => {
    const summarize = values => {
      values.sort((a,b) => a-b);
      const at = p => Number((values[Math.min(values.length-1, Math.floor(values.length*p))] || 0).toFixed(1));
      return { count: values.length, medianMs: at(.5), p95Ms: at(.95), maxMs: at(1) };
    };
    return { main: summarize(window.__renderSamples.filter(x => !x.secondary).map(x => x.ms)),
      secondary: summarize(window.__renderSamples.filter(x => x.secondary).map(x => x.ms)) };
  })()`);
  console.log(JSON.stringify({ before, baseline, metrics, withoutBroadcast, lowResolution, renderCosts, errors }, null, 2));
} finally {
  socket.close();
  await fetch(`http://127.0.0.1:${port}/json/close/${target.id}`).catch(() => {});
}
