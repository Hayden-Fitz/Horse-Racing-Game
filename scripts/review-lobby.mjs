import fs from "node:fs/promises";

const debugPort = process.argv[2] || "9360";
const gamePort = process.argv[3] || "8124";
const endpoint = `http://127.0.0.1:${debugPort}`;
const page = await fetch(`${endpoint}/json/new?about:blank`, {
  method: "PUT",
}).then((response) => response.json());
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve) => socket.addEventListener("open", resolve, { once: true }));

let sequence = 0;
const pending = new Map();
const errors = [];

socket.addEventListener("message", ({ data }) => {
  const message = JSON.parse(data);
  if (message.method === "Runtime.exceptionThrown") {
    errors.push(message.params.exceptionDetails.text || "Runtime exception");
  }
  if (!message.id) return;
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  if (message.error) request.reject(new Error(JSON.stringify(message.error)));
  else request.resolve(message.result);
});

function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await call("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}

async function waitFor(expression, timeout = 20_000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${expression}`);
}

async function screenshot(file) {
  const result = await call("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  await fs.mkdir("artifacts", { recursive: true });
  await fs.writeFile(`artifacts/${file}`, Buffer.from(result.data, "base64"));
}

try {
  await call("Runtime.enable");
  await call("Page.enable");
  await call("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await call("Page.navigate", {
    url: `http://127.0.0.1:${gamePort}/index.html`,
  });
  await waitFor("Boolean(window.HD?.Network && document.querySelector('#lobby-create'))");
  await evaluate("document.querySelector('#lobby-create').click(); true");
  await waitFor("!document.querySelector('#lobby-room').hidden");
  await screenshot("lobby-rules-card.png");
  await evaluate("document.querySelector('#lobby-rules').click(); true");
  await waitFor("document.querySelector('#practice-setup').open");
  await screenshot("lobby-rules-dialog.png");
  const layout = await evaluate(`(() => {
    const dialog = document.querySelector('#practice-setup');
    const card = document.querySelector('.lobby-rules-card');
    const viewport = { width: innerWidth, height: innerHeight };
    const rect = dialog.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    return {
      viewport,
      dialog: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      card: { x: cardRect.x, y: cardRect.y, width: cardRect.width, height: cardRect.height },
      dialogFits: rect.x >= 0 && rect.y >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight,
      cardFits: cardRect.x >= 0 && cardRect.right <= innerWidth,
    };
  })()`);
  layout.errors = errors;
  console.log(JSON.stringify(layout, null, 2));
  if (!layout.dialogFits || !layout.cardFits || layout.errors.length) process.exitCode = 1;
} finally {
  socket.close();
}
