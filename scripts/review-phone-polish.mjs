import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

// Uses an explicitly launched disposable Chrome profile, never the user's tabs.
const port = process.argv[2] || '9358';
const tab = await fetch('http://127.0.0.1:' + port + '/json/new?about:blank', {
  method: 'PUT',
}).then(response => response.json());
const socket = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
let nextId = 0;
const pending = new Map();
const errors = [];
socket.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data);
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  clearTimeout(request.timeout);
  if (message.error) request.reject(new Error(JSON.stringify(message.error)));
  else request.resolve(message.result);
});
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error('CDP timed out: ' + method));
    }, 30000);
    pending.set(id, { resolve, reject, timeout });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const response = await call('Runtime.evaluate', {
    expression, returnByValue: true, awaitPromise: true,
  });
  if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
  return response.result.value;
}
async function capture(name) {
  const screenshot = await call('Page.captureScreenshot', { format: 'png' });
  await fs.writeFile('artifacts/phone-' + name + '.png', Buffer.from(screenshot.data, 'base64'));
}

try {
  await call('Runtime.enable');
  await call('Page.enable');
  await call('Network.enable');
  await call('Network.setCacheDisabled', { cacheDisabled: true });
  await call('Emulation.setDeviceMetricsOverride', {
    width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false,
  });
  await call('Page.navigate', { url: 'http://127.0.0.1:8080/index.html' });
  let ready = false;
  for (let i = 0; i < 150; i++) {
    ready = await evaluate('Boolean(window.HD?.world?.renderer && HD.state.horses.length)');
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.ok(ready, 'Game must boot');
  await fs.mkdir('artifacts', { recursive: true });
  await evaluate(`HD.state.paused = true; HD.state.matchStarted = true;
    HD.UI.menu(false); HD.Controls.setMode('phone');
    HD.state.paused = true; HD.UI.render();`);
  await new Promise(resolve => setTimeout(resolve, 350));
  await capture('home');
  const panels = [];
  for (const app of ['shop', 'transfer', 'news']) {
    await evaluate("document.querySelector('[data-app=" + app + "]').click()");
    if (app === 'news') {
      await evaluate(`HD.Race.begin(); for(let i=0;i<5;i++) {
        HD.state.elapsed += 1/60; HD.Race.update(1/60); HD.Broadcast.update(1/60);
      }`);
    }
    await capture(app);
    panels.push(await evaluate(`(() => {
      const panel = document.querySelector('.app-panel.active');
      return { app: panel.dataset.panel, width: panel.clientWidth,
        scrollWidth: panel.scrollWidth,
        phoneWidth: document.querySelector('#phone').getBoundingClientRect().width };
    })()`));
    await evaluate("document.querySelector('#phone-home').click()");
    assert.equal(await evaluate("document.querySelector('#phone').classList.contains('app-open')"), false);
  }
  assert.ok(panels.every(panel => panel.scrollWidth <= panel.width + 1), 'No horizontal panel overflow');
  assert.ok(panels.every(panel => Math.abs(panel.phoneWidth - panels[0].phoneWidth) < 1),
    'Phone size must stay constant between apps');
  const news = await evaluate(`(() => {
    const canvas = document.querySelector('#news-live-canvas');
    const pixels = canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
    let visiblePixels=0;
    for(let i=0;i<pixels.length;i+=4) if(pixels[i]+pixels[i+1]+pixels[i+2]>20) visiblePixels++;
    return {visiblePixels, ...HD.Broadcast.diagnostics};
  })()`);
  assert.ok(news.visiblePixels > 10000, 'Phone must contain real video pixels');
  assert.equal(news.newsReadbackFailures, 0);
  await evaluate(`document.querySelector('[data-app=transfer]').click();
    window.reviewRequests = [];
    HD.Network.isConnected = () => true;
    HD.Network.transferTargets = () => [{id:'review-recipient',name:'Friend <R>'}];
    HD.Network.requestMoney = (id, amount) => {
      reviewRequests.push({id, amount}); return true;
    };
    HD.UI.render();
    document.querySelector('#transfer-money').value = '25';
    document.querySelector('#request-money').click();`);
  assert.deepEqual(await evaluate('reviewRequests'), [{id:'review-recipient',amount:25}]);
  assert.equal(await evaluate("document.querySelector('#transfer-player option').textContent"),
    'Friend <R>', 'Recipient names must be displayed as text, not HTML');
  await capture('request');
  await evaluate("document.querySelector('#phone-home').click()");
  await call('Emulation.setDeviceMetricsOverride', {
    width: 1280, height: 720, deviceScaleFactor: 1, mobile: false,
  });
  await new Promise(resolve => setTimeout(resolve, 100));
  await capture('home-720');
  const compact = await evaluate(`(() => {
    const home = document.querySelector('#phone-home').getBoundingClientRect();
    const apps = [...document.querySelectorAll('[data-app]')].slice(0,8);
    return {bottom:home.bottom, allVisible: apps.every(app => {
      const rect=app.getBoundingClientRect();
      return rect.width>0 && rect.top>0 && rect.bottom<=home.top;
    })};
  })()`);
  assert.ok(compact.bottom <= 720 && compact.allVisible,
    'All eight home apps and the home button must fit a 720p screen');
  assert.equal(errors.length, 0, JSON.stringify(errors));
  console.log(JSON.stringify({ panels, news, compact, errors }, null, 2));
} finally {
  await call('Page.close').catch(() => {});
  socket.close();
}
