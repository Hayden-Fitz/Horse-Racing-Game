"use strict";

const crypto = require("crypto");
const { WebSocketServer, WebSocket } = require("ws");

const MAX_BODY_BYTES = 256 * 1024;
const STALE_PLAYER_MS = 30_000;
const LOBBY_CODE = /^[A-HJ-NP-Z2-9]{6}$/;
const TRANSFER_ID = /^[a-zA-Z0-9_-]{8,64}$/;
const TRANSFER_ITEMS = new Set([
  "hotdog", "goldenHotdog", "soda", "horseshoe", "carrot",
  "goldenCarrot", "hurdle", "waterBottle", "beachBall", "chair",
]);

function createRealtimeServer(server) {
  const state = { lobbies: {} };
  const sockets = new Set();
  const websocketServer = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_BODY_BYTES,
  });

  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url, "http://localhost");
    if (url.pathname !== "/api/socket") return socket.destroy();
    websocketServer.handleUpgrade(request, socket, head, (websocket) => {
      websocketServer.emit("connection", websocket, request);
    });
  });

  websocketServer.on("connection", (socket, request) => {
    const url = new URL(request.url, "http://localhost");
    socket.clientId = cleanClientId(url.searchParams.get("clientId"));
    socket.subscriptions = new Set();
    socket.alive = true;
    socket.rateWindow = Date.now();
    socket.messagesInWindow = 0;
    sockets.add(socket);
    socket.on("pong", () => { socket.alive = true; });
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => {});
    socket.on("message", (raw) => receiveSocketMessage(socket, raw));
    send(socket, { type: "hello", now: Date.now() });
  });

  const heartbeat = setInterval(() => {
    for (const socket of sockets) {
      if (!socket.alive) {
        socket.terminate();
        continue;
      }
      socket.alive = false;
      socket.ping();
    }
    maintainState();
  }, 10_000);
  heartbeat.unref?.();

  async function handleHttp(request, response, url) {
    addCors(response);
    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return true;
    }
    if (url.pathname === "/api/health") {
      sendJson(response, 200, {
        ok: true,
        transport: "hotdog-realtime",
        lobbies: Object.keys(state.lobbies).length,
        connections: sockets.size,
      });
      return true;
    }
    const prefix = "/api/data/";
    if (!url.pathname.startsWith(prefix)) return false;
    const path = decodeURIComponent(url.pathname.slice(prefix.length));
    try {
      const body = ["PUT", "PATCH", "POST", "RESERVE"].includes(request.method)
        ? await readJson(request)
        : undefined;
      const result = mutate(
        path,
        request.method,
        body,
        cleanClientId(request.headers["x-hotdog-client"]),
      );
      sendJson(response, result.status, result.data);
    } catch (error) {
      sendJson(response, error.status || 400, { error: error.message });
    }
    return true;
  }

  function receiveSocketMessage(socket, raw) {
    let message;
    try {
      if (!withinRateLimit(socket)) {
        throw httpError(429, "Too many realtime messages.");
      }
      if (raw.length > MAX_BODY_BYTES) throw httpError(413, "Message is too large.");
      message = JSON.parse(raw.toString());
      if (message.type === "subscribe") {
        const path = normalizePath(message.path);
        socket.subscriptions.add(path);
        send(socket, {
          type: "update",
          subscription: path,
          eventType: "put",
          path: "/",
          data: read(path),
        });
        return;
      }
      if (message.type === "unsubscribe") {
        socket.subscriptions.delete(normalizePath(message.path));
        return;
      }
      if (message.type !== "request" || !message.id) return;
      const result = mutate(message.path, message.method, message.body, socket.clientId);
      send(socket, { type: "response", id: message.id, ok: true, data: result.data });
    } catch (error) {
      if (message?.id) {
        send(socket, {
          type: "response",
          id: message.id,
          ok: false,
          status: error.status || 400,
          error: error.message,
        });
      }
    }
  }

  function mutate(rawPath, rawMethod = "GET", body, actor) {
    const path = normalizePath(rawPath);
    const method = String(rawMethod || "GET").toUpperCase();
    if (method === "GET") return { status: 200, data: read(path) };
    if (!actor) throw httpError(401, "Missing client identity.");

    if (method === "RESERVE") {
      authorize(path, method, body, actor);
      if (getAt(path) !== undefined) {
        return { status: 409, data: { reserved: false } };
      }
      setAt(path, body);
      broadcast(path, "put", body);
      return { status: 200, data: { reserved: true } };
    }

    authorize(path, method, body, actor);
    body = normalizeRuleWrite(path, method, body);
    if (method === "PUT" && path.split("/")[2] === "transfers" &&
        getAt(path) !== undefined) {
      throw httpError(409, "That transfer was already processed.");
    }
    if (method === "POST") {
      const key = Date.now().toString(36) + "_" +
        crypto.randomBytes(4).toString("hex");
      const childPath = path + "/" + key;
      setAt(childPath, body);
      broadcast(childPath, "put", body);
      return { status: 201, data: { name: key } };
    }
    if (method === "DELETE") {
      deleteAt(path);
      broadcast(path, "put", null);
      return { status: 200, data: null };
    }
    if (method === "PATCH") {
      const current = getAt(path);
      const next = isRecord(current) && isRecord(body)
        ? { ...current, ...body }
        : body;
      setAt(path, next);
      broadcast(path, "patch", body);
      return { status: 200, data: next };
    }
    if (method === "PUT") {
      setAt(path, body);
      broadcast(path, "put", body);
      return { status: 200, data: body };
    }
    throw httpError(405, "Method not allowed.");
  }

  function authorize(path, method, body, actor) {
    const parts = path.split("/");
    if (parts[0] !== "lobbies" || !LOBBY_CODE.test(parts[1] || "")) {
      throw httpError(403, "Invalid lobby path.");
    }
    const lobby = state.lobbies[parts[1]];
    if (parts.length === 2 && method === "PUT" && !lobby) {
      const valid = body?.meta?.hostId === actor &&
        body?.players?.[actor]?.id === actor &&
        String(body?.seats?.[0]) === actor &&
        Number(body?.meta?.capacity) === 8;
      if (!valid) throw httpError(403, "Invalid lobby creation request.");
      return;
    }
    if (!lobby) throw httpError(404, "That lobby does not exist.");
    const isHost = lobby.meta?.hostId === actor;
    const isMember = Boolean(lobby.players?.[actor]);

    if (parts.length === 2) {
      if (method === "DELETE" && isHost) return;
      throw httpError(403, "Only the host can remove a lobby.");
    }
    if (parts[2] === "players") {
      if (parts[3] === actor || isHost) return;
      throw httpError(403, "Players may only update their own presence.");
    }
    if (parts[2] === "seats") {
      if (method === "RESERVE") {
        const seat = Number(parts[3]);
        const seated = Object.values(lobby.seats || {}).includes(actor);
        const full = Object.keys(lobby.players || {}).length >= 8;
        if (!Number.isInteger(seat) || seat < 0 || seat > 7 ||
            seated || full || lobby.meta?.started) {
          throw httpError(409, "That seat is unavailable.");
        }
        return;
      }
      if (isHost || getAt(path) === actor) return;
      throw httpError(403, "Players may only release their own seat.");
    }
    if (parts[2] === "events") {
      if (method === "POST" && isMember && body?.from === actor &&
          body?.type !== "transfer") return;
      if (method === "DELETE" && isHost) return;
      throw httpError(403, "Invalid lobby event.");
    }
    if (parts[2] === "transfers") {
      const transferId = parts[3] || "";
      const recipient = lobby.players?.[body?.to];
      const amount = Number(body?.money);
      const itemId = String(body?.itemId || "");
      const createdAt = Number(body?.createdAt);
      const fromName = String(body?.fromName || "");
      const valid = method === "PUT" && parts.length === 4 && isMember &&
        TRANSFER_ID.test(transferId) && body?.from === actor && recipient &&
        body.to !== actor && Number.isInteger(amount) && amount >= 0 &&
        amount <= 1_000 && (!itemId || TRANSFER_ITEMS.has(itemId)) &&
        (amount > 0 || Boolean(itemId)) && Number.isFinite(createdAt) &&
        Math.abs(Date.now() - createdAt) <= 60_000 && fromName.length <= 28;
      if (valid) return;
      throw httpError(403, "Invalid DerbyPay transfer.");
    }
    if (parts[2] === "meta" && parts[3] === "updatedAt" && isMember) return;
    if (parts[2] === "race" || parts[2] === "meta") {
      if (isHost) return;
      throw httpError(403, "Only the host can change authoritative match state.");
    }
    throw httpError(403, "Unsupported lobby mutation.");
  }

  function read(path) {
    const value = getAt(path);
    if (path === "lobbies") {
      const publicLobbies = {};
      for (const [code, lobby] of Object.entries(value || {})) {
        if (lobby.meta?.visibility !== "private") publicLobbies[code] = lobby;
      }
      return clone(publicLobbies);
    }
    return value === undefined ? null : clone(value);
  }

  function broadcast(changedPath, eventType, data) {
    for (const socket of sockets) {
      for (const subscribedPath of socket.subscriptions) {
        if (changedPath !== subscribedPath &&
            !changedPath.startsWith(subscribedPath + "/")) continue;
        const relative = changedPath === subscribedPath
          ? "/"
          : "/" + changedPath.slice(subscribedPath.length + 1);
        send(socket, {
          type: "update",
          subscription: subscribedPath,
          eventType,
          path: relative,
          data,
        });
      }
    }
  }

  function maintainState() {
    const now = Date.now();
    for (const [code, lobby] of Object.entries(state.lobbies)) {
      for (const [playerId, player] of Object.entries(lobby.players || {})) {
        if (now - Number(player.lastSeen || 0) <= STALE_PLAYER_MS) continue;
        delete lobby.players[playerId];
        if (lobby.seats?.[player.seatIndex] === playerId) {
          delete lobby.seats[player.seatIndex];
        }
      }
      for (const [seatIndex, playerId] of Object.entries(lobby.seats || {})) {
        if (!lobby.players?.[playerId]) delete lobby.seats[seatIndex];
      }
      const players = Object.values(lobby.players || {}).sort((a, b) =>
        Number(a.seatIndex) - Number(b.seatIndex));
      if (!players.length &&
          now - Number(lobby.meta?.updatedAt || 0) > 60_000) {
        delete state.lobbies[code];
        broadcast("lobbies/" + code, "put", null);
        continue;
      }
      if (players.length && !lobby.players[lobby.meta?.hostId]) {
        lobby.meta.hostId = players[0].id;
        broadcast(
          "lobbies/" + code + "/meta",
          "patch",
          { hostId: players[0].id },
        );
      }
      for (const [eventId, event] of Object.entries(lobby.events || {})) {
        if (now - Number(event.createdAt || 0) > 30_000) {
          delete lobby.events[eventId];
        }
      }
      for (const [transferId, transfer] of Object.entries(lobby.transfers || {})) {
        if (now - Number(transfer.createdAt || 0) > 30_000) {
          delete lobby.transfers[transferId];
        }
      }
    }
  }

  function getAt(path) {
    let current = state;
    for (const part of path.split("/")) {
      if (!isRecord(current) || !Object.hasOwn(current, part)) return undefined;
      current = current[part];
    }
    return current;
  }

  function setAt(path, value) {
    const parts = path.split("/");
    let parent = state;
    for (const part of parts.slice(0, -1)) {
      if (!isRecord(parent[part])) parent[part] = {};
      parent = parent[part];
    }
    parent[parts.at(-1)] = clone(value);
  }

  function deleteAt(path) {
    const parts = path.split("/");
    let parent = state;
    for (const part of parts.slice(0, -1)) {
      if (!isRecord(parent?.[part])) return;
      parent = parent[part];
    }
    delete parent[parts.at(-1)];
  }

  return { handleHttp, close: () => websocketServer.close(), state };
}

function withinRateLimit(socket) {
  const now = Date.now();
  if (now - socket.rateWindow >= 1_000) {
    socket.rateWindow = now;
    socket.messagesInWindow = 0;
  }
  socket.messagesInWindow++;
  return socket.messagesInWindow <= 90;
}

function normalizePath(path) {
  const parts = String(path || "").split("/").filter(Boolean);
  if (!parts.length || parts.some((part) =>
    part === "__proto__" || part === "prototype" || part === "constructor")) {
    throw httpError(400, "Invalid data path.");
  }
  return parts.join("/");
}

function cleanClientId(value) {
  const id = String(value || "")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 64);
  return id || null;
}

function normalizeRuleWrite(path, method, body) {
  if (!isRecord(body) || !["PUT", "PATCH"].includes(method)) return body;
  const parts = path.split("/");
  if (parts.length === 2 && isRecord(body.meta)) {
    return {
      ...body,
      meta: {
        ...body.meta,
        rules: normalizeRules(body.meta.rules),
      },
    };
  }
  if (parts[2] === "meta" && parts.length === 3 && body.rules) {
    return { ...body, rules: normalizeRules(body.rules) };
  }
  return body;
}

function normalizeRules(input = {}) {
  const integer = (value, minimum, maximum, fallback) => {
    const number = Number(value);
    return Number.isFinite(number)
      ? Math.min(maximum, Math.max(minimum, Math.round(number)))
      : fallback;
  };
  const crowds = new Set(["off", "relaxed", "normal", "lively"]);
  return {
    days: integer(input.days, 1, 10, 3),
    racesPerDay: integer(input.racesPerDay, 1, 6, 2),
    horses: integer(input.horses, 4, 8, 6),
    laps: integer(input.laps, 1, 8, 3),
    startingMoney: integer(input.startingMoney, 100, 1000, 100),
    crowd: crowds.has(input.crowd) ? input.crowd : "normal",
  };
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function send(socket, message) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function addCors(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, X-Hotdog-Client",
  );
  response.setHeader(
    "Access-Control-Allow-Methods",
    "GET, PUT, PATCH, POST, DELETE, RESERVE, OPTIONS",
  );
}

function sendJson(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  response.end(body);
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let bytes = 0;
    const chunks = [];
    request.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        reject(httpError(413, "Request is too large."));
        request.destroy();
      } else {
        chunks.push(chunk);
      }
    });
    request.on("end", () => {
      try {
        resolve(chunks.length
          ? JSON.parse(Buffer.concat(chunks).toString())
          : null);
      } catch {
        reject(httpError(400, "Request body must be valid JSON."));
      }
    });
    request.on("error", reject);
  });
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

module.exports = { createRealtimeServer };
