const MAX_MESSAGE_BYTES = 256 * 1024;
const STALE_PLAYER_MS = 30_000;
const LOBBY_CODE = /^[A-HJ-NP-Z2-9]{6}$/;
const TRANSFER_ID = /^[a-zA-Z0-9_-]{8,64}$/;
const TRANSFER_ITEMS = new Set([
  "hotdog", "goldenHotdog", "soda", "horseshoe", "carrot",
  "goldenCarrot", "hurdle", "waterBottle", "beachBall", "chair",
]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return corsResponse(null, 204);
    if (!url.pathname.startsWith("/api/")) {
      return corsResponse({ error: "API route not found." }, 404);
    }

    const upgrade = request.headers.get("Upgrade");
    if (url.pathname === "/api/socket" && upgrade?.toLowerCase() !== "websocket") {
      return corsResponse({ error: "Expected a WebSocket upgrade." }, 426);
    }

    const lobbyServer = env.LOBBIES.getByName("global");
    const response = await lobbyServer.fetch(request);
    if (response.status === 101) return response;
    return withCors(response);
  },
};

export class LobbyServer {
  constructor(ctx) {
    this.ctx = ctx;
    this.state = { lobbies: {} };
    this.clients = new Map();
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/api/socket") return this.openSocket(url);
    if (url.pathname === "/api/health") {
      return jsonResponse({
        ok: true,
        transport: "hotdog-realtime-cloudflare",
        lobbies: Object.keys(this.state.lobbies).length,
        connections: this.clients.size,
      });
    }

    const prefix = "/api/data/";
    if (!url.pathname.startsWith(prefix)) {
      return jsonResponse({ error: "API route not found." }, 404);
    }

    try {
      this.maintainState();
      const body = ["PUT", "PATCH", "POST", "RESERVE"].includes(request.method)
        ? await request.json()
        : undefined;
      const path = decodeURIComponent(url.pathname.slice(prefix.length));
      const result = this.mutate(
        path,
        request.method,
        body,
        cleanClientId(request.headers.get("X-Hotdog-Client")),
      );
      return jsonResponse(result.data, result.status);
    } catch (error) {
      return jsonResponse({ error: error.message }, error.status || 400);
    }
  }

  openSocket(url) {
    const clientId = cleanClientId(url.searchParams.get("clientId"));
    if (!clientId) return jsonResponse({ error: "Missing client identity." }, 401);

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    this.clients.set(server, {
      clientId,
      subscriptions: new Set(),
      windowStartedAt: Date.now(),
      messagesInWindow: 0,
    });
    server.addEventListener("message", (event) => {
      this.receiveSocketMessage(server, event.data);
    });
    server.addEventListener("close", () => this.clients.delete(server));
    server.addEventListener("error", () => this.clients.delete(server));
    server.send(JSON.stringify({ type: "hello", now: Date.now() }));
    return new Response(null, { status: 101, webSocket: client });
  }

  receiveSocketMessage(socket, raw) {
    const client = this.clients.get(socket);
    if (!client || !this.withinRateLimit(client)) return;

    let message;
    try {
      const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
      if (text.length > MAX_MESSAGE_BYTES) throw httpError(413, "Message is too large.");
      message = JSON.parse(text);
      this.maintainState();

      if (message.type === "subscribe") {
        const path = normalizePath(message.path);
        client.subscriptions.add(path);
        this.send(socket, {
          type: "update",
          subscription: path,
          eventType: "put",
          path: "/",
          data: this.read(path),
        });
        return;
      }
      if (message.type === "unsubscribe") {
        client.subscriptions.delete(normalizePath(message.path));
        return;
      }
      if (message.type !== "request" || !message.id) return;

      const result = this.mutate(
        message.path,
        message.method,
        message.body,
        client.clientId,
      );
      this.send(socket, {
        type: "response",
        id: message.id,
        ok: true,
        data: result.data,
      });
    } catch (error) {
      if (!message?.id) return;
      this.send(socket, {
        type: "response",
        id: message.id,
        ok: false,
        status: error.status || 400,
        error: error.message,
      });
    }
  }

  withinRateLimit(client) {
    const now = Date.now();
    if (now - client.windowStartedAt >= 1_000) {
      client.windowStartedAt = now;
      client.messagesInWindow = 0;
    }
    client.messagesInWindow++;
    return client.messagesInWindow <= 90;
  }

  mutate(rawPath, rawMethod = "GET", body, actor) {
    const path = normalizePath(rawPath);
    const method = String(rawMethod || "GET").toUpperCase();
    if (method === "GET") return { status: 200, data: this.read(path) };
    if (!actor) throw httpError(401, "Missing client identity.");

    if (method === "RESERVE") {
      this.authorize(path, method, body, actor);
      if (this.getAt(path) !== undefined) {
        return { status: 409, data: { reserved: false } };
      }
      this.setAt(path, body);
      this.broadcast(path, "put", body);
      return { status: 200, data: { reserved: true } };
    }

    this.authorize(path, method, body, actor);
    body = normalizeRuleWrite(path, method, body);
    if (method === "PUT" && path.split("/")[2] === "transfers" &&
        this.getAt(path) !== undefined) {
      throw httpError(409, "That transfer was already processed.");
    }
    if (method === "POST") {
      const key = `${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
      const childPath = `${path}/${key}`;
      this.setAt(childPath, body);
      this.broadcast(childPath, "put", body);
      return { status: 201, data: { name: key } };
    }
    if (method === "DELETE") {
      this.deleteAt(path);
      this.broadcast(path, "put", null);
      return { status: 200, data: null };
    }
    if (method === "PATCH") {
      const current = this.getAt(path);
      const next = isRecord(current) && isRecord(body)
        ? { ...current, ...body }
        : body;
      this.setAt(path, next);
      this.broadcast(path, "patch", body);
      return { status: 200, data: next };
    }
    if (method === "PUT") {
      this.setAt(path, body);
      this.broadcast(path, "put", body);
      return { status: 200, data: body };
    }
    throw httpError(405, "Method not allowed.");
  }

  authorize(path, method, body, actor) {
    const parts = path.split("/");
    if (parts[0] !== "lobbies" || !LOBBY_CODE.test(parts[1] || "")) {
      throw httpError(403, "Invalid lobby path.");
    }
    const lobby = this.state.lobbies[parts[1]];
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
      if (isHost || this.getAt(path) === actor) return;
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
    if ((parts[2] === "race" || parts[2] === "meta") && isHost) return;
    throw httpError(403, "Only the host can change authoritative match state.");
  }

  read(path) {
    const value = this.getAt(path);
    if (path === "lobbies") {
      const publicLobbies = {};
      for (const [code, lobby] of Object.entries(value || {})) {
        if (lobby.meta?.visibility !== "private") publicLobbies[code] = lobby;
      }
      return clone(publicLobbies);
    }
    return value === undefined ? null : clone(value);
  }

  broadcast(changedPath, eventType, data) {
    for (const [socket, client] of this.clients) {
      for (const subscribedPath of client.subscriptions) {
        if (changedPath !== subscribedPath &&
            !changedPath.startsWith(`${subscribedPath}/`)) continue;
        const relative = changedPath === subscribedPath
          ? "/"
          : `/${changedPath.slice(subscribedPath.length + 1)}`;
        this.send(socket, {
          type: "update",
          subscription: subscribedPath,
          eventType,
          path: relative,
          data,
        });
      }
    }
  }

  maintainState() {
    const now = Date.now();
    for (const [code, lobby] of Object.entries(this.state.lobbies)) {
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
      const players = Object.values(lobby.players || {}).sort(
        (a, b) => Number(a.seatIndex) - Number(b.seatIndex),
      );
      if (!players.length && now - Number(lobby.meta?.updatedAt || 0) > 60_000) {
        delete this.state.lobbies[code];
        this.broadcast(`lobbies/${code}`, "put", null);
        continue;
      }
      if (players.length && !lobby.players[lobby.meta?.hostId]) {
        lobby.meta.hostId = players[0].id;
        this.broadcast(
          `lobbies/${code}/meta`,
          "patch",
          { hostId: players[0].id },
        );
      }
      for (const [eventId, event] of Object.entries(lobby.events || {})) {
        if (now - Number(event.createdAt || 0) > 30_000) delete lobby.events[eventId];
      }
      for (const [transferId, transfer] of Object.entries(lobby.transfers || {})) {
        if (now - Number(transfer.createdAt || 0) > 30_000) {
          delete lobby.transfers[transferId];
        }
      }
    }
  }

  getAt(path) {
    let current = this.state;
    for (const part of path.split("/")) {
      if (!isRecord(current) || !Object.hasOwn(current, part)) return undefined;
      current = current[part];
    }
    return current;
  }

  setAt(path, value) {
    const parts = path.split("/");
    let parent = this.state;
    for (const part of parts.slice(0, -1)) {
      if (!isRecord(parent[part])) parent[part] = {};
      parent = parent[part];
    }
    parent[parts.at(-1)] = clone(value);
  }

  deleteAt(path) {
    const parts = path.split("/");
    let parent = this.state;
    for (const part of parts.slice(0, -1)) {
      if (!isRecord(parent?.[part])) return;
      parent = parent[part];
    }
    delete parent[parts.at(-1)];
  }

  send(socket, message) {
    try {
      socket.send(JSON.stringify(message));
    } catch {
      this.clients.delete(socket);
    }
  }
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
  return String(value || "")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 64) || null;
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

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function corsResponse(value, status) {
  return withCors(value === null
    ? new Response(null, { status })
    : jsonResponse(value, status));
}

function withCors(response) {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Headers", "Content-Type, X-Hotdog-Client");
  headers.set(
    "Access-Control-Allow-Methods",
    "GET, PUT, PATCH, POST, DELETE, RESERVE, OPTIONS",
  );
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
