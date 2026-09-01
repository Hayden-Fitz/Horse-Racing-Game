"use strict";

HD.Network = (() => {
  const PLAYER_UPDATE_SECONDS = 0.2;
  const RACE_UPDATE_SECONDS = 0.2;
  const MAINTENANCE_SECONDS = 5;
  const STALE_PLAYER_MS = 18_000;
  const EVENT_LIFETIME_MS = 30_000;
  const LOBBY_CODE_CHARACTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  const S = HD.state;
  const $ = (selector) => document.querySelector(selector);
  const members = new Map();
  const processedEvents = new Set();
  const remoteStateSequences = new Map();
  const elements = {};

  let selfId = createClientId();
  let hostId = null;
  let lobby = null;
  let lobbyCache = null;
  let stream = null;
  let playing = false;
  let pendingLobbyCode = null;
  let joinedAt = 0;
  let playerSequence = 0;
  let raceSequence = 0;
  let lastRaceSequence = 0;
  let playerSendTimer = 0;
  let raceSendTimer = 0;
  let maintenanceTimer = 0;
  let browserTimer = 0;
  let playerWritePending = false;
  let raceWritePending = false;
  let rosterSignature = "";
  let lobbyVisibility = "public";

  function init() {
    Object.assign(elements, {
      status: $("#network-status"),
      playerName: $("#player-name"),
      lobbyName: $("#lobby-name"),
      lobbyCode: $("#lobby-code"),
      create: $("#lobby-create"),
      publicLobby: $("#lobby-public"),
      privateLobby: $("#lobby-private"),
      join: $("#lobby-join"),
      refresh: $("#lobby-refresh"),
      browser: $("#lobby-browser"),
      room: $("#lobby-room"),
      roomName: $("#lobby-room-name"),
      roomCode: $("#lobby-room-code"),
      memberList: $("#lobby-members"),
      copy: $("#lobby-copy"),
      start: $("#lobby-start"),
      ready: $("#lobby-ready"),
      leave: $("#lobby-leave"),
      message: $("#lobby-message"),
      singlePlayer: $("#menu-play"),
    });

    restorePlayerName();
    bindLobbyControls();
    readInviteCode();
    setStatus("connecting", "CONNECTING TO FIREBASE...");

    requestLobbies()
      .then(() => {
        setStatus("online", "FIREBASE ONLINE");
        if (pendingLobbyCode) joinLobby(pendingLobbyCode);
      })
      .catch(showConnectionError);

    window.addEventListener("pagehide", leaveBeacon);
  }

  function bindLobbyControls() {
    elements.create.addEventListener("click", createLobby);
    elements.publicLobby.addEventListener("click", () => setLobbyVisibility("public"));
    elements.privateLobby.addEventListener("click", () => setLobbyVisibility("private"));
    elements.join.addEventListener("click", joinLobbyFromInput);
    elements.refresh.addEventListener("click", requestLobbies);
    elements.copy.addEventListener("click", copyInviteLink);
    elements.start.addEventListener("click", startOnlineMatch);
    elements.ready.addEventListener("click", toggleReady);
    elements.leave.addEventListener("click", leaveOnlineSession);
    elements.singlePlayer.addEventListener("click", leaveOnlineSession);
    elements.playerName.addEventListener("change", savePlayerName);
    elements.lobbyCode.addEventListener("input", () => {
      elements.lobbyCode.value = sanitizeLobbyCode(elements.lobbyCode.value);
    });
  }

  function setLobbyVisibility(visibility) {
    lobbyVisibility = visibility === "private" ? "private" : "public";
    elements.publicLobby.classList.toggle("active", lobbyVisibility === "public");
    elements.privateLobby.classList.toggle("active", lobbyVisibility === "private");
    setMessage(
      lobbyVisibility === "private"
        ? "Private lobbies stay out of the browser and are joined by invite or code."
        : "Public lobbies appear in the browser for other players.",
    );
  }

  function readInviteCode() {
    const inviteCode = new URLSearchParams(location.search).get("lobby");
    if (!inviteCode) return;

    pendingLobbyCode = sanitizeLobbyCode(inviteCode);
    elements.lobbyCode.value = pendingLobbyCode;
    setMessage(`Invite ${pendingLobbyCode} found. Connecting through Firebase...`);
  }

  async function createLobby() {
    savePlayerName();
    setMessage("Creating your Firebase lobby...");

    try {
      if (lobby) await leaveOnlineSession();

      const code = await unusedLobbyCode();
      const now = Date.now();
      const player = playerRecord(0, now);
      const data = {
        meta: {
          id: code,
          name: cleanLobbyName(elements.lobbyName.value),
          hostId: selfId,
          capacity: 8,
          visibility: lobbyVisibility,
          started: false,
          createdAt: now,
          updatedAt: now,
        },
        players: {
          [selfId]: player,
        },
        seats: {
          0: selfId,
        },
      };

      await firebaseRequest(`lobbies/${code}`, {
        method: "PUT",
        body: data,
      });
      enterLobby(code, data, 0);
      setMessage(
        lobbyVisibility === "private"
          ? "Private lobby created. Share its invite link or code with up to seven friends."
          : "Public lobby created. Share the invite link with up to seven friends.",
      );
    } catch (error) {
      showFirebaseError(error, "The lobby could not be created.");
    }
  }

  function joinLobbyFromInput() {
    const code = sanitizeLobbyCode(elements.lobbyCode.value);
    if (code.length !== 6) {
      setMessage("Enter the six-character lobby code.");
      return;
    }

    savePlayerName();
    joinLobby(code);
  }

  async function joinLobby(code) {
    const safeCode = sanitizeLobbyCode(code);
    pendingLobbyCode = null;
    setMessage(`Joining ${safeCode} through Firebase...`);

    try {
      if (lobby) await leaveOnlineSession();

      const data = await firebaseRequest(`lobbies/${safeCode}`);
      if (!data?.meta) throw new Error("That lobby does not exist.");

      const activePlayers = activePlayerEntries(data.players);
      if (activePlayers.length >= 8) throw new Error("That lobby is full.");

      const seatIndex = await reserveLobbySeat(safeCode, activePlayers);
      const now = Date.now();
      const player = playerRecord(seatIndex, now);

      try {
        await firebaseRequest(`lobbies/${safeCode}/players/${selfId}`, {
          method: "PUT",
          body: player,
        });
      } catch (error) {
        await firebaseRequest(`lobbies/${safeCode}/seats/${seatIndex}`, {
          method: "DELETE",
        }).catch(() => {});
        throw error;
      }
      await firebaseRequest(`lobbies/${safeCode}/meta/updatedAt`, {
        method: "PUT",
        body: now,
      });

      data.players = data.players || {};
      data.players[selfId] = player;
      enterLobby(safeCode, data, seatIndex);
      setMessage("Joined the online lobby. Mark yourself ready when you are set.");
    } catch (error) {
      showFirebaseError(error, "The lobby could not be joined.");
    }
  }

  function enterLobby(code, data, seatIndex) {
    closeStream();
    clearRemotePlayers();
    removePlaceholderPlayers();
    members.clear();
    processedEvents.clear();
    remoteStateSequences.clear();

    joinedAt = Date.now();
    lobbyCache = data;
    hostId = data.meta.hostId;
    playing = Boolean(data.meta.started);
    lobby = lobbySummary(code, data);
    rosterSignature = "";

    HD.Stadium.assignLocalSeat(seatIndex);
    syncLobbyCache(true);
    openLobbyStream(code);
    setStatus("online", `FIREBASE LOBBY ${code}`);

    if (playing) beginOnlinePlay();
  }

  function openLobbyStream(code) {
    closeStream();
    stream = HD.Firebase.subscribe(`lobbies/${code}`, {
      open() {
        setStatus("online", `FIREBASE LOBBY ${code}`);
      },
      update: applyStreamEvent,
      cancel: streamCancelled,
      error() {
        if (!lobby) return;
        setStatus("connecting", "FIREBASE RECONNECTING...");
      },
    });
  }

  function applyStreamEvent(event) {
    if (!lobby) return;

    try {
      const update = JSON.parse(event.data);
      applyCacheUpdate(update.path, update.data, event.type === "patch");
      syncLobbyCache(false);
    } catch (error) {
      console.warn("Ignored an invalid Firebase update.", error);
    }
  }

  function applyCacheUpdate(path, data, patch) {
    const keys = path.split("/").filter(Boolean);
    if (!keys.length) {
      if (patch) lobbyCache = mergeFirebasePatch(lobbyCache || {}, data);
      else lobbyCache = data || {};
      return;
    }

    lobbyCache = lobbyCache || {};
    let parent = lobbyCache;
    for (let index = 0; index < keys.length - 1; index++) {
      parent[keys[index]] = parent[keys[index]] || {};
      parent = parent[keys[index]];
    }

    const leaf = keys.at(-1);
    if (patch) {
      parent[leaf] = mergeFirebasePatch(parent[leaf] || {}, data);
    } else if (data === null) {
      delete parent[leaf];
    } else {
      parent[leaf] = data;
    }
  }

  function mergeFirebasePatch(target, patch) {
    if (!patch || typeof patch !== "object") return patch;

    const merged = { ...target };
    Object.entries(patch).forEach(([key, value]) => {
      if (value === null) delete merged[key];
      else merged[key] = value;
    });
    return merged;
  }

  function syncLobbyCache(initial) {
    if (!lobbyCache?.meta || !lobby) return;

    hostId = lobbyCache.meta.hostId;
    lobby.name = lobbyCache.meta.name || lobby.name;
    lobby.started = Boolean(lobbyCache.meta.started);
    lobby.visibility = lobbyCache.meta.visibility || "public";

    syncMembers(initial);
    syncRaceState();
    syncEvents();
    claimMissingHost();

    if (lobby.started && !playing) beginOnlinePlay();
  }

  function syncMembers(initial) {
    const activeEntries = activePlayerEntries(lobbyCache.players, true);
    const activeIds = new Set(activeEntries.map(([id]) => id));

    [...members.keys()].forEach((playerId) => {
      if (activeIds.has(playerId)) return;
      const player = members.get(playerId);
      members.delete(playerId);
      removeRemotePlayer(playerId);
      if (!initial && player) HD.UI.announce(`${player.name} left the lobby.`);
    });

    activeEntries.forEach(([playerId, player]) => {
      const known = members.has(playerId);
      members.set(playerId, { ...player, id: playerId });

      if (playerId !== selfId) {
        const avatarSignature = JSON.stringify(player.avatar || {});
        const remoteAvatar = HD.world.remotePlayers.get(playerId);
        if (known && remoteAvatar?.userData.avatarSignature !== avatarSignature) {
          removeRemotePlayer(playerId);
        }
        if (!HD.world.remotePlayers.has(playerId)) {
          createRemotePlayer({ ...player, id: playerId });
        }
        const currentAvatar = HD.world.remotePlayers.get(playerId);
        if (currentAvatar) {
          HD.Models.setPlayerNameTag(currentAvatar, player.name);
        }
        applyCachedPlayerState(playerId, player);
      }
      if (!initial && !known) HD.UI.announce(`${player.name} joined the lobby.`);
    });

    lobby.players = members.size;
    const nextSignature = [...members.values()]
      .sort((a, b) => a.seatIndex - b.seatIndex)
      .map((player) => `${player.id}:${player.seatIndex}:${player.ready}`)
      .join("|") + `:${hostId}`;

    if (nextSignature !== rosterSignature) {
      rosterSignature = nextSignature;
      renderRoom();
    }
  }

  function applyCachedPlayerState(playerId, player) {
    const state = player.state;
    if (!validPlayerState(state)) return;

    const sequence = Number(state.sequence) || 0;
    if (sequence <= (remoteStateSequences.get(playerId) || 0)) return;

    remoteStateSequences.set(playerId, sequence);
    const avatar = createRemotePlayer({ ...player, id: playerId });
    avatar.userData.targetPosition.set(state.x, state.y, state.z);
    avatar.userData.targetYaw = state.yaw;
    avatar.userData.targetHeadTurn = Number(state.headTurn) || 0;
    avatar.userData.targetHeadPitch = Number(state.pitch) || 0;
    HD.Models.setPlayerStanding(avatar, state.standing);
    avatar.userData.activity = state.mode === "throw"
      ? "throw"
      : state.mode === "phone"
        ? "phone"
        : "watch";
    avatar.userData.moving = Boolean(state.moving);
    HD.Models.equipPlayer(avatar, state.mode, state.selectedItem);
  }

  function syncRaceState() {
    const race = lobbyCache.race;
    if (!race?.state || isHost()) return;

    const sequence = Number(race.sequence) || 0;
    if (sequence <= lastRaceSequence) return;

    lastRaceSequence = sequence;
    HD.Race.applyNetworkSnapshot(race.state);
  }

  function syncEvents() {
    Object.entries(lobbyCache.events || {}).forEach(([eventId, event]) => {
      if (processedEvents.has(eventId)) return;
      processedEvents.add(eventId);

      if (!event || event.createdAt < joinedAt - 1_000 || event.from === selfId) return;
      if (event.type === "throw" && event.payload) {
        const thrower = HD.world.remotePlayers.get(event.from);
        if (thrower) HD.Models.playPlayerThrow(thrower, event.payload.type);
        HD.Race.launchNetwork(event.payload, isHost());
      }
      if (event.type === "sabotage" && event.payload && isHost()) {
        HD.Race.addNetworkSabotage(event.payload);
      }
      if (event.type === "transfer" && event.payload?.to === selfId) {
        const money = Math.max(0, Math.floor(Number(event.payload.money) || 0));
        const itemId = event.payload.itemId;
        S.money += money;
        if (itemId && S.inventory[itemId] !== undefined) S.inventory[itemId]++;
        HD.UI.announce(`${event.payload.fromName || "A player"} sent you ${money ? `$${money}` : HD.CONFIG.items[itemId]?.name || "an item"}.`);
        HD.UI.render();
      }
    });
  }

  function claimMissingHost() {
    if (!lobby || members.has(hostId)) return;

    const successor = [...members.values()]
      .sort((a, b) => a.seatIndex - b.seatIndex)[0];
    if (successor?.id !== selfId) return;

    hostId = selfId;
    firebaseRequest(`lobbies/${lobby.id}/meta`, {
      method: "PATCH",
      body: { hostId: selfId, updatedAt: Date.now() },
    }).catch(() => {});
  }

  function update(dt) {
    updateRemotePlayers(dt);

    if (!lobby) {
      browserTimer -= dt;
      if (browserTimer <= 0) {
        browserTimer = 8;
        requestLobbies().catch(() => {});
      }
      return;
    }

    playerSendTimer -= dt;
    raceSendTimer -= dt;
    maintenanceTimer -= dt;

    if (playerSendTimer <= 0) {
      playerSendTimer = PLAYER_UPDATE_SECONDS;
      writeLocalPlayerState();
    }
    if (playing && isHost() && raceSendTimer <= 0) {
      raceSendTimer = RACE_UPDATE_SECONDS;
      writeRaceState();
    }
    if (isHost() && maintenanceTimer <= 0) {
      maintenanceTimer = MAINTENANCE_SECONDS;
      maintainLobby();
    }
  }

  function writeLocalPlayerState() {
    if (playerWritePending || !lobby) return;

    playerWritePending = true;
    firebaseRequest(`lobbies/${lobby.id}/players/${selfId}`, {
      method: "PATCH",
      body: {
        lastSeen: Date.now(),
        state: localPlayerState(),
      },
    })
      .catch(() => {})
      .finally(() => {
        playerWritePending = false;
      });
  }

  function writeRaceState() {
    if (raceWritePending || !lobby) return;

    raceWritePending = true;
    firebaseRequest(`lobbies/${lobby.id}/race`, {
      method: "PUT",
      body: {
        sequence: ++raceSequence,
        updatedAt: Date.now(),
        state: HD.Race.networkSnapshot(),
      },
    })
      .catch(() => {})
      .finally(() => {
        raceWritePending = false;
      });
  }

  function maintainLobby() {
    if (!lobby || !lobbyCache) return;

    const now = Date.now();
    Object.entries(lobbyCache.players || {}).forEach(([playerId, player]) => {
      if (playerId === selfId || isPlayerActive(player, now)) return;
      firebaseRequest(`lobbies/${lobby.id}/players/${playerId}`, {
        method: "DELETE",
      }).catch(() => {});
      firebaseRequest(`lobbies/${lobby.id}/seats/${player.seatIndex}`, {
        method: "DELETE",
      }).catch(() => {});
    });

    Object.entries(lobbyCache.seats || {}).forEach(([seatIndex, playerId]) => {
      if (isPlayerActive(lobbyCache.players?.[playerId], now)) return;
      firebaseRequest(`lobbies/${lobby.id}/seats/${seatIndex}`, {
        method: "DELETE",
      }).catch(() => {});
    });

    Object.entries(lobbyCache.events || {}).forEach(([eventId, event]) => {
      if (now - Number(event?.createdAt || 0) <= EVENT_LIFETIME_MS) return;
      firebaseRequest(`lobbies/${lobby.id}/events/${eventId}`, {
        method: "DELETE",
      }).catch(() => {});
    });

    firebaseRequest(`lobbies/${lobby.id}/meta/updatedAt`, {
      method: "PUT",
      body: now,
    }).catch(() => {});
  }

  function localPlayerState() {
    const player = HD.world.localPlayer;
    return {
      sequence: ++playerSequence,
      x: player.position.x,
      y: player.position.y,
      z: player.position.z,
      yaw: player.rotation.y,
      headTurn: player.userData.headTurn || 0,
      pitch: S.pitch,
      standing: S.standing,
      moving: S.standing && Object.values(S.movement).some(Boolean),
      mode: S.mode,
      selectedItem: S.selectedItem,
      money: S.money,
    };
  }

  function sendThrow(type, start, velocity, power) {
    if (!lobby) return;

    postLobbyEvent("throw", {
      type,
      start: start.toArray(),
      velocity: velocity.toArray(),
      power,
    });
  }

  function sendSabotage(horse, optionId) {
    if (!lobby) return;
    postLobbyEvent("sabotage", { horse, optionId });
  }

  function transferTargets() {
    return [...members.values()]
      .filter((player) => player.id !== selfId)
      .map((player) => ({ id: player.id, name: player.name }));
  }

  function sendTransfer(to, money, itemId) {
    if (!lobby || !members.has(to) || to === selfId) return false;
    const amount = Math.max(0, Math.floor(Number(money) || 0));
    if (amount > S.money) return false;
    if (itemId && (!S.inventory[itemId] || S.inventory[itemId] < 1)) return false;
    if (!amount && !itemId) return false;
    S.money -= amount;
    if (itemId) S.inventory[itemId]--;
    postLobbyEvent("transfer", {
      to,
      money: amount,
      itemId: itemId || "",
      fromName: members.get(selfId)?.name || "A player",
    });
    return true;
  }

  function updateAvatar(avatar) {
    if (!lobby) return;
    firebaseRequest(`lobbies/${lobby.id}/players/${selfId}/avatar`, {
      method: "PUT",
      body: avatar,
    }).catch((error) => showFirebaseError(error, "Your outfit was not synchronized."));
  }

  function postLobbyEvent(type, payload) {
    firebaseRequest(`lobbies/${lobby.id}/events`, {
      method: "POST",
      body: {
        type,
        from: selfId,
        createdAt: Date.now(),
        payload,
      },
      silent: false,
    }).catch((error) => showFirebaseError(error, `The ${type} event was not sent.`));
  }

  function createRemotePlayer(player) {
    if (HD.world.remotePlayers.has(player.id)) {
      return HD.world.remotePlayers.get(player.id);
    }

    const seatColorIndex = Number(player.seatIndex) % HD.CONFIG.playerColors.length;
    const color = HD.CONFIG.playerColors[seatColorIndex];
    const avatar = HD.Models.playerCharacter(color, {
      variant: seatColorIndex,
      activity: "watch",
      ...(player.avatar || {}),
    });
    const seat = networkSeat(player.seatIndex);

    avatar.position.copy(seat.position);
    avatar.rotation.y = seat.yaw;
    avatar.userData.networkId = player.id;
    avatar.userData.name = player.name;
    avatar.userData.targetPosition = seat.position.clone();
    avatar.userData.targetYaw = seat.yaw;
    avatar.userData.avatarSignature = JSON.stringify(player.avatar || {});
    avatar.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = false;
      object.receiveShadow = true;
    });
    HD.Models.setPlayerNameTag(avatar, player.name);

    HD.world.scene.add(avatar);
    HD.world.remotePlayers.set(player.id, avatar);
    return avatar;
  }

  function networkSeat(index = 0) {
    const placement = HD.Stadium.playerSeatPlacement(index);
    return {
      position: placement.avatar,
      yaw: placement.yaw,
    };
  }

  function updateRemotePlayers(dt) {
    const blend = 1 - Math.exp(-dt * 11);
    HD.world.remotePlayers.forEach((avatar) => {
      avatar.position.lerp(avatar.userData.targetPosition, blend);
      avatar.rotation.y = lerpAngle(avatar.rotation.y, avatar.userData.targetYaw, blend);
      avatar.userData.headTurn = THREE.MathUtils.lerp(
        avatar.userData.headTurn || 0,
        avatar.userData.targetHeadTurn || 0,
        blend,
      );
      avatar.userData.headPitch = THREE.MathUtils.lerp(
        avatar.userData.headPitch || 0,
        avatar.userData.targetHeadPitch || 0,
        blend,
      );
      HD.Models.animateCharacter(avatar, S.elapsed, true);
    });
  }

  function validPlayerState(state) {
    return state && [state.x, state.y, state.z, state.yaw].every(Number.isFinite);
  }

  function removePlaceholderPlayers() {
    (HD.world.players || []).forEach((player) => HD.world.scene.remove(player));
    HD.world.players = [];
  }

  function removeRemotePlayer(playerId) {
    const avatar = HD.world.remotePlayers.get(playerId);
    if (avatar) HD.world.scene.remove(avatar);
    HD.world.remotePlayers.delete(playerId);
    remoteStateSequences.delete(playerId);
  }

  function clearRemotePlayers() {
    [...HD.world.remotePlayers.keys()].forEach(removeRemotePlayer);
  }

  async function requestLobbies() {
    const data = await firebaseRequest("lobbies");
    const now = Date.now();
    cleanupAbandonedLobbies(data, now);
    const list = Object.entries(data || {})
      .map(([code, entry]) => publicLobby(code, entry, now))
      .filter(Boolean)
      .sort((a, b) => b.updatedAt - a.updatedAt);

    renderLobbyBrowser(list);
    if (!lobby) setStatus("online", "FIREBASE ONLINE");
    return list;
  }

  function publicLobby(code, data, now) {
    if (!data?.meta) return null;
    if (data.meta.visibility === "private") return null;

    const players = activePlayerEntries(data.players, false, now).map(([, player]) => player);
    if (!players.length || players.length >= 8) return null;

    return {
      id: code,
      name: data.meta.name || "Race Night",
      capacity: 8,
      players: players.length,
      ready: players.filter((player) => player.ready).length,
      started: Boolean(data.meta.started),
      updatedAt: Number(data.meta.updatedAt) || 0,
    };
  }

  function renderLobbyBrowser(lobbies) {
    if (!lobbies.length) {
      elements.browser.textContent = "No active lobbies yet. Create the first one.";
      return;
    }

    elements.browser.innerHTML = lobbies.map((entry) => `
      <button data-lobby-id="${entry.id}">
        <strong>${escapeHtml(entry.name)}</strong>
        <em>${entry.started ? "LIVE" : "WAITING"}</em>
        <small>
          ${entry.players}/${entry.capacity} PLAYERS &middot; ${entry.ready} READY &middot; ${entry.id}
        </small>
      </button>
    `).join("");

    elements.browser.querySelectorAll("[data-lobby-id]").forEach((button) => {
      button.addEventListener("click", () => {
        elements.lobbyCode.value = button.dataset.lobbyId;
        joinLobbyFromInput();
      });
    });
  }

  function renderRoom() {
    if (!lobby) return;

    elements.room.hidden = false;
    elements.roomName.textContent = lobby.name;
    elements.roomCode.textContent = `${lobby.visibility.toUpperCase()} · CODE ${lobby.id}`;
    elements.memberList.innerHTML = [
      lobbySeatRow([0, 1, 2], "BOTTOM ROW"),
      lobbySeatRow([3, 4], "MIDDLE ROW"),
      lobbySeatRow([5, 6, 7], "TOP ROW"),
    ].join("");

    const self = members.get(selfId);
    const everyoneReady = members.size > 0 &&
      [...members.values()].every((player) => player.ready);
    elements.ready.classList.toggle("ready", Boolean(self?.ready));
    elements.ready.textContent = self?.ready ? "READY \u2713" : "I'M READY";
    elements.start.disabled = !isHost() || !everyoneReady;
    elements.start.textContent = isHost()
      ? everyoneReady
        ? "START ONLINE MATCH"
        : "WAITING FOR READY PLAYERS"
      : "HOST STARTS THE MATCH";
  }

  function lobbySeatRow(seatIndexes, label) {
    return `
      <section>
        <small class="lobby-row-label">${label}</small>
        <div class="lobby-seat-row" data-size="${seatIndexes.length}">
          ${seatIndexes.map(lobbySeat).join("")}
        </div>
      </section>
    `;
  }

  function lobbySeat(seatIndex) {
    const player = [...members.values()].find((candidate) => {
      return candidate.seatIndex === seatIndex;
    });

    if (!player) {
      return `
        <span class="lobby-seat empty">
          <strong>OPEN SEAT</strong>
          <small>Player ${seatIndex + 1}</small>
        </span>
      `;
    }

    const classes = ["lobby-seat", "occupied"];
    if (player.ready) classes.push("ready");
    if (player.id === selfId) classes.push("self");
    const role = player.id === hostId ? "HOST" : player.ready ? "READY" : "NOT READY";
    const seatColor = HD.CONFIG.playerColors[
      Number(player.seatIndex) % HD.CONFIG.playerColors.length
    ];
    const color = seatColor.toString(16).padStart(6, "0");
    const initial = escapeHtml(player.name.trim().charAt(0).toUpperCase() || "P");

    return `
      <span class="${classes.join(" ")}" style="--player-color:#${color}">
        <i class="lobby-player-icon" style="--player-color:#${color}">${initial}</i>
        <span>
          <strong>${escapeHtml(player.name)}</strong>
          <small>${role}</small>
        </span>
      </span>
    `;
  }

  function toggleReady() {
    const player = members.get(selfId);
    if (!player || playing || !lobby) return;

    firebaseRequest(`lobbies/${lobby.id}/players/${selfId}/ready`, {
      method: "PUT",
      body: !player.ready,
    }).catch((error) => showFirebaseError(error, "Ready status was not saved."));
  }

  function startOnlineMatch() {
    const everyoneReady = [...members.values()].every((player) => player.ready);
    if (!isHost() || !lobby || !everyoneReady) return;

    const matchId = Date.now();
    firebaseRequest(`lobbies/${lobby.id}/meta`, {
      method: "PATCH",
      body: { started: true, matchId, updatedAt: matchId },
    }).catch((error) => showFirebaseError(error, "The match could not start."));
  }

  function beginOnlinePlay() {
    playing = true;
    setMessage("Online match in progress. The host controls race timing.");
    HD.Controls.closeMenu();
  }

  async function leaveOnlineSession() {
    const oldLobby = lobby;
    const oldSeatIndex = members.get(selfId)?.seatIndex;
    const wasHost = oldLobby && selfId === hostId;
    const successors = [...members.values()]
      .filter((player) => player.id !== selfId)
      .sort((a, b) => a.seatIndex - b.seatIndex);

    closeStream();
    resetLobbyState();

    if (!oldLobby) return;

    try {
      await firebaseRequest(`lobbies/${oldLobby.id}/players/${selfId}`, {
        method: "DELETE",
      });
      if (Number.isInteger(oldSeatIndex)) {
        await firebaseRequest(`lobbies/${oldLobby.id}/seats/${oldSeatIndex}`, {
          method: "DELETE",
        });
      }

      if (wasHost && successors.length) {
        await firebaseRequest(`lobbies/${oldLobby.id}/meta`, {
          method: "PATCH",
          body: { hostId: successors[0].id, updatedAt: Date.now() },
        });
      }
      if (!successors.length) {
        await firebaseRequest(`lobbies/${oldLobby.id}`, { method: "DELETE" });
      }
    } catch {
      setMessage("The lobby will remove this player after its presence timeout.");
    }
  }

  async function quitToLobby() {
    await leaveOnlineSession();
    HD.Race.restart();
    S.matchStarted = false;
    S.paused = true;
    HD.Controls.setMode("look");
    HD.UI.menu(true, false);
    setMessage("Choose a lobby or start a new single-player match.");
  }

  function resetLobbyState() {
    lobby = null;
    lobbyCache = null;
    hostId = null;
    playing = false;
    members.clear();
    processedEvents.clear();
    clearRemotePlayers();
    elements.room.hidden = true;
    setStatus("online", "FIREBASE ONLINE");
  }

  function leaveBeacon() {
    if (!lobby) return;
    const seatIndex = members.get(selfId)?.seatIndex;
    HD.Firebase.removeOnPageHide(`lobbies/${lobby.id}/players/${selfId}`)
      .catch(() => {});
    if (Number.isInteger(seatIndex)) {
      HD.Firebase.removeOnPageHide(`lobbies/${lobby.id}/seats/${seatIndex}`)
        .catch(() => {});
    }
  }

  function closeStream() {
    if (stream) stream.close();
    stream = null;
  }

  function streamCancelled() {
    setStatus("offline", "FIREBASE ACCESS DENIED");
    setMessage("Firebase cancelled this lobby stream. Check the database rules.");
  }

  async function copyInviteLink() {
    if (!lobby) return;

    const url = new URL(location.href);
    url.searchParams.set("lobby", lobby.id);
    try {
      await navigator.clipboard.writeText(url.href);
      setMessage("Invite link copied to the clipboard.");
    } catch {
      setMessage(`Invite code: ${lobby.id}`);
    }
  }

  async function unusedLobbyCode() {
    for (let attempt = 0; attempt < 12; attempt++) {
      const code = randomLobbyCode();
      const existing = await firebaseRequest(`lobbies/${code}`);
      if (!existing) return code;
    }
    throw new Error("Could not reserve a unique lobby code. Try again.");
  }

  function randomLobbyCode() {
    const random = new Uint32Array(6);
    crypto.getRandomValues(random);
    return [...random].map((value) => {
      return LOBBY_CODE_CHARACTERS[value % LOBBY_CODE_CHARACTERS.length];
    }).join("");
  }

  async function reserveLobbySeat(code, playerEntries) {
    const occupied = new Set(playerEntries.map(([, player]) => player.seatIndex));
    for (let seat = 0; seat < 8; seat++) {
      if (occupied.has(seat)) continue;
      const reserved = await HD.Firebase.reserve(`lobbies/${code}/seats/${seat}`, selfId);
      if (reserved) return seat;
    }
    throw new Error("That lobby filled up while you were joining.");
  }

  function cleanupAbandonedLobbies(data, now) {
    Object.entries(data || {}).forEach(([code, entry]) => {
      if (!entry?.meta || activePlayerEntries(entry.players, false, now).length) return;
      if (now - Number(entry.meta.updatedAt || 0) < 60_000) return;

      firebaseRequest(`lobbies/${code}`, { method: "DELETE" }).catch(() => {});
    });
  }

  function playerRecord(seatIndex, now) {
    return {
      id: selfId,
      name: playerName(),
      seatIndex,
      ready: false,
      avatar: HD.Settings.avatarOptions(),
      joinedAt: now,
      lastSeen: now,
    };
  }

  function activePlayerEntries(players, keepSelf = false, now = Date.now()) {
    return Object.entries(players || {}).filter(([playerId, player]) => {
      return (keepSelf && playerId === selfId) || isPlayerActive(player, now);
    });
  }

  function isPlayerActive(player, now = Date.now()) {
    return player && now - Number(player.lastSeen || 0) < STALE_PLAYER_MS;
  }

  function lobbySummary(code, data) {
    return {
      id: code,
      name: data.meta.name || "Race Night",
      players: activePlayerEntries(data.players, true).length,
      capacity: 8,
      started: Boolean(data.meta.started),
      visibility: data.meta.visibility || "public",
    };
  }

  function sanitizeLobbyCode(value) {
    return String(value || "")
      .toUpperCase()
      .replace(/[^A-Z2-9]/g, "")
      .slice(0, 6);
  }

  function cleanLobbyName(value) {
    return String(value || "").trim().slice(0, 32) || `${playerName()}'s Race`;
  }

  function createClientId() {
    if (crypto.randomUUID) return crypto.randomUUID().replaceAll("-", "");

    const random = new Uint32Array(4);
    crypto.getRandomValues(random);
    return [...random].map((value) => value.toString(16)).join("");
  }

  function firebaseRequest(path, options) {
    return HD.Firebase.request(path, options);
  }

  function showConnectionError(error) {
    console.warn("Firebase multiplayer unavailable.", error);
    setStatus("offline", "FIREBASE OFFLINE");
    setMessage("Firebase is unavailable. Single player still works normally.");
  }

  function showFirebaseError(error, fallback) {
    console.warn(fallback, error);
    const message = String(error?.message || "").replace(/^"|"$/g, "");
    setMessage(message && message.length < 120 ? message : fallback);
  }

  function restorePlayerName() {
    try {
      elements.playerName.value = localStorage.getItem("hotdog-downs-name") || "Track Fan";
    } catch {}
  }

  function savePlayerName() {
    try {
      localStorage.setItem("hotdog-downs-name", playerName());
    } catch {}
  }

  function playerName() {
    return elements.playerName.value.trim().slice(0, 28) || "Track Fan";
  }

  function setStatus(state, text) {
    elements.status.dataset.state = state;
    elements.status.textContent = text;
  }

  function setMessage(text) {
    elements.message.textContent = text;
  }

  function colorIndex(value) {
    let hash = 0;
    for (let index = 0; index < value.length; index++) {
      hash = (hash * 31 + value.charCodeAt(index)) | 0;
    }
    return Math.abs(hash) % HD.CONFIG.playerColors.length;
  }

  function lerpAngle(from, to, amount) {
    const fullTurn = Math.PI * 2;
    const difference = THREE.MathUtils.euclideanModulo(to - from + Math.PI, fullTurn) - Math.PI;
    return from + difference * amount;
  }

  function escapeHtml(value) {
    const element = document.createElement("span");
    element.textContent = value;
    return element.innerHTML;
  }

  function isConnected() {
    return Boolean(lobby);
  }

  function isHost() {
    return !lobby || selfId === hostId;
  }

  function isPlaying() {
    return playing;
  }

  function rankingPlayers() {
    if (!lobby) return [];

    return [...members.values()].map((player) => ({
      id: player.id,
      name: player.id === selfId ? `${player.name} (YOU)` : player.name,
      money: player.id === selfId
        ? S.money
        : Math.max(0, Math.round(Number(player.state?.money) || 100)),
      online: true,
    }));
  }

  function claimMatchWinReward() {
    const matchId = lobbyCache?.meta?.matchId;
    if (!lobby || !matchId || members.size < 2) return false;

    const standings = [...members.values()]
      .map((player) => ({
        id: player.id,
        seatIndex: Number(player.seatIndex) || 0,
        money: player.id === selfId
          ? S.money
          : Math.max(0, Math.round(Number(player.state?.money) || 100)),
      }))
      .sort((first, second) => {
        return second.money - first.money || first.seatIndex - second.seatIndex;
      });
    if (standings[0]?.id !== selfId) return false;

    const rewardId = `${lobby.id}:${matchId}`;
    const awarded = HD.Settings.awardWinnerCoins(25, rewardId);
    if (awarded) {
      HD.UI.announce("ONLINE VICTORY · 25 WINNER COINS EARNED!");
    }
    return awarded;
  }

  return {
    init,
    update,
    sendThrow,
    sendSabotage,
    sendTransfer,
    transferTargets,
    updateAvatar,
    isConnected,
    isHost,
    isPlaying,
    rankingPlayers,
    claimMatchWinReward,
    quitToLobby,
  };
})();
