"use strict";

HD.Audio = (() => {
  const S = HD.state;
  const C = HD.CONFIG;
  const buses = {};
  const commentaryCooldowns = {
    ambient: 15,
    leader: 8,
    lap: 5,
    critical: 0,
  };

  let context = null;
  let compressor = null;
  let ambienceGain = null;
  let noiseBuffer = null;
  let initialized = false;
  let unlocked = false;
  let ducked = false;
  let hoofTimer = 0;
  let musicTimer = 2;
  let commentaryTimer = 7;
  let commentaryPriority = -1;
  let lastCommentaryAt = -Infinity;
  let previousPhase = "";
  let previousLeader = -1;
  let announcedLap = 0;
  let announcedFinalStretch = false;

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
  }

  async function unlock() {
    if (!context) createMixer();
    if (!context) return;

    try {
      if (context.state === "suspended") await context.resume();
      unlocked = context.state === "running";
      if (unlocked) cue("stadiumOpen");
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
    buses.commentator = context.createGain();

    buses.music.connect(compressor);
    buses.crowd.connect(compressor);
    buses.effects.connect(compressor);
    buses.commentator.connect(compressor);
    compressor.connect(buses.master);
    buses.master.connect(context.destination);

    noiseBuffer = createNoiseBuffer(2.5);
    createStadiumBed();
    applySettings(true);
  }

  function createNoiseBuffer(seconds) {
    const frameCount = Math.ceil(context.sampleRate * seconds);
    const buffer = context.createBuffer(1, frameCount, context.sampleRate);
    const samples = buffer.getChannelData(0);
    let previous = 0;

    for (let index = 0; index < frameCount; index++) {
      const white = Math.random() * 2 - 1;
      previous = previous * 0.84 + white * 0.16;
      samples[index] = previous;
    }

    return buffer;
  }

  function createStadiumBed() {
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();

    ambienceGain = context.createGain();
    source.buffer = noiseBuffer;
    source.loop = true;
    filter.type = "bandpass";
    filter.frequency.value = 720;
    filter.Q.value = 0.52;
    ambienceGain.gain.value = 0.012;

    source.connect(filter);
    filter.connect(ambienceGain);
    ambienceGain.connect(buses.crowd);
    source.start();
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
    setGain(buses.music, settings.music * (ducked ? 0.24 : 1));
    setGain(buses.crowd, settings.crowd * (ducked ? 0.34 : 1));
    setGain(buses.effects, settings.effects);
    setGain(buses.commentator, settings.commentator);
  }

  function update(dt) {
    if (!context || !unlocked) return;

    updateAmbience();
    updateHooves(dt);
    updateMusic(dt);
    updateCommentary(dt);
  }

  function updateAmbience() {
    const horses = S.horses || [];
    const leaderProgress = horses.length
      ? Math.max(...horses.map((horse) => horse.userData.data.progress || 0))
      : 0;
    const finalStretch = leaderProgress > C.raceLaps - 0.34;
    const target = S.phase === "racing"
      ? finalStretch
        ? 0.15
        : 0.085
      : S.phase === "finished"
        ? 0.11
        : S.matchStarted
          ? 0.045
          : 0.018;

    ambienceGain.gain.setTargetAtTime(target, context.currentTime, 0.65);
  }

  function updateHooves(dt) {
    if (S.phase !== "racing" || !S.horses?.length) {
      hoofTimer = 0;
      return;
    }

    const moving = S.horses
      .map((horse) => horse.userData.data.motionSpeed || 0)
      .filter((speed) => speed > 0.002);
    if (!moving.length) return;

    const average = moving.reduce((sum, speed) => sum + speed, 0) / moving.length;
    const normalized = Math.min(1, average / 0.095);
    hoofTimer -= dt;
    if (hoofTimer > 0) return;

    hoofTimer = 0.27 - normalized * 0.14;
    hoofCluster(normalized);
  }

  function hoofCluster(speed) {
    const volume = 0.018 + speed * 0.022;
    const pitch = 115 + speed * 55 + Math.random() * 12;

    tone(pitch, 0.045, {
      bus: "effects",
      gain: volume,
      type: "triangle",
    });
    noise(0.038, {
      bus: "effects",
      gain: volume * 0.7,
      frequency: 520,
      delay: 0.028,
    });
  }

  function updateMusic(dt) {
    musicTimer -= dt;
    if (musicTimer > 0) return;

    if (S.phase === "racing") {
      const progress = leadingProgress();
      const urgent = progress > C.raceLaps - 0.5;
      playRacePulse(urgent);
      musicTimer = urgent ? 2.4 : 4.8;
      return;
    }

    if (S.phase === "betting" || S.phase === "roundBreak") {
      playConcourseChord();
      musicTimer = 8.5;
      return;
    }

    musicTimer = 5;
  }

  function playRacePulse(urgent) {
    const root = urgent ? 110 : 98;
    const notes = urgent ? [1, 1.5, 2, 1.5] : [1, 1.25, 1.5];

    notes.forEach((ratio, index) => {
      tone(root * ratio, 0.19, {
        bus: "music",
        delay: index * 0.17,
        gain: urgent ? 0.025 : 0.017,
        type: "triangle",
      });
    });
  }

  function playConcourseChord() {
    [130.81, 164.81, 196].forEach((frequency, index) => {
      tone(frequency, 1.4, {
        bus: "music",
        delay: index * 0.055,
        gain: 0.009,
        type: "sine",
        release: 1.2,
      });
    });
  }

  function cue(name, options = {}) {
    if (!context || !unlocked) return;

    const scale = Number.isFinite(options.scale) ? options.scale : 1;
    const cues = {
      uiClick: () => tone(520, 0.035, { gain: 0.022 * scale }),
      stadiumOpen: () => tone(392, 0.12, { gain: 0.025, type: "sine" }),
      phoneOpen: () => twoTone(660, 880, 0.038, 0.035 * scale),
      phoneClose: () => twoTone(720, 520, 0.035, 0.026 * scale),
      appOpen: () => twoTone(520, 680, 0.025, 0.02 * scale),
      message: () => twoTone(784, 1047, 0.065, 0.04 * scale),
      messageSent: () => twoTone(620, 830, 0.04, 0.028 * scale),
      error: () => twoTone(210, 165, 0.09, 0.04 * scale),
      bet: () => twoTone(330, 495, 0.07, 0.044 * scale),
      purchase: () => twoTone(440, 660, 0.055, 0.04 * scale),
      moneyGain: () => coinCascade(false),
      moneySpend: () => coinCascade(true),
      delivery: () => twoTone(660, 990, 0.1, 0.05 * scale),
      throw: () => noise(0.12, {
        gain: 0.055 * scale,
        frequency: 1250,
      }),
      trackImpact: () => impact(96, 0.075 * scale),
      horseHit: () => impact(145, 0.09 * scale),
      raceStart: () => raceStartFanfare(),
      finish: () => finishFanfare(),
      sabotage: () => twoTone(155, 116, 0.18, 0.06 * scale),
    };

    cues[name]?.();
  }

  function twoTone(first, second, duration, gain) {
    tone(first, duration, { gain, type: "sine" });
    tone(second, duration * 1.2, {
      gain,
      delay: duration * 0.72,
      type: "sine",
    });
  }

  function coinCascade(descending) {
    const frequencies = descending ? [820, 650, 520] : [520, 650, 820];
    frequencies.forEach((frequency, index) => {
      tone(frequency, 0.055, {
        gain: 0.033,
        delay: index * 0.055,
        type: "square",
      });
    });
  }

  function impact(frequency, gain) {
    tone(frequency, 0.13, {
      gain,
      type: "sine",
      release: 0.12,
    });
    noise(0.1, {
      gain: gain * 0.72,
      frequency: frequency * 5,
    });
  }

  function raceStartFanfare() {
    [392, 523.25, 659.25].forEach((frequency, index) => {
      tone(frequency, 0.16, {
        bus: "commentator",
        gain: 0.055,
        delay: index * 0.115,
        type: "sawtooth",
      });
    });
  }

  function finishFanfare() {
    [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
      tone(frequency, 0.23, {
        bus: "music",
        gain: 0.045,
        delay: index * 0.13,
        type: "triangle",
      });
    });
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

  function noise(duration, options = {}) {
    if (!context || !noiseBuffer) return;

    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    const destination = buses[options.bus || "effects"] || buses.effects;
    const start = context.currentTime + (options.delay || 0);
    const gain = Math.max(0.0001, options.gain || 0.035);

    source.buffer = noiseBuffer;
    filter.type = options.filterType || "lowpass";
    filter.frequency.value = options.frequency || 900;
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(gain, start + 0.006);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(destination);
    source.start(start, Math.random() * 1.5, duration + 0.02);
  }

  function throwItem(type, ambient = false) {
    const scale = ambient ? 0.42 : 1;
    cue("throw", { scale });

    if (type === "airHorn") {
      tone(335, 0.24, {
        gain: 0.045 * scale,
        type: "sawtooth",
      });
    } else if (type === "soda") {
      noise(0.16, {
        gain: 0.035 * scale,
        frequency: 2400,
        filterType: "highpass",
      });
    } else if (type === "chair") {
      tone(88, 0.1, { gain: 0.045 * scale, type: "triangle" });
    }
  }

  function trackImpact(type, ambient = false) {
    const heavy = type === "chair" || type === "horseshoe";
    cue("trackImpact", { scale: (ambient ? 0.36 : 0.72) * (heavy ? 1.25 : 1) });
  }

  function horseImpact(type, horseName, ambient = false) {
    cue("horseHit", { scale: ambient ? 0.42 : 1 });
    if (!ambient && Math.random() < 0.3) {
      tone(420, 0.18, {
        gain: 0.025,
        type: "sawtooth",
      });
    }

    if (!ambient && type === "airHorn") {
      commentate(`${horseName} shies away from the horn!`, "leader");
    }
  }

  function raceStart(announcement) {
    previousLeader = -1;
    announcedLap = 0;
    announcedFinalStretch = false;
    commentaryTimer = 8 + Math.random() * 4;
    cue("raceStart");

    if (announcement?.startsWith("PADDOCK ALERT")) {
      cue("sabotage");
      commentate(announcement.split(" Live betting")[0], "critical");
    } else {
      commentate("They're off at Hotdog Downs!", "critical");
    }
  }

  function raceFinish(winner, closeFinish = false) {
    cue("finish");
    const result = closeFinish
      ? `${winner.name} wins it in a photo finish!`
      : `${winner.name} crosses the line first!`;
    commentate(result, "critical");
  }

  function updateCommentary(dt) {
    if (previousPhase !== S.phase) {
      previousPhase = S.phase;
      if (S.phase !== "racing") previousLeader = -1;
    }
    if (S.phase !== "racing" || !S.horses?.length) return;

    commentaryTimer -= dt;
    const ordered = [...S.horses].sort(
      (a, b) => b.userData.data.progress - a.userData.data.progress,
    );
    const leader = ordered[0].userData.data;
    const runnerUp = ordered[1]?.userData.data;
    const leaderLap = Math.min(C.raceLaps, Math.floor(leader.progress) + 1);

    if (leader.index !== previousLeader && S.raceTime > 4) {
      previousLeader = leader.index;
      commentate(`${leader.name} takes the lead!`, "leader");
      commentaryTimer = 7 + Math.random() * 5;
    } else if (previousLeader < 0) {
      previousLeader = leader.index;
    }

    if (leaderLap > announcedLap && leaderLap > 1 && leaderLap <= C.raceLaps) {
      announcedLap = leaderLap;
      const phrase = leaderLap === C.raceLaps
        ? `The field begins the final lap with ${leader.name} in front.`
        : `${leader.name} leads them onto lap ${leaderLap}.`;
      commentate(phrase, "lap");
    }

    if (!announcedFinalStretch && leader.progress > C.raceLaps - 0.28) {
      announcedFinalStretch = true;
      commentate(`${leader.name} turns for home. Here comes the field!`, "critical");
    }

    if (commentaryTimer > 0) return;
    commentaryTimer = 10 + Math.random() * 7;
    const gap = runnerUp ? leader.progress - runnerUp.progress : 1;
    const phrase = gap < 0.025 && runnerUp
      ? `${runnerUp.name} is right at ${leader.name}'s shoulder.`
      : `${leader.name} controls the pace, but there is still plenty of racing left.`;
    commentate(phrase, "ambient");
  }

  function commentate(text, priorityName = "ambient") {
    if (!text || !context || !unlocked) return false;

    const settings = HD.Settings.audioSettings();
    if (settings.muted || settings.commentator <= 0) return false;

    const priorities = { ambient: 0, leader: 1, lap: 2, critical: 3 };
    const priority = priorities[priorityName] ?? 0;
    const elapsed = performance.now() / 1000 - lastCommentaryAt;
    if (elapsed < commentaryCooldowns[priorityName] && priority < 3) return false;
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
      paChime();
      return false;
    }

    const speech = window.speechSynthesis;
    if (speech.speaking && priority <= commentaryPriority) return false;

    if (speech.speaking) speech.cancel();
    const utterance = new window.SpeechSynthesisUtterance(text);
    utterance.rate = 1.08;
    utterance.pitch = 0.84;
    utterance.volume = Math.min(1, settings.master * settings.commentator);
    const voice = preferredVoice();
    if (voice) utterance.voice = voice;

    commentaryPriority = priority;
    lastCommentaryAt = performance.now() / 1000;
    setDucked(true);
    paChime();
    utterance.onend = finishCommentary;
    utterance.onerror = finishCommentary;
    speech.speak(utterance);
    return true;
  }

  function preferredVoice() {
    const voices = window.speechSynthesis.getVoices();
    return voices.find((voice) =>
      /^en(-|_)/i.test(voice.lang) && /male|daniel|david|mark|guy/i.test(voice.name),
    ) || voices.find((voice) => /^en(-|_)/i.test(voice.lang));
  }

  function paChime() {
    tone(740, 0.065, {
      bus: "commentator",
      gain: 0.035,
      type: "sine",
    });
    tone(930, 0.08, {
      bus: "commentator",
      delay: 0.07,
      gain: 0.03,
      type: "sine",
    });
  }

  function finishCommentary() {
    commentaryPriority = -1;
    setDucked(false);
  }

  function setDucked(value) {
    ducked = value;
    applySettings();
  }

  function leadingProgress() {
    if (!S.horses?.length) return 0;
    return Math.max(...S.horses.map((horse) => horse.userData.data.progress || 0));
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
    commentate,
  };
})();
