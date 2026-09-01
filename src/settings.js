"use strict";

HD.Settings = (() => {
  const STORAGE_KEY = "hotdog-downs-settings-v1";
  const DEFAULT_BINDINGS = {
    forward: "KeyW",
    backward: "KeyS",
    left: "KeyA",
    right: "KeyD",
    stand: "Space",
    interact: "KeyE",
    phone: "ShiftLeft",
    throw: "KeyF",
    item: "KeyQ",
    rankings: "KeyR",
    menu: "Escape",
  };
  const ACTION_LABELS = {
    forward: "Move forward",
    backward: "Move backward",
    left: "Move left",
    right: "Move right",
    stand: "Stand / sit",
    interact: "Interact",
    phone: "Phone",
    throw: "Ready item",
    item: "Next item",
    rankings: "Current rankings",
    menu: "Game menu",
  };
  let values = load();
  let initialized = false;
  let avatarControls = {};
  let pendingCosmetic = null;

  function init() {
    if (initialized) return;
    initialized = true;
    bindMenuButtons();
    bindSliders();
    bindAccessibility();
    bindModelDetail();
    bindDisplayOptions();
    bindAvatarOptions();
    renderKeybinds();
    applyAccessibility();
  }

  function load() {
    const defaults = {
      bindings: { ...DEFAULT_BINDINGS },
      fov: 64,
      sensitivity: 100,
      uiScale: 100,
      reducedMotion: false,
      highContrast: false,
      modelDetail: "low",
      renderResolution: "adaptive",
      hudOpacity: 92,
      showControlHelp: true,
      showPerformance: true,
      avatar: {
        skin: "f1c7a5",
        hat: "cap",
        expression: "smile",
        outfit: "raceday",
        trousers: "252525",
        shoes: "sneakers",
        accessory: "none",
      },
      winnerCoins: 0,
      cosmeticUnlocks: [],
      rewardedMatches: [],
    };
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      const savedBindings = { ...DEFAULT_BINDINGS, ...(saved.bindings || {}) };
      if (savedBindings.phone === "KeyP") savedBindings.phone = "ShiftLeft";
      return {
        ...defaults,
        ...saved,
        bindings: savedBindings,
        avatar: { ...defaults.avatar, ...(saved.avatar || {}) },
        cosmeticUnlocks: Array.isArray(saved.cosmeticUnlocks)
          ? saved.cosmeticUnlocks
          : [],
        rewardedMatches: Array.isArray(saved.rewardedMatches)
          ? saved.rewardedMatches
          : [],
      };
    } catch {
      return defaults;
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
    } catch {}
  }

  function bindMenuButtons() {
    const panel = document.querySelector("#settings-panel");
    const card = document.querySelector(".menu-card");
    document.querySelector("#menu-button").addEventListener("click", () => {
      HD.Controls.openMenu();
    });
    document.querySelector("#settings-open").addEventListener("click", () => {
      panel.hidden = false;
      card.classList.add("settings-active");
    });
    document.querySelector("#settings-close").addEventListener("click", () => {
      panel.hidden = true;
      card.classList.remove("settings-active");
    });
    document.querySelector("#exit-game").addEventListener("click", async () => {
      const leave = confirm("Quit this match and return to the lobby?");
      if (leave) await HD.Network.quitToLobby();
    });
  }

  function bindSliders() {
    bindRange("#fov-setting", "#fov-value", "fov", (value) => `${value}°`, () => {
      if (!HD.world.camera) return;
      HD.world.camera.fov = values.fov;
      HD.world.camera.updateProjectionMatrix();
    });
    bindRange(
      "#mouse-sensitivity",
      "#sensitivity-value",
      "sensitivity",
      (value) => `${value}%`,
    );
    bindRange("#ui-scale", "#ui-scale-value", "uiScale", (value) => `${value}%`, () => {
      applyAccessibility();
    });
    bindRange("#hud-opacity", "#hud-opacity-value", "hudOpacity", (value) => `${value}%`, () => {
      applyAccessibility();
    });
  }

  function bindRange(inputSelector, outputSelector, key, format, onChange = () => {}) {
    const input = document.querySelector(inputSelector);
    const output = document.querySelector(outputSelector);
    input.value = values[key];
    output.textContent = format(values[key]);
    input.addEventListener("input", () => {
      values[key] = Number(input.value);
      output.textContent = format(values[key]);
      onChange();
      save();
    });
  }

  function bindAccessibility() {
    const reducedMotion = document.querySelector("#reduced-motion");
    const highContrast = document.querySelector("#high-contrast");
    reducedMotion.checked = values.reducedMotion;
    highContrast.checked = values.highContrast;
    reducedMotion.addEventListener("change", () => {
      values.reducedMotion = reducedMotion.checked;
      applyAccessibility();
      save();
    });
    highContrast.addEventListener("change", () => {
      values.highContrast = highContrast.checked;
      applyAccessibility();
      save();
    });
  }

  function bindModelDetail() {
    const select = document.querySelector("#model-detail");
    select.value = values.modelDetail;
    select.addEventListener("change", () => {
      values.modelDetail = select.value;
      save();
      HD.UI.announce("Model detail saved. Reload the page to rebuild the stadium models.");
    });
  }

  function bindDisplayOptions() {
    const resolution = document.querySelector("#render-resolution");
    const controlHelp = document.querySelector("#show-control-help");
    const performance = document.querySelector("#show-performance");

    resolution.value = values.renderResolution;
    controlHelp.checked = values.showControlHelp;
    performance.checked = values.showPerformance;

    resolution.addEventListener("change", () => {
      values.renderResolution = resolution.value;
      save();
      HD.Game.applyResolution();
    });
    controlHelp.addEventListener("change", () => {
      values.showControlHelp = controlHelp.checked;
      applyAccessibility();
      save();
    });
    performance.addEventListener("change", () => {
      values.showPerformance = performance.checked;
      applyAccessibility();
      save();
    });
    document.querySelector("#fullscreen-toggle").addEventListener("click", async () => {
      if (document.fullscreenElement) await document.exitFullscreen?.();
      else await document.documentElement.requestFullscreen?.();
    });
  }

  function bindAvatarOptions() {
    avatarControls = {
      skin: document.querySelector("#avatar-skin"),
      hat: document.querySelector("#avatar-hat"),
      expression: document.querySelector("#avatar-expression"),
      outfit: document.querySelector("#avatar-outfit"),
      trousers: document.querySelector("#avatar-trousers"),
      shoes: document.querySelector("#avatar-shoes"),
      accessory: document.querySelector("#avatar-accessory"),
    };
    Object.entries(avatarControls).forEach(([key, control]) => {
      control.value = values.avatar[key];
      control.addEventListener("change", () => {
        const option = control.selectedOptions[0];
        const cost = Number(option.dataset.cost) || 0;
        const unlockId = `${key}:${control.value}`;
        if (cost > 0 && !values.cosmeticUnlocks.includes(unlockId)) {
          pendingCosmetic = {
            key,
            value: control.value,
            cost,
            unlockId,
            name: option.textContent.split("·")[0].trim(),
          };
          applyAvatarPreview({ [key]: control.value });
          renderCosmeticWallet();
          return;
        }

        pendingCosmetic = null;
        values.avatar[key] = control.value;
        applyAvatarPreview();
        syncAvatarControls();
        renderCosmeticWallet();
        save();
        HD.Stadium?.refreshLocalPlayer?.();
        HD.Network?.updateAvatar?.(avatarOptions());
      });
    });
    document.querySelector("#avatar-unlock").addEventListener("click", unlockCosmetic);
    applyAvatarPreview();
    renderCosmeticWallet();
  }

  function applyAvatarPreview(overrides = {}) {
    const avatar = { ...values.avatar, ...overrides };
    const preview = document.querySelector("#lobby-avatar");
    preview.style.setProperty("--avatar-skin", `#${avatar.skin}`);
    preview.style.setProperty("--avatar-trousers", `#${avatar.trousers}`);
    preview.dataset.hat = avatar.hat;
    preview.dataset.expression = avatar.expression;
    preview.dataset.outfit = avatar.outfit;
    preview.dataset.shoes = avatar.shoes;
    preview.dataset.accessory = avatar.accessory;
  }

  function unlockCosmetic() {
    if (!pendingCosmetic || values.winnerCoins < pendingCosmetic.cost) return;

    values.winnerCoins -= pendingCosmetic.cost;
    values.cosmeticUnlocks.push(pendingCosmetic.unlockId);
    values.avatar[pendingCosmetic.key] = pendingCosmetic.value;
    pendingCosmetic = null;
    save();
    syncAvatarControls();
    applyAvatarPreview();
    renderCosmeticWallet();
    HD.Stadium?.refreshLocalPlayer?.();
    HD.Network?.updateAvatar?.(avatarOptions());
    HD.UI?.announce?.("Cosmetic unlocked and equipped.");
  }

  function syncAvatarControls() {
    Object.entries(avatarControls).forEach(([key, control]) => {
      control.value = values.avatar[key];
    });
  }

  function renderCosmeticWallet() {
    const balance = document.querySelector("#winner-coins");
    const unlock = document.querySelector("#avatar-unlock");
    const status = document.querySelector("#avatar-customize-status");
    if (!balance || !unlock || !status) return;

    balance.textContent = String(values.winnerCoins);
    unlock.hidden = !pendingCosmetic;
    if (!pendingCosmetic) {
      status.textContent =
        "Shirt color follows your lobby seat. Win online matches to earn Winner Coins.";
      return;
    }

    const affordable = values.winnerCoins >= pendingCosmetic.cost;
    unlock.disabled = !affordable;
    unlock.textContent = affordable
      ? `UNLOCK ${pendingCosmetic.name.toUpperCase()} · ${pendingCosmetic.cost} WC`
      : `NEED ${pendingCosmetic.cost - values.winnerCoins} MORE WC`;
    status.textContent = affordable
      ? "Unlocking permanently adds this cosmetic to your local wardrobe."
      : "Winner Coins are awarded for finishing first in a multiplayer match.";
  }

  function applyAccessibility() {
    document.body.classList.toggle("reduced-motion", values.reducedMotion);
    document.body.classList.toggle("high-contrast", values.highContrast);
    document.body.classList.toggle("hide-control-help", !values.showControlHelp);
    document.body.classList.toggle("hide-performance", !values.showPerformance);
    document.documentElement.style.setProperty("--ui-scale", values.uiScale / 100);
    document.documentElement.style.setProperty("--hud-opacity", values.hudOpacity / 100);
  }

  function renderKeybinds() {
    const list = document.querySelector("#keybind-list");
    list.innerHTML = Object.keys(DEFAULT_BINDINGS).map((action) => `
      <button data-bind-action="${action}">
        <span>${ACTION_LABELS[action]}</span>
        <kbd>${friendlyKey(values.bindings[action])}</kbd>
      </button>
    `).join("");
    list.querySelectorAll("[data-bind-action]").forEach((button) => {
      button.addEventListener("click", () => captureBinding(button));
    });
    document.querySelector("#keybind-reset").onclick = () => {
      values.bindings = { ...DEFAULT_BINDINGS };
      save();
      renderKeybinds();
    };
  }

  function captureBinding(button) {
    button.classList.add("listening");
    button.querySelector("kbd").textContent = "PRESS KEY";
    const action = button.dataset.bindAction;
    document.addEventListener(
      "keydown",
      (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        values.bindings[action] = event.code;
        save();
        renderKeybinds();
      },
      { capture: true, once: true },
    );
  }

  function friendlyKey(code) {
    return code
      .replace(/^Key/, "")
      .replace(/^Digit/, "")
      .replace("Space", "SPACE")
      .replace("Escape", "ESC");
  }

  function binding(action) {
    return values.bindings[action] || DEFAULT_BINDINGS[action];
  }

  function matches(event, action) {
    if (
      action === "phone" &&
      binding(action) === "ShiftLeft" &&
      (event.code === "ShiftLeft" || event.code === "ShiftRight")
    ) {
      return true;
    }
    return event.code === binding(action);
  }

  function sensitivity() {
    return values.sensitivity / 100;
  }

  function reducedMotion() {
    return values.reducedMotion;
  }

  function fov() {
    return values.fov;
  }

  function modelDetail() {
    return values.modelDetail;
  }

  function renderHeight() {
    if (values.renderResolution === "adaptive") return null;
    return Number(values.renderResolution) || null;
  }

  function avatarOptions() {
    return {
      skin: Number.parseInt(values.avatar.skin, 16),
      hat: values.avatar.hat,
      expression: values.avatar.expression,
      outfit: values.avatar.outfit,
      trousers: Number.parseInt(values.avatar.trousers, 16),
      shoes: values.avatar.shoes,
      accessory: values.avatar.accessory,
    };
  }

  function awardWinnerCoins(amount, rewardId) {
    if (!rewardId || values.rewardedMatches.includes(rewardId)) return false;

    values.rewardedMatches = [...values.rewardedMatches.slice(-49), rewardId];
    values.winnerCoins += Math.max(0, Math.round(amount));
    save();
    renderCosmeticWallet();
    return true;
  }

  function winnerCoins() {
    return values.winnerCoins;
  }

  return {
    init,
    binding,
    matches,
    sensitivity,
    reducedMotion,
    fov,
    modelDetail,
    renderHeight,
    avatarOptions,
    awardWinnerCoins,
    winnerCoins,
  };
})();
