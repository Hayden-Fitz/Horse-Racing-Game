"use strict";

const assert = require("assert");
const fs = require("fs");
const http = require("http");
const path = require("path");
const vm = require("vm");
const { WebSocket } = require("ws");
const { createRealtimeServer } = require("../server/realtime-server");

async function run() {
  const httpServer = http.createServer((request, response) => {
    const url = new URL(request.url, "http://localhost");
    realtime.handleHttp(request, response, url).then((handled) => {
      if (!handled) {
        response.writeHead(404);
        response.end();
      }
    });
  });
  const realtime = createRealtimeServer(httpServer);
  await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const { port } = httpServer.address();
  const origin = `http://127.0.0.1:${port}`;
  const client = loadBrowserClient(origin);

  try {
    client.setIdentity("browser-host");
    const now = Date.now();
    await client.request("lobbies/DEF567", {
      method: "PUT",
      body: {
        meta: {
          id: "DEF567",
          name: "Browser Adapter",
          hostId: "browser-host",
          capacity: 8,
          visibility: "public",
          started: false,
          createdAt: now,
          updatedAt: now,
        },
        players: {
          "browser-host": player(now),
        },
        seats: { 0: "browser-host" },
      },
    });

    const updates = [];
    const stream = client.subscribe("lobbies/DEF567", {
      update: (event) => updates.push({
        type: event.type,
        ...JSON.parse(event.data),
      }),
    });
    await waitFor(() => updates.length === 1);
    assert.equal(updates[0].path, "/");
    assert.equal(updates[0].data.meta.name, "Browser Adapter");

    await client.request("lobbies/DEF567/meta", {
      method: "PATCH",
      body: { started: true },
    });
    await waitFor(() => updates.some((update) => update.path === "/meta"));
    const metaUpdate = updates.find((update) => update.path === "/meta");
    assert.equal(metaUpdate.type, "patch");
    assert.equal(metaUpdate.data.started, true);
    assert.equal(updates.filter((update) => update.path === "/").length, 1);

    stream.close();
    console.log("Browser realtime adapter request, subscription, and cleanup passed.");
  } finally {
    client.disconnect();
    realtime.close();
    await new Promise((resolve) => httpServer.close(resolve));
  }
  const offline = loadBrowserClient(origin);
  offline.setIdentity('offline-client');
  try {
    await assert.rejects(Promise.race([
      offline.request('lobbies'),
      new Promise((_, reject) => {
        const timer = setTimeout(() => reject(new Error('Connection promise hung')), 1500);
        timer.unref();
      }),
    ]), /Could not reach the multiplayer server/);
  } finally {
    offline.disconnect();
  }
}

function loadBrowserClient(origin) {
  const source = fs.readFileSync(
    path.join(__dirname, "../src/realtime.js"),
    "utf8",
  );
  const context = {
    HD: {},
    WebSocket,
    fetch,
    location: { origin },
    localStorage: { getItem: () => null },
    setTimeout,
    clearTimeout,
    console,
  };
  context.window = context;
  vm.runInNewContext(source, context, { filename: "src/realtime.js" });
  return context.HD.Realtime;
}

function player(now) {
  return {
    id: "browser-host",
    name: "Browser Host",
    seatIndex: 0,
    ready: false,
    joinedAt: now,
    lastSeen: now,
  };
}

async function waitFor(predicate, timeoutMs = 1_000) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error("Timed out waiting for browser adapter update.");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
