"use strict";

HD.Firebase = (() => {
  const DATABASE_URL =
    "https://horseracegame-622fd-default-rtdb.firebaseio.com/hotdogDowns";

  function url(path = "") {
    const safePath = String(path)
      .split("/")
      .filter(Boolean)
      .map(encodeURIComponent)
      .join("/");

    return `${DATABASE_URL}/${safePath}.json`;
  }

  async function request(path, options = {}) {
    const method = options.method || "GET";
    const silent = options.silent !== false && method !== "GET";
    const suffix = silent ? "?print=silent" : "";
    const requestOptions = {
      method,
      headers: {},
    };

    if (Object.hasOwn(options, "body")) {
      requestOptions.headers["Content-Type"] = "application/json";
      requestOptions.body = JSON.stringify(options.body);
    }

    const response = await fetch(`${url(path)}${suffix}`, requestOptions);
    if (!response.ok) {
      const details = await response.text();
      throw new Error(details || `Firebase returned HTTP ${response.status}.`);
    }

    if (silent || response.status === 204) return null;

    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  async function reserve(path, value) {
    const current = await fetch(url(path), {
      headers: { "X-Firebase-ETag": "true" },
    });
    if (!current.ok) throw new Error(`Firebase reservation read returned ${current.status}.`);

    const existing = await current.json();
    if (existing !== null) return false;

    const etag = current.headers.get("etag");
    if (!etag) throw new Error("Firebase did not return a reservation ETag.");

    const result = await fetch(url(path), {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "If-Match": etag,
      },
      body: JSON.stringify(value),
    });

    if (result.status === 412) return false;
    if (!result.ok) throw new Error(`Firebase reservation write returned ${result.status}.`);
    return true;
  }

  function subscribe(path, handlers) {
    const source = new EventSource(url(path));

    source.addEventListener("open", () => handlers.open?.());
    source.addEventListener("put", handlers.update);
    source.addEventListener("patch", handlers.update);
    source.addEventListener("keep-alive", () => {});
    source.addEventListener("cancel", handlers.cancel);
    source.addEventListener("auth_revoked", handlers.cancel);
    source.addEventListener("error", handlers.error);

    return source;
  }

  function removeOnPageHide(path) {
    return fetch(url(path), {
      method: "DELETE",
      keepalive: true,
    });
  }

  return {
    request,
    reserve,
    subscribe,
    removeOnPageHide,
  };
})();
