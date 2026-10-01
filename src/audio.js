"use strict";

HD.Audio = (() => {
  const S = HD.state;
  const SAMPLE_URLS = {
    throwWhoosh1: "assets/audio/throw-whoosh-1.wav",
    throwWhoosh2: "assets/audio/throw-whoosh-2.wav",
    throwWhoosh3: "assets/audio/throw-whoosh-3.wav",
    impactSoft1: "assets/audio/impact-soft-1.wav",
    impactSoft2: "assets/audio/impact-soft-2.wav",
    impactHeavy: "assets/audio/impact-heavy.wav",
    horseGallop: "assets/audio/horse-gallop-dirt.mp3",
    uiHover: "assets/audio/ui-hover.ogg",
    uiClick: "assets/audio/ui-click.ogg",
    uiOpen: "assets/audio/ui-open.ogg",
    uiClose: "assets/audio/ui-close.ogg",
    uiConfirm: "assets/audio/ui-confirm.ogg",
    uiError: "assets/audio/ui-error.ogg",
  };
  const MUSIC_URLS = {
    menuMusic: "assets/audio/music-menu.mp3",
  };
  const samples = new Map();

  let context = null;
  let compressor = null;
  let initialized = false;
  let unlocked = false;
  let sampleLoadPromise = null;
  let musicLoadPromise = null;
  let menuMusic = null;
  let gallopLoop = null;
  let lastHoveredControl = null;
  let lastHoverSoundAt = 0;
  let mixerUpdateClock = 0;

  function init() {
    if (initialized) return;
    initialized = true;

    const unlockOnce = () => unlock();
    document.addEventListener("pointerdown", unlockOnce, {
      capture: true,
      once: true,
    });
    document.addEventListener("keydown", unlockOnce, {
      capture: true,
      once: true,
    });
    document.addEventListener("click", (event) => {
      if (event.target.closest("button, [role='button']")) cue("uiClick");
    });
    document.addEventListener("pointerover", handleControlHover, true);
    document.addEventListener("pointerout", handleControlExit, true);
  }

  function handleControlHover(event) {
    const control = event.target.closest(
      "button, [role='button'], select, input[type='range'], input[type='checkbox']",
    );
    if (!control || control.disabled || control === lastHoveredControl) return;

    const now = performance.now();
    lastHoveredControl = control;
    if (now - lastHoverSoundAt < 55) return;
    lastHoverSoundAt = now;
    cue("uiHover");
  }

  function handleControlExit(event) {
    if (!lastHoveredControl) return;
    if (event.relatedTarget && lastHoveredControl.contains(event.relatedTarget)) return;
    lastHoveredControl = null;
  }

  async function unlock() {
    if (!context) createMixer();
    if (!context) return;

    try {
      if (context.state === "suspended") await context.resume();
      unlocked = context.state === "running";
      if (unlocked) {
        cue("stadiumOpen");
        loadSamples();
      }
    } catch {
      unlocked = false;
    }
  }

  function createMixer() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;

    context = new AudioContext({ latencyHint: "interactive" });
    compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -15;
    compressor.knee.value = 18;
    compressor.ratio.value = 5;
    compressor.attack.value = 0.006;
    compressor.release.value = 0.22;

    buses.master = context.createGain();
    buses.music = context.createGain();
    buses.crowd = context.createGain();
    buses.effects = context.createGain();

    buses.music.connect(compressor);
    buses.crowd.connect(compressor);
    buses.effects.connect(compressor);
    compressor.connect(buses.master);
    buses.master.connect(context.destination);

    applySettings(true);
  }

  function loadSamples() {
    if (!context || sampleLoadPromise) return sampleLoadPromise;

    sampleLoadPromise = Promise.all(
      Object.entries(SAMPLE_URLS).map(([name, url]) => loadBuffer(name, url)),
    ).then(() => {
      startGallopLoop();
      const schedule = window.requestIdleCallback || ((callback) => {
        return window.setTimeout(callback, 250);
      });
      schedule(loadMusic);
    });

    return sampleLoadPromise;
  }

  async function loadBuffer(name, url) {
    try {
      const response = await fetch(new URL(url, document.baseURI));
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const bytes = await response.arrayBuffer();
      const buffer = await context.decodeAudioData(bytes);
      samples.set(name, buffer);
      return buffer;
    } catch (error) {
      console.warn(`Could not load audio sample ${name}:`, error);
      return null;
    }
  }

  function loadMusic() {
    if (musicLoadPromise) return musicLoadPromise;

    musicLoadPromise = Promise.all(
      Object.entries(MUSIC_URLS).map(([name, url]) => loadBuffer(name, url)),
    ).then(startMusicLoops);
    return musicLoadPromise;
  }

  function playSample(name, options = {}) {
    const buffer = samples.get(name);
    if (!buffer || !context || context.state === "closed") return null;

    const source = context.createBufferSource();
    const envelope = context.createGain();
    const destination = buses[options.bus || "effects"] || buses.effects;
    const start = context.currentTime + (options.delay || 0);

    source.buffer = buffer;
    source.loop = Boolean(options.loop);
    source.playbackRate.value = options.playbackRate || 1;
    envelope.gain.value = Math.max(0, options.gain ?? 0.3);
    source.connect(envelope);
    envelope.connect(destination);
    source.start(start, options.offset || 0);
    return { source, envelope };
  }

  function startMusicLoops() {
    menuMusic ||= playSample("menuMusic", {
      bus: "music",
      gain: 0,
      loop: true,
    });
    updateMusic();
  }

  function startGallopLoop() {
    if (gallopLoop) return;
    gallopLoop = playSample("horseGallop", {
      bus: "effects",
      gain: 0,
      loop: true,
    });
  }

  function applySettings(immediate = false) {
    if (!context || !HD.Settings?.audioSettings) return;

    const settings = HD.Settings.audioSettings();
    const now = context.currentTime;
    const setGain = (node, value) => {
      if (immediate) node.gain.setValueAtTime(value, now);
      else node.gain.setTargetAtTime(value, now, 0.04);
    };

    setGain(buses.master, settings.muted ? 0 : settings.master);
    setGain(buses.music, settings.music);
    setGain(buses.crowd, settings.crowd);
    setGain(buses.effects, settings.effects);
  }

  function update(dt) {
    if (!context || !unlocked) return;
    mixerUpdateClock -= dt;
    if (mixerUpdateClock > 0) return;
    mixerUpdateClock = 0.1;
    // Gain targets and gallop pitch do not need sixty new automation events
    // per second. Ten updates per second remain perceptually smooth.
    updateGallopLoop();
    updateMusic();
  }

  function updateGallopLoop() {
    if (!gallopLoop) return;
    if (S.phase !== "racing" || !S.horses?.length) {
      gallopLoop.envelope.gain.setTargetAtTime(0, context.currentTime, 0.12);
      return;
    }

    const moving = S.horses
      .map((horse) => horse.userData.data.motionSpeed || 0)
      .filter((speed) => speed > 0.002);
    if (!moving.length) {
      gallopLoop.envelope.gain.setTargetAtTime(0, context.currentTime, 0.12);
      return;
    }

    const average = moving.reduce((sum, speed) => sum + speed, 0) / moving.length;
    const normalized = Math.min(1, average / 0.095);
    gallopLoop.source.playbackRate.setTargetAtTime(
      0.78 + normalized * 0.52,
      context.currentTime,
      0.18,
    );
    gallopLoop.envelope.gain.setTargetAtTime(
      0.11 + normalized * 0.08,
      context.currentTime,
      0.12,
    );
  }

  function updateMusic() {
    if (!menuMusic) return;
    const level = S.matchStarted ? 0 : 0.2;
    menuMusic.envelope.gain.setTargetAtTime(level, context.currentTime, 0.45);
  }

  function cue(name, options = {}) {
    if (!context || !unlocked) return;

    const scale = Number.isFinite(options.scale) ? options.scale : 1;
    const cues = {
      uiHover: () => playSample("uiHover", { gain: 0.11 * scale }),
      uiClick: () => playSample("uiClick", { gain: 0.2 * scale }),
      stadiumOpen: () => playSample("uiOpen", { gain: 0.14 * scale }),
      phoneOpen: () => playSample("uiOpen", { gain: 0.22 * scale }),
      phoneClose: () => playSample("uiClose", { gain: 0.2 * scale }),
      appOpen: () => playSample("uiOpen", { gain: 0.16 * scale, playbackRate: 1.08 }),
      message: () => playSample("uiConfirm", { gain: 0.22 * scale }),
      messageSent: () => playSample("uiConfirm", { gain: 0.18 * scale, playbackRate: 1.08 }),
      error: () => playSample("uiError", { gain: 0.24 * scale }),
      bet: () => playSample("uiConfirm", { gain: 0.24 * scale }),
      purchase: () => playSample("uiConfirm", { gain: 0.24 * scale, playbackRate: 0.96 }),
      moneyGain: () => playSample("uiConfirm", { gain: 0.27, playbackRate: 1.12 }),
      moneySpend: () => playSample("uiClick", { gain: 0.22, playbackRate: 0.9 }),
      delivery: () => playSample("uiConfirm", { gain: 0.3 }),
      throw: () => playRandomSample(
        ["throwWhoosh1", "throwWhoosh2", "throwWhoosh3"],
        {
          gain: 0.34 * scale,
          playbackRate: 0.94 + Math.random() * 0.12,
        },
      ),
      trackImpact: () => playRandomSample(
        ["impactSoft1", "impactSoft2"],
        {
          gain: 0.42 * scale,
          playbackRate: 0.9 + Math.random() * 0.16,
        },
      ),
      glassImpact: () => playSample("impactSoft2", {
        gain: 0.34 * scale,
        playbackRate: 1.28,
      }),
      horseHit: () => playRandomSample(
        ["impactSoft1", "impactSoft2", "impactHeavy"],
        {
          gain: 0.5 * scale,
          playbackRate: 0.9 + Math.random() * 0.13,
        },
      ),
      raceStart: () => playSample("uiConfirm", { gain: 0.28 }),
      finish: () => playSample("uiConfirm", { gain: 0.32, playbackRate: 1.12 }),
      sabotage: () => playSample("impactSoft1", { gain: 0.22, playbackRate: 0.7 }),
    };

    cues[name]?.();
  }

  function playRandomSample(names, options) {
    if (!names.length) return null;
    const name = names[Math.floor(Math.random() * names.length)];
    return playSample(name, options);
  }

  function tone(frequency, duration, options = {}) {
    if (!context || context.state === "closed") return;

    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    const destination = buses[options.bus || "effects"] || buses.effects;
    const start = context.currentTime + (options.delay || 0);
    const gain = Math.max(0.0001, options.gain || 0.03);
    const release = options.release || duration * 0.65;

    oscillator.type = options.type || "sine";
    oscillator.frequency.setValueAtTime(
      frequency * (0.985 + Math.random() * 0.03),
      start,
    );
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(gain, start + 0.008);
    envelope.gain.exponentialRampToValueAtTime(
      0.0001,
      start + duration + release,
    );

    oscillator.connect(envelope);
    envelope.connect(destination);
    oscillator.start(start);
    oscillator.stop(start + duration + release + 0.02);
  }

  function throwItem(type, ambient = false) {
    const scale = ambient ? 0.42 : 1;
    cue("throw", { scale });

    if (type === "airHorn") {
      tone(335, 0.24, {
        gain: 0.045 * scale,
        type: "sawtooth",
      });
    } else if (type === "chair") {
      playSample("impactHeavy", {
        gain: 0.08 * scale,
        playbackRate: 0.72,
      });
    }
  }

  function trackImpact(type, ambient = false) {
    const heavy = type === "chair" || type === "horseshoe" || type === "hurdle";
    const names = heavy
      ? ["impactHeavy", "impactSoft2"]
      : ["impactSoft1", "impactSoft2"];
    playRandomSample(names, {
      gain: (ambient ? 0.18 : 0.4) * (heavy ? 1.16 : 1),
      playbackRate: 0.88 + Math.random() * 0.18,
    });
  }

  function horseImpact(type, horseName, ambient = false) {
    cue("horseHit", { scale: ambient ? 0.42 : 1 });
  }

  function raceStart(announcement) {
    cue("raceStart");
    if (announcement?.startsWith("PADDOCK ALERT")) cue("sabotage");
  }

  function raceFinish() {
    cue("finish");
  }

  return {
    init,
    update,
    applySettings,
    cue,
    throwItem,
    trackImpact,
    horseImpact,
    raceStart,
    raceFinish,
  };
})();
