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
    phone: "KeyP",
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
      },
    };
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return {
        ...defaults,
        ...saved,
        bindings: { ...DEFAULT_BINDINGS, ...(saved.bindings || {}) },
        avatar: { ...defaults.avatar, ...(saved.avatar || {}) },
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
    document.querySelector("#exit-game").addEventListener("click", () => {
      const leave = confirm("Exit Hotdog Downs and close this game page?");
      if (leave) location.replace("about:blank");
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
    const controls = {
      skin: document.querySelector("#avatar-skin"),
      hat: document.querySelector("#avatar-hat"),
      expression: document.querySelector("#avatar-expression"),
    };
    Object.entries(controls).forEach(([key, control]) => {
      control.value = values.avatar[key];
      control.addEventListener("change", () => {
        values.avatar[key] = control.value;
        applyAvatarPreview();
        save();
        HD.Stadium?.refreshLocalPlayer?.();
      });
    });
    applyAvatarPreview();
  }

  function applyAvatarPreview() {
    const preview = document.querySelector("#lobby-avatar");
    preview.style.setProperty("--avatar-skin", `#${values.avatar.skin}`);
    preview.dataset.hat = values.avatar.hat;
    preview.dataset.expression = values.avatar.expression;
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
    };
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
  };
})();
