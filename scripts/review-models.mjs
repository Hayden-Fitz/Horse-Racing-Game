import fs from "node:fs/promises";

const port = process.argv[2] || "9337";
const page = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" }).then((response) => response.json());
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});
let nextId = 1;
const pending = new Map();
const errors = [];
socket.addEventListener("message", ({ data }) => {
  const message = JSON.parse(data);
  if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails);
  if (message.id) {
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  }
});
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    const timeout = setTimeout(() => reject(new Error(`Browser timeout: ${method}`)), 30000);
    pending.set(id, {
      resolve(value) { clearTimeout(timeout); resolve(value); },
      reject(error) { clearTimeout(timeout); reject(error); },
    });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
await call("Runtime.enable");
await call("Page.enable");
await call("Network.enable");
await call("Network.setCacheDisabled", { cacheDisabled: true });
await call("Emulation.setDeviceMetricsOverride", { width: 1600, height: 1100, deviceScaleFactor: 1, mobile: false });
await call("Page.navigate", { url: "http://127.0.0.1:8080/model-gallery.html" });
let ready = false;
for (let attempt = 0; attempt < 100; attempt++) {
  const result = await call("Runtime.evaluate", { expression: "window.modelGalleryReady === true", returnByValue: true });
  if (result.result?.value) { ready = true; break; }
  await new Promise((resolve) => setTimeout(resolve, 300));
}
if (!ready) throw new Error(`Model gallery did not load: ${JSON.stringify(errors)}`);
const screenshot = await call("Page.captureScreenshot", { format: "png" });
await fs.mkdir("artifacts", { recursive: true });
await fs.writeFile("artifacts/model-gallery.png", Buffer.from(screenshot.data, "base64"));
console.log(JSON.stringify({ galleryReady: ready, errors }));
await call("Page.navigate", { url: "http://127.0.0.1:8080/index.html" });
let booted = false;
for (let attempt = 0; attempt < 100; attempt++) {
  const result = await call("Runtime.evaluate", {
    expression: "Boolean(window.HD?.world?.renderer && window.HD?.state?.horses?.length)", returnByValue: true,
  });
  if (result.result?.value) { booted = true; break; }
  await new Promise((resolve) => setTimeout(resolve, 300));
}
const state = await call("Runtime.evaluate", {
  expression: `JSON.stringify({
    renderer: Boolean(window.HD?.world?.renderer),
    horses: window.HD?.state?.horses?.length,
    importedHotdog: window.HD?.Models?.throwable('hotdog')?.userData?.importedModel,
    assetFailures: [...(window.HD?.Assets?.failures || [])]
  })`, returnByValue: true,
});
console.log(JSON.stringify({ game: state.result?.value, errors }));
const typing = await call("Runtime.evaluate", {
  expression: `(() => {
    const input = document.createElement('textarea');
    document.body.append(input);
    input.focus();
    const before = HD.state.mode;
    for (const code of ['ShiftLeft', 'KeyF', 'KeyR', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Digit1']) {
      input.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
    }
    const safe = HD.state.mode === before && !HD.state.charging &&
      Object.values(HD.state.movement).every(value => !value);
    input.remove();
    return safe;
  })()`, returnByValue: true,
});
console.log(JSON.stringify({ typingDoesNotTriggerGameplay: typing.result?.value }));
await call("Page.close");
socket.close();
if (errors.length || !typing.result?.value || !state.result?.value?.includes('"importedHotdog":"hotdog"')) process.exitCode = 1;
