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
  console.log("Cloudflare Durable Object persistence passed.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
