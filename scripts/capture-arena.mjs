import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";

// Output stays in artifacts unless an explicit destination is supplied.
const port = process.argv[2] || "9359";
const output = path.resolve(process.argv[3] || "artifacts/arena-photos");
await fs.mkdir(output, { recursive: true });
const tab = await fetch("http://127.0.0.1:" + port + "/json/new?about:blank", {
  method: "PUT",
}).then(response => response.json());
const socket = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener("open", resolve, { once: true }));
let id = 0;
const requests = new Map();
const errors = [];
socket.addEventListener("message", ({ data }) => {
  const message = JSON.parse(data);
  if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails);
  const request = requests.get(message.id);
  if (!request) return;
  clearTimeout(request.timeout);
  requests.delete(message.id);
  if (message.error) request.reject(new Error(JSON.stringify(message.error)));
  else request.resolve(message.result);
});
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const requestId = ++id;
    const timeout = setTimeout(() => reject(new Error("Timed out: " + method)), 60000);
    requests.set(requestId, { resolve, reject, timeout });
    socket.send(JSON.stringify({ id: requestId, method, params }));
  });
}
async function evaluate(expression) {
  const response = await call("Runtime.evaluate", {
    expression, returnByValue: true, awaitPromise: true,
  });
  if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
  return response.result.value;
}
async function save(preset, width, filename) {
  const result = await evaluate("HD.Photo.capture(" + JSON.stringify(preset) + "," + width + ")");
  const buffer = Buffer.from(result.dataUrl.split(",")[1], "base64");
  assert.equal(buffer.readUInt32BE(16), result.width);
  assert.equal(buffer.readUInt32BE(20), result.height);
  await fs.writeFile(path.join(output, filename), buffer, { flag: "wx" });
  console.log(JSON.stringify({ filename, width: result.width, height: result.height, bytes: buffer.length }));
}
try {
  await call("Runtime.enable");
  await call("Page.enable");
  await call("Network.enable");
  await call("Network.setCacheDisabled", { cacheDisabled: true });
  await call("Page.addScriptToEvaluateOnNewDocument", { source:
    "localStorage.setItem('hotdog-downs-quality','high');" +
    "localStorage.setItem('hotdog-downs-settings-v1',JSON.stringify({modelDetail:'high'}));"
  });
  await call("Page.navigate", { url: "http://127.0.0.1:8080/index.html" });
  let ready = false;
  for (let attempt = 0; attempt < 150; attempt++) {
    ready = await evaluate("Boolean(window.HD?.Photo && HD.world.renderer && HD.state.horses.length)");
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.ok(ready, "Game did not initialize");
  await evaluate(`HD.state.paused = true; HD.Race.begin();
    for(let i=0;i<90;i++){ HD.state.elapsed+=.04; HD.Race.update(.04); }
    HD.Controls.update(.016); HD.Stadium.update(HD.state.elapsed);
    HD.Broadcast.update(.04);`);
  console.log(await evaluate("JSON.stringify({ occluders: HD.world.broadcastOccluders?.length, detail: HD.Settings.modelDetail() })"));
  const before = await evaluate(`({
    size: HD.world.renderer.getSize(new THREE.Vector2()).toArray(),
    ratio: HD.world.renderer.getPixelRatio(),
    visible: HD.world.camera.visible,
    shadows: HD.world.renderer.shadowMap.enabled
  })`);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  if (process.env.ARENA_REVIEW === '1') {
    await evaluate(`{
      const booth = HD.world.scene.getObjectByName('Aligned concessions booth 0');
      const eye = booth.localToWorld(new THREE.Vector3(-4, 4.8, -10));
      const target = booth.localToWorld(new THREE.Vector3(2, 2.8, 0));
      HD.Photo.presets.push({ id:'review-concourse', name:'Concourse inspection',
        position:eye.toArray(), target:target.toArray(), fov:75 });
      HD.Photo.presets.push({ id:'review-stairs', name:'Stair inspection',
        position:[78,7,0], target:[95,8,0], fov:65 });
    }`);
    await save('review-concourse', 1280, 'concourse-review-' + stamp + '.png');
    await save('review-stairs', 1280, 'stairs-review-' + stamp + '.png');
  }
  if (process.env.ARENA_FINAL !== "1" && process.env.ARENA_REVIEW !== '1') {
    for (const preset of await evaluate("HD.Photo.presets.map(preset => preset.id)")) {
      await save(preset, 1280, preset + "-preview-" + stamp + ".png");
    }
  }
  if (process.env.ARENA_FINAL === "1") {
    await save("arena-hero", 7680, "Hotdog-Downs-Arena-8K-" + stamp + ".png");
    await save("arena-overhead", 7680, "Hotdog-Downs-Overhead-8K-" + stamp + ".png");
  }
  const after = await evaluate(`({
    size: HD.world.renderer.getSize(new THREE.Vector2()).toArray(),
    ratio: HD.world.renderer.getPixelRatio(),
    visible: HD.world.camera.visible,
    shadows: HD.world.renderer.shadowMap.enabled
  })`);
  assert.deepEqual(after, before, "Photo capture must restore the game renderer");
  await evaluate('HD.Photo.open()');
  assert.equal(await evaluate('document.querySelector(".arena-photo-panel").open'), true);
  await evaluate('document.querySelector(".arena-photo-panel [data-close]").click()');
  assert.equal(await evaluate('HD.state.paused'), true, 'Photo dialog restores previous pause state');
  assert.deepEqual(errors, [], "No browser exceptions during photography");
  console.log("Photo rendering and state restoration passed.");
} finally {
  await call("Page.close").catch(() => {});
  socket.close();
}
