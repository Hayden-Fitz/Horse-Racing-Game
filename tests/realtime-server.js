"use strict";

const assert = require("assert");
const http = require("http");
const { WebSocket } = require("ws");
const { createRealtimeServer } = require("../server/realtime-server");

class TestClient {
  constructor(url, clientId) {
    this.socket = new WebSocket(`${url}/api/socket?clientId=${clientId}`);
    this.pending = new Map();
    this.updates = [];
    this.sequence = 0;
    this.ready = new Promise((resolve, reject) => {
      this.socket.once("open", resolve);
      this.socket.once("error", reject);
    });
    this.socket.on("message", (raw) => this.receive(raw));
  }

  receive(raw) {
    const message = JSON.parse(raw.toString());
    if (message.type === "response") {
      const operation = this.pending.get(message.id);
      if (!operation) return;
      this.pending.delete(message.id);
      if (message.ok) operation.resolve(message.data);
      else operation.reject(Object.assign(new Error(message.error), {
        status: message.status,
      }));
      return;
    }
    if (message.type === "update") this.updates.push(message);
  }

  async rpc(path, method = "GET", body) {
    await this.ready;
    return new Promise((resolve, reject) => {
      const id = `${++this.sequence}`;
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({
        type: "request",
        id,
        path,
        method,
        body,
      }));
    });
  }

  async subscribe(path) {
    await this.ready;
    this.socket.send(JSON.stringify({ type: "subscribe", path }));
  }

  close() {
    this.socket.close();
  }
}

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
  const socketUrl = `ws://127.0.0.1:${port}`;
  const httpUrl = `http://127.0.0.1:${port}`;

  const host = new TestClient(socketUrl, "host");
  const guest = new TestClient(socketUrl, "guest");
  const rival = new TestClient(socketUrl, "rival");
  let reconnected = null;
  let ninth = null;
  const extraClients = [];

  try {
    await Promise.all([host.ready, guest.ready, rival.ready]);
    const health = await fetch(`${httpUrl}/api/health`).then((result) => result.json());
    assert.equal(health.ok, true);
    assert.equal(health.connections, 3);

    const now = Date.now();
    await host.rpc("lobbies/ABC234", "PUT", {
      meta: {
        id: "ABC234",
        name: "Test Race",
        hostId: "host",
        capacity: 8,
        visibility: "public",
        started: false,
        createdAt: now,
        updatedAt: now,
      },
      players: {
        host: player("host", 0, now),
      },
      seats: { 0: "host" },
    });

    await host.subscribe("lobbies/ABC234");
    await delay(20);
    assert.equal(host.updates.at(-1).data.meta.name, "Test Race");

    const claims = await Promise.all([
      guest.rpc("lobbies/ABC234/seats/1", "RESERVE", "guest"),
      rival.rpc("lobbies/ABC234/seats/1", "RESERVE", "rival"),
    ]);
    assert.equal(claims.filter((result) => result.reserved).length, 1);

    const winner = claims[0].reserved ? guest : rival;
    const winnerId = claims[0].reserved ? "guest" : "rival";
    const loser = claims[0].reserved ? rival : guest;
    const loserId = claims[0].reserved ? "rival" : "guest";
    assert.equal((await loser.rpc(
      "lobbies/ABC234/seats/2",
      "RESERVE",
      loserId,
    )).reserved, true);

    await winner.rpc(
      `lobbies/ABC234/players/${winnerId}`,
      "PUT",
      player(winnerId, 1, now),
    );
    await loser.rpc(
      `lobbies/ABC234/players/${loserId}`,
      "PUT",
      player(loserId, 2, now),
    );
    await winner.rpc("lobbies/ABC234/meta/updatedAt", "PUT", now + 1);

    const transfer = {
      from: winnerId,
      to: "host",
      money: 25,
      itemId: "hotdog",
      fromName: winnerId,
      createdAt: now + 2,
    };
    await winner.rpc("lobbies/ABC234/transfers/payment_12345678", "PUT", transfer);
    await assert.rejects(
      winner.rpc("lobbies/ABC234/transfers/payment_12345678", "PUT", transfer),
      (error) => error.status === 409,
    );
    await assert.rejects(
      winner.rpc("lobbies/ABC234/events", "POST", {
        type: "transfer",
        from: winnerId,
        createdAt: now + 3,
        payload: { to: "host", money: 500 },
      }),
      (error) => error.status === 403,
    );
    await assert.rejects(
      winner.rpc("lobbies/ABC234/transfers/forged_12345678", "PUT", {
        ...transfer,
        from: "host",
      }),
      (error) => error.status === 403,
    );

    await host.rpc("lobbies/ABC234/meta", "PATCH", {
      rules: {
        days: 99,
        racesPerDay: 0,
        horses: 20,
        laps: -2,
        startingMoney: 9_999,
        crowd: "invalid",
      },
    });
    const normalizedRules = await host.rpc("lobbies/ABC234/meta/rules");
    assert.deepEqual(normalizedRules, {
      days: 10,
      racesPerDay: 1,
      horses: 8,
      laps: 1,
      startingMoney: 1000,
      crowd: "normal",
    });

    await assert.rejects(
      winner.rpc("lobbies/ABC234/meta", "PATCH", { started: true }),
      (error) => error.status === 403,
    );

    // Fill every seat with a distinct WebSocket client and enforce the loading barrier.
    for (let seat = 3; seat < 8; seat++) {
      const id = "extra" + seat;
      const client = new TestClient(socketUrl, id);
      extraClients.push(client);
      await client.ready;
      assert.equal((await client.rpc("lobbies/ABC234/seats/" + seat, "RESERVE", id)).reserved, true);
      await client.rpc("lobbies/ABC234/players/" + id, "PUT", {
        ...player(id, seat, now),
        ready: true,
      });
    }
    await host.rpc("lobbies/ABC234/players/host/ready", "PUT", true);
    await winner.rpc("lobbies/ABC234/players/" + winnerId + "/ready", "PUT", true);
    await loser.rpc("lobbies/ABC234/players/" + loserId + "/ready", "PUT", true);
    const fullLobby = await host.rpc("lobbies/ABC234");
    assert.equal(Object.keys(fullLobby.players).length, 8);
    assert.equal(new Set(Object.values(fullLobby.players).map((entry) => entry.seatIndex)).size, 8);

    ninth = new TestClient(socketUrl, "ninth");
    await ninth.ready;
    await assert.rejects(
      ninth.rpc("lobbies/ABC234/seats/7", "RESERVE", "ninth"),
      (error) => error.status === 409,
    );
    await assert.rejects(
      ninth.rpc("lobbies/ABC234/players/ninth", "PUT", player("ninth", 7, now)),
      (error) => error.status === 409,
    );

    const loadingId = Date.now();
    await host.rpc("lobbies/ABC234/meta", "PATCH", { loadingId, started: false });
    await assert.rejects(
      host.rpc("lobbies/ABC234/meta", "PATCH", { started: true, matchId: loadingId }),
      (error) => error.status === 409,
    );
    await assert.rejects(
      ninth.rpc("lobbies/ABC234/seats/6", "RESERVE", "ninth"),
      (error) => error.status === 409,
    );
    const roster = [
      ["host", host], [winnerId, winner], [loserId, loser],
      ...extraClients.map((client, index) => ["extra" + (index + 3), client]),
    ];
    for (const [id, client] of roster.slice(0, -1)) {
      await client.rpc("lobbies/ABC234/players/" + id + "/loadReadyFor", "PUT", loadingId);
    }
    await assert.rejects(
      host.rpc("lobbies/ABC234/meta", "PATCH", { started: true, matchId: loadingId }),
      (error) => error.status === 409,
    );
    const [lastId, lastClient] = roster.at(-1);
    await lastClient.rpc("lobbies/ABC234/players/" + lastId + "/loadReadyFor", "PUT", loadingId);
    await host.rpc("lobbies/ABC234/meta", "PATCH", {
      started: true, loadingId: null, matchId: loadingId,
    });
    assert.equal((await host.rpc("lobbies/ABC234/meta")).started, true);

    await winner.rpc(
      `lobbies/ABC234/players/${winnerId}`,
      "PATCH",
      { x: 12, z: -4, sequence: 2, lastSeen: now + 2 },
    );
    await delay(20);
    assert(host.updates.some((update) =>
      update.path === `/players/${winnerId}` && update.eventType === "patch"));

    const publicLobbies = await guest.rpc("lobbies");
    assert(publicLobbies.ABC234);
    await host.rpc("lobbies/ABC234/meta", "PATCH", { visibility: "private" });
    const privateFiltered = await guest.rpc("lobbies");
    assert.equal(privateFiltered.ABC234, undefined);

    winner.close();
    await delay(30);
    reconnected = new TestClient(socketUrl, winnerId);
    await reconnected.ready;
    await reconnected.subscribe("lobbies/ABC234");
    await reconnected.rpc(
      `lobbies/ABC234/players/${winnerId}`,
      "PATCH",
      { lastSeen: Date.now(), state: { x: 18, z: 7 } },
    );
    await delay(20);
    assert.equal(reconnected.updates.at(-1).data.state.x, 18);

    console.log(
      "Realtime eight seats, loading barrier, authority, streams, privacy, transfers, and reconnect passed.",
    );
  } finally {
    host.close();
    guest.close();
    rival.close();
    reconnected?.close();
    ninth?.close();
    extraClients.forEach((client) => client.close());
    realtime.close();
    await new Promise((resolve) => httpServer.close(resolve));
  }
}

function player(id, seatIndex, now) {
  return {
    id,
    name: id,
    seatIndex,
    ready: false,
    joinedAt: now,
    lastSeen: now,
  };
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
