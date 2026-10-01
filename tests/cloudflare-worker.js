"use strict";

const assert = require("assert");

async function run() {
  const { LobbyServer } = await import("../cloudflare/src/worker.mjs");
  let snapshot;
  const storage = {
    async get(key) {
      return key === "state" ? snapshot : undefined;
    },
    async put(key, value) {
      if (key === "state") snapshot = structuredClone(value);
    },
  };
  const context = { storage };
  const host = new LobbyServer(context);
  const lobby = {
    meta: {
      hostId: "host",
      capacity: 8,
      visibility: "public",
      updatedAt: Date.now(),
    },
    players: {
      host: {
        id: "host",
        name: "Host",
        seatIndex: 0,
        lastSeen: Date.now(),
      },
    },
    seats: { 0: "host" },
  };
  const createResponse = await host.fetch(new Request(
    "https://example.test/api/data/lobbies/ABC234",
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Hotdog-Client": "host",
      },
      body: JSON.stringify(lobby),
    },
  ));
  assert.equal(createResponse.status, 200);
  assert(snapshot?.lobbies?.ABC234, "lobby should be persisted after creation");

  const reconstructed = new LobbyServer(context);
  const readResponse = await reconstructed.fetch(new Request(
    "https://example.test/api/data/lobbies/ABC234",
  ));
  assert.equal(readResponse.status, 200);
  const restored = await readResponse.json();
  assert.equal(restored.meta.hostId, "host");
  assert.equal(restored.players.host.id, "host");
  const write = (actor, path, method, body) => reconstructed.fetch(new Request(
    "https://example.test/api/data/" + path,
    {
      method,
      headers: { "Content-Type": "application/json", "X-Hotdog-Client": actor },
      body: JSON.stringify(body),
    },
  ));
  assert.equal((await write("guest", "lobbies/ABC234/seats/1", "RESERVE", "guest")).status, 200);
  assert.equal((await write("guest", "lobbies/ABC234/players/guest", "PUT", {
    id: "guest", name: "Guest", seatIndex: 1, ready: true, lastSeen: Date.now(),
  })).status, 200);
  assert.equal((await write("host", "lobbies/ABC234/players/host/ready", "PUT", true)).status, 200);
  const loadingId = Date.now();
  assert.equal((await write("host", "lobbies/ABC234/meta", "PATCH", {
    loadingId, started: false,
  })).status, 200);
  assert.equal((await write("host", "lobbies/ABC234/meta", "PATCH", {
    started: true, matchId: loadingId,
  })).status, 409);
  assert.equal((await write("guest", "lobbies/ABC234/players/guest/loadReadyFor", "PUT", loadingId)).status, 200);
  assert.equal((await write("host", "lobbies/ABC234/players/host/loadReadyFor", "PUT", loadingId)).status, 200);
  assert.equal((await write("host", "lobbies/ABC234/meta", "PATCH", {
    started: true, loadingId: null, matchId: loadingId,
  })).status, 200);
  assert.equal((await write("third", "lobbies/ABC234/seats/2", "RESERVE", "third")).status, 409);
  console.log("Cloudflare persistence and all-player loading barrier passed.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
