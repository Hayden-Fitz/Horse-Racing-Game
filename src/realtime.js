"use strict";

HD.Realtime = (() => {
  const REQUEST_TIMEOUT_MS = 8_000;
  const RECONNECT_MAX_MS = 8_000;

  const configuredServer = String(
    window.HOTDOG_SERVER_URL || readStoredServer() || "",
  ).replace(/\/$/, "");
  const httpBase = configuredServer || location.origin;
  const socketBase = httpBase.replace(/^http/i, "ws");

  const subscriptions = new Set();
  const pending = new Map();

  let clientId = "";
  let socket = null;
  let connectPromise = null;
  let reconnectTimer = 0;
  let reconnectDelay = 500;
  let requestSequence = 0;
  let stopped = false;

  function setIdentity(value) {
    const next = String(value || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
    if (!next || next === clientId) return;
    clientId = next;
    closeSocket(false);
  }

  async function request(path, options = {}) {
    const response = await rpc({
      path,
      method: options.method || "GET",
      body: Object.hasOwn(options, "body") ? options.body : undefined,
    });
    return response;
  }

  async function reserve(path, value) {
    const response = await rpc({ path, method: "RESERVE", body: value });
    return Boolean(response?.reserved);
  }

  function subscribe(path, handlers = {}) {
    const subscription = {
      path: normalizePath(path),
      handlers,
      closed: false,
      activeSocket: null,
      close() {
        if (subscription.closed) return;
        subscription.closed = true;
        subscriptions.delete(subscription);
        send({ type: "unsubscribe", path: subscription.path });
      },
    };

    subscriptions.add(subscription);
    connect()
      .then(() => {
        if (subscription.closed) return;
        if (subscription.activeSocket !== socket) {
          send({ type: "subscribe", path: subscription.path });
          subscription.activeSocket = socket;
          handlers.open?.();
        }
      })
      .catch((error) => handlers.error?.(error));
    return subscription;
  }

  function removeOnPageHide(path) {
    const target = dataUrl(path);
    return fetch(target, {
      method: "DELETE",
      keepalive: true,
      headers: { "X-Hotdog-Client": clientId },
    });
  }

  function rpc(payload) {
    return connect().then(() => new Promise((resolve, reject) => {
      const id = `${Date.now().toString(36)}-${++requestSequence}`;
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new Error("The realtime server did not respond in time."));
      }, REQUEST_TIMEOUT_MS);

      pending.set(id, { resolve, reject, timeout });
      if (!send({ type: "request", id, ...payload })) {
        clearTimeout(timeout);
        pending.delete(id);
        reject(new Error("The realtime connection closed before the request was sent."));
      }
    }));
  }

  function connect() {
    if (!clientId) return Promise.reject(new Error("Missing multiplayer identity."));
    if (socket?.readyState === WebSocket.OPEN) return Promise.resolve(socket);
    if (connectPromise) return connectPromise;

    stopped = false;
    connectPromise = new Promise((resolve, reject) => {
      const nextSocket = new WebSocket(
        `${socketBase}/api/socket?clientId=${encodeURIComponent(clientId)}`,
      );
      socket = nextSocket;

      const timeout = setTimeout(() => {
        nextSocket.close();
        reject(new Error("Could not reach the realtime game server."));
      }, REQUEST_TIMEOUT_MS);

      nextSocket.addEventListener("open", () => {
        clearTimeout(timeout);
        reconnectDelay = 500;
        connectPromise = null;
        for (const subscription of subscriptions) {
          if (!subscription.closed) {
            send({ type: "subscribe", path: subscription.path });
            subscription.activeSocket = nextSocket;
            subscription.handlers.open?.();
          }
        }
        resolve(nextSocket);
      }, { once: true });

      nextSocket.addEventListener("message", handleMessage);
      nextSocket.addEventListener("error", () => {});
      nextSocket.addEventListener("close", () => {
        clearTimeout(timeout);
        reject(new Error("Could not reach the multiplayer server at " + httpBase + ". Start the game server or configure its hosted address."));
        // A retired connection must never clear a newer connection's state.
        if (socket !== nextSocket) return;
        socket = null;
        connectPromise = null;
        failPending("The realtime connection was interrupted.");
        for (const subscription of subscriptions) {
          subscription.activeSocket = null;
          subscription.handlers.error?.();
        }
        scheduleReconnect();
      });
    });
    return connectPromise;
  }

  function handleMessage(event) {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }

    if (message.type === "response") {
      const operation = pending.get(message.id);
      if (!operation) return;
      pending.delete(message.id);
      clearTimeout(operation.timeout);
      if (message.ok) operation.resolve(message.data);
      else operation.reject(serverError(message));
      return;
    }

    if (message.type !== "update") return;
    for (const subscription of subscriptions) {
      if (subscription.closed || subscription.path !== normalizePath(message.subscription || subscription.path)) {
        continue;
      }
      subscription.handlers.update?.({
        type: message.eventType === "patch" ? "patch" : "put",
        data: JSON.stringify({ path: message.path, data: message.data }),
      });
    }
  }

  function scheduleReconnect() {
    if (stopped || !subscriptions.size || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = 0;
      connect().catch(() => {});
    }, reconnectDelay);
    reconnectDelay = Math.min(RECONNECT_MAX_MS, reconnectDelay * 1.7);
  }

  function closeSocket(stop = true) {
    stopped = stop;
    failPending("The multiplayer connection was closed.");
    clearTimeout(reconnectTimer);
    reconnectTimer = 0;
    socket?.close();
    socket = null;
    connectPromise = null;
  }

  function send(message) {
    if (socket?.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(message));
    return true;
  }

  function failPending(message) {
    for (const operation of pending.values()) {
      clearTimeout(operation.timeout);
      operation.reject(new Error(message));
    }
    pending.clear();
  }

  function serverError(message) {
    const error = new Error(message.error || "The realtime request failed.");
    error.status = message.status || 400;
    return error;
  }

  function dataUrl(path) {
    const safePath = String(path || "")
      .split("/")
      .filter(Boolean)
      .map(encodeURIComponent)
      .join("/");
    return `${httpBase}/api/data/${safePath}`;
  }

  function normalizePath(path) {
    return String(path || "").split("/").filter(Boolean).join("/");
  }

  function readStoredServer() {
    try {
      return localStorage.getItem("hotdog-downs-server");
    } catch {
      return "";
    }
  }

  return {
    request,
    reserve,
    subscribe,
    removeOnPageHide,
    setIdentity,
    disconnect: () => closeSocket(true),
    serverUrl: httpBase,
  };
})();
