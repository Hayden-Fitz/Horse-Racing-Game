import assert from 'node:assert/strict';

const debugPort = process.argv[2] || '9355';
const gamePort = process.argv[3] || '8124';
const version = await fetch(`http://127.0.0.1:${debugPort}/json/version`).then(r => r.json());
const socket = new WebSocket(version.webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
const pending = new Map();
const contexts = [];
const errors = [];
let sequence = 0;
socket.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data);
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  clearTimeout(request.timer);
  if (message.error) request.reject(new Error(JSON.stringify(message.error)));
  else request.resolve(message.result);
});
function call(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => reject(new Error(method + ' timed out')), 20000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params, sessionId }));
  });
}
async function evaluate(session, expression) {
  const result = await call('Runtime.evaluate', {
    expression, returnByValue: true, awaitPromise: true,
  }, session);
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function wait(session, expression) {
  for (let i = 0; i < 100; i++) {
    if (await evaluate(session, expression)) return;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error('Timed out: ' + expression);
}
async function page(name) {
  const { browserContextId } = await call('Target.createBrowserContext');
  contexts.push(browserContextId);
  const { targetId } = await call('Target.createTarget', { url: 'about:blank', browserContextId });
  const { sessionId } = await call('Target.attachToTarget', { targetId, flatten: true });
  await call('Runtime.enable', {}, sessionId);
  await call('Page.navigate', { url: `http://127.0.0.1:${gamePort}/` }, sessionId);
  await wait(sessionId, 'Boolean(window.HD?.Network && HD.world.localPlayer)');
  await evaluate(sessionId, `document.querySelector('#player-name').value = ${JSON.stringify(name)}`);
  return sessionId;
}
try {
  const host = await page('Review Host');
  const guest = await page('Review Guest');
  await evaluate(host, "document.querySelector('#lobby-create').click()");
  await wait(host, "HD.Network.isConnected()");
  const code = await evaluate(host, "document.querySelector('#lobby-room-code').textContent");
  await evaluate(guest, `document.querySelector('#lobby-code').value = ${JSON.stringify(code)}; document.querySelector('#lobby-join').click()`);
  await wait(guest, 'HD.Network.isConnected()');
  await wait(host, 'HD.Network.rankingPlayers().length === 2');
  assert.equal(await evaluate(host, 'HD.Network.isHost()'), true);
  assert.equal(await evaluate(guest, 'HD.Network.isHost()'), false);
  await evaluate(host, "HD.Network.updateMatchRules({ ...HD.MatchSetup.defaults, horseCount: 4, startingMoney: 700 })");
  await wait(guest, 'HD.CONFIG.raceHorseCount === 4 && HD.state.money === 700');
  await evaluate(host, "document.querySelector('#lobby-ready').click()");
  await evaluate(guest, "document.querySelector('#lobby-ready').click()");
  await wait(host, "!document.querySelector('#lobby-start').disabled");
  await evaluate(host, "document.querySelector('#lobby-start').click()");
  await wait(guest, 'HD.Network.isPlaying()');
  await evaluate(host, 'HD.state.paused = true; HD.state.timer = 23; HD.state.phase = "preparation"; HD.Network.update(1)');
  await wait(guest, 'Math.abs(HD.state.timer - 23) < 1');
  await evaluate(host, 'HD.world.localPlayer.position.x = 12.345; HD.state.mode = "phone"; HD.Network.update(1)');
  await wait(guest, '[...HD.world.remotePlayers.values()].some(p => Math.abs(p.userData.targetPosition.x - 12.345) < 0.01 && p.userData.activity === "phone")');
  await evaluate(host, 'HD.Network.sendChatMessage("group", "Local multiplayer verification")');
  await wait(guest, 'HD.Network.chatHistory("group").some(m => m.text === "Local multiplayer verification")');
  assert.deepEqual(errors, []);
  console.log('PASS: isolated browser clients create/join, host-owned rules, ready/start, race timing, avatar movement/phone and group chat.');
} finally {
  for (const browserContextId of contexts) await call('Target.disposeBrowserContext', { browserContextId });
  socket.close();
}
