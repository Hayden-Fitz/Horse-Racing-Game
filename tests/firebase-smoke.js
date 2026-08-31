"use strict";

const assert = require("assert");

const ROOT =
  "https://horseracegame-622fd-default-rtdb.firebaseio.com/hotdogDowns/diagnostics";
const testId = `smoke_${Date.now()}_${Math.random().toString(16).slice(2)}`;
const testUrl = `${ROOT}/${testId}.json`;
const reservationUrl = `${ROOT}/${testId}_reservation.json`;

async function request(method, body) {
  const response = await fetch(testUrl, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  assert.equal(response.ok, true, `${method} failed with HTTP ${response.status}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function run() {
  try {
    await request("PUT", {
      createdAt: Date.now(),
      lobby: "FIREBASE",
      movement: { x: 4, y: 2, z: 8 },
    });

    const created = await request("GET");
    assert.equal(created.lobby, "FIREBASE");
    assert.equal(created.movement.z, 8);

    const streamCheck = waitForRealtimeUpdate(() => request("PATCH", { ready: true }));
    await streamCheck;

    const updated = await request("GET");
    assert.equal(updated.ready, true);

    await verifyConditionalReservation();

    console.log("Firebase CRUD, realtime stream, and seat reservation checks passed.");
  } finally {
    await request("DELETE").catch(() => {});
    await fetch(reservationUrl, { method: "DELETE" }).catch(() => {});
  }
}

async function verifyConditionalReservation() {
  const current = await fetch(reservationUrl, {
    headers: { "X-Firebase-ETag": "true" },
  });
  assert.equal(current.ok, true);
  assert.equal(await current.json(), null);

  const etag = current.headers.get("etag");
  assert.ok(etag, "Firebase did not provide an ETag");

  const contender = (name) => fetch(reservationUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "If-Match": etag,
    },
    body: JSON.stringify(name),
  });
  const results = await Promise.all([contender("player-one"), contender("player-two")]);
  const statuses = results.map((response) => response.status).sort();
  assert.deepEqual(statuses, [200, 412]);
}

async function waitForRealtimeUpdate(triggerUpdate) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  try {
    const response = await fetch(testUrl, {
      headers: { Accept: "text/event-stream" },
      signal: controller.signal,
    });
    assert.equal(response.ok, true, `Realtime stream failed with HTTP ${response.status}`);

    await triggerUpdate();

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;

      buffer += decoder.decode(chunk.value, { stream: true });
      const records = buffer.split("\n\n");
      buffer = records.pop() || "";

      for (const record of records) {
        const dataLine = record.split("\n").find((line) => line.startsWith("data: "));
        if (!dataLine) continue;

        const update = JSON.parse(dataLine.slice(6));
        const readyAtRoot = update.path === "/" && update.data?.ready === true;
        const readyAtPath = update.path === "/ready" && update.data === true;
        if (readyAtRoot || readyAtPath) {
          await reader.cancel();
          return;
        }
      }
    }

    throw new Error("Firebase stream ended before the update arrived.");
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
