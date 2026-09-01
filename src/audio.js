"use strict";

HD.Audio = (() => {
  const S = HD.state;
  const C = HD.CONFIG;
  const buses = {};
  const COMMENTARY_PRIORITIES = {
    ambient: 0,
    leader: 1,
    lap: 2,
    critical: 3,
  };
  const CATEGORY_COOLDOWNS = {
    betting: 9,
    progress: 7,
    closeRace: 7,
    leaderChange: 5,
    overtake: 6,
    longshot: 10,
    favorite: 11,
    falling: 9,
    surge: 8,
    interference: 4,
    leaderHit: 3,
    miss: 9,
    sabotage: 0,
    lap: 3,
    finalStretch: 0,
    result: 0,
  };
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
    raceMusic: "assets/audio/music-race.ogg",
  };
  const samples = new Map();

  let context = null;
  let compressor = null;
  let initialized = false;
  let unlocked = false;
  let ducked = false;
  let commentaryTimer = 7;
  let commentaryPriority = -1;
  let commentaryToken = 0;
  let commentaryQueue = [];
  let previousPhase = "";
  let previousLeader = -1;
  let previousRanks = new Map();
  let previousSpeeds = new Map();
  let announcedLap = 0;
  let announcedFinalStretch = false;
  let lastCategoryTimes = new Map();
  let recentCommentary = [];
  let repeatedHits = new Map();
  let sampleLoadPromise = null;
  let musicLoadPromise = null;
  let menuMusic = null;
  let raceMusic = null;
  let gallopLoop = null;
  let commentarySpeaking = false;
  let activeCommentarySource = null;
  let commentatorWorker = null;
  let commentatorReady = false;
  let commentatorFailed = false;
  let pendingSpeechToken = 0;
  let lastHoveredControl = null;
  let lastHoverSoundAt = 0;

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
    startCommentatorWorker();
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
    buses.commentator = context.createGain();

    buses.music.connect(compressor);
    buses.crowd.connect(compressor);
    buses.effects.connect(compressor);
    buses.commentator.connect(compressor);
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
    raceMusic ||= playSample("raceMusic", {
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
    setGain(buses.music, settings.music * (ducked ? 0.24 : 1));
    setGain(buses.crowd, settings.crowd * (ducked ? 0.34 : 1));
    setGain(buses.effects, settings.effects);
    setGain(buses.commentator, settings.commentator);
  }

  function update(dt) {
    if (!context || !unlocked) return;

    updateGallopLoop();
    updateMusic();
    updateCommentary(dt);
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
    if (!menuMusic || !raceMusic) return;

    const menuVisible = !document.querySelector("#game-menu")?.classList.contains("closed");
    const playMenuTrack = menuVisible || !S.matchStarted;
    const menuLevel = playMenuTrack ? 0.2 : 0;
    const raceLevel = playMenuTrack ? 0 : S.phase === "racing" ? 0.18 : 0.12;

    menuMusic.envelope.gain.setTargetAtTime(menuLevel, context.currentTime, 0.45);
    raceMusic.envelope.gain.setTargetAtTime(raceLevel, context.currentTime, 0.45);
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
      raceStart: () => playSample("uiConfirm", { bus: "music", gain: 0.28 }),
      finish: () => playSample("uiConfirm", { bus: "music", gain: 0.32, playbackRate: 1.12 }),
      sabotage: () => playSample("impactSoft1", { gain: 0.22, playbackRate: 0.7 }),
    };

    cues[name]?.();
  }

  function playRandomSample(names, options) {
    if (!names.length) return null;
    const name = names[Math.floor(Math.random() * names.length)];
    return playSample(name, options);
  }

  function crowdReaction() {
    // Stadium crowd beds were intentionally replaced with music.
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

  function horseImpact(type, horseName, ambient = false, options = {}) {
    cue("horseHit", { scale: ambient ? 0.42 : 1 });
    crowdReaction("groan", ambient ? 0.22 : 0.52);

    const hitCount = (repeatedHits.get(horseName) || 0) + 1;
    repeatedHits.set(horseName, hitCount);
    if (ambient && Math.random() > 0.58) return;

    const itemName = C.items[type]?.name || "flying object";
    const contextData = commentaryContext({
      horseName,
      itemName,
      hitCount,
      impactEffect: C.items[type]?.effect || "chaos",
    });
    const category = options.wasLeader
      ? "leaderHit"
      : "interference";

    commentateCategory(
      category,
      options.wasLeader ? "lap" : "leader",
      contextData,
    );
  }

  function notifyMiss(type) {
    if (Math.random() > 0.58) return;

    commentateCategory(
      "miss",
      "ambient",
      commentaryContext({
        itemName: C.items[type]?.name || "projectile",
      }),
    );
  }

  const COMMENTARY_LINES = {
    intro: [
      (race) => `The gates are open, and ${race.leader.name} breaks sharply!`,
      () => "They're racing at Hotdog Downs, and already the grandstand is restless!",
      (race) => `${race.favorite.name} is the favorite, but six horses have a chance as they get underway.`,
      () => "The field is away cleanly. Keep one eye on the track and one eye on the crowd!",
    ],
    betting: [
      (race) => `${race.favorite.name} is the ${race.favorite.startingOdds} to one favorite on the fixed board.`,
      (race) => `${race.longshot.name} offers ${race.longshot.startingOdds} to one for anyone feeling brave.`,
      (race) => `The next field is taking shape, with ${race.favorite.name} attracting most of the early money.`,
      (race) => `${race.longshot.name} is the outsider in this group, but stranger things happen here every day.`,
      () => "Forty-five seconds between races: plenty of time to bet, shop, or make a very questionable deal.",
      () => "The fixed book is posted. Live prices will move only after the race begins.",
    ],
    progress: [
      (race) => `${race.leader.name} shows the way through the ${race.section}, with ${race.runner.name} tracking closely.`,
      (race) => `${race.leader.name} leads, ${race.runner.name} is second, and ${race.third.name} holds third.`,
      (race) => `They remain tightly grouped on lap ${race.lap}, and nobody has settled this yet.`,
      (race) => `${race.runner.name} continues to shadow ${race.leader.name} as they sweep around the oval.`,
      (race) => `${race.leader.name} has the advantage for now, but the chasing pack is still well within range.`,
      (race) => `Down the ${race.section} they go, with ${race.leader.name} setting the tempo.`,
    ],
    closeRace: [
      (race) => `${race.runner.name} is right on ${race.leader.name}'s shoulder!`,
      (race) => `Almost nothing separates ${race.leader.name} and ${race.runner.name} at the front.`,
      (race) => `${race.leader.name} clings to a narrow lead, and ${race.runner.name} is asking the question.`,
      (race) => `This is developing into a duel between ${race.leader.name} and ${race.runner.name}.`,
      () => "The leaders could fit beneath one blanket. This is still anybody's race.",
    ],
    leaderChange: [
      (race) => `${race.leader.name} sweeps past and takes command!`,
      (race) => `New leader! ${race.leader.name} finds another gear.`,
      (race) => `${race.leader.name} has gone to the front, and the crowd responds!`,
      (race) => `The lead changes hands as ${race.leader.name} surges through!`,
      (race) => `${race.leader.name} claims the advantage from ${race.runner.name}.`,
    ],
    overtake: [
      (race) => `${race.mover.name} threads through traffic and gains two places!`,
      (race) => `A sharp move from ${race.mover.name}, climbing rapidly through the order.`,
      (race) => `${race.mover.name} is picking them off and moving into contention.`,
      (race) => `Watch ${race.mover.name}; that lane change has opened the door.`,
    ],
    longshot: [
      (race) => `The outsider ${race.leader.name} is in front at ${race.leader.startingOdds} to one!`,
      (race) => `${race.leader.name} is trying to turn the odds board upside down.`,
      (race) => `A longshot leads Hotdog Downs, and the betting slips are trembling.`,
      (race) => `${race.leader.name} was overlooked before the start, but cannot be ignored now.`,
    ],
    favorite: [
      (race) => `The favorite ${race.favorite.name} is back in ${race.favoriteRankText}, with work to do.`,
      (race) => `${race.favorite.name} is not finding the expected pace so far.`,
      (race) => `Backers of ${race.favorite.name} are getting nervous; the favorite is losing ground.`,
      (race) => `${race.favorite.name} needs a response, and needs it soon.`,
    ],
    falling: [
      (race) => `${race.faller.name} is fading and has dropped through the field.`,
      (race) => `Trouble for ${race.faller.name}, who suddenly loses two positions.`,
      (race) => `${race.faller.name} cannot hold the pace and slips backward.`,
    ],
    surge: [
      (race) => `${race.mover.name} is flying now, producing the fastest burst on the track!`,
      (race) => `Here comes ${race.mover.name} with a powerful run!`,
      (race) => `${race.mover.name} has found another gear and is closing quickly.`,
      (race) => `A serious turn of speed from ${race.mover.name}; the leaders had better respond.`,
    ],
    interference: [
      (race) => `WHERE did that ${race.itemName.toLowerCase()} come from? And what are the odds it actually hit ${race.horseName}!`,
      (race) => `A flying ${race.itemName.toLowerCase()} has just found ${race.horseName}! I have called races for years, and I have absolutely no explanation for that!`,
      (race) => `That was airborne concession food! ${race.horseName} never saw it coming, and frankly, neither did I!`,
      (race) => `SOMEBODY has launched a ${race.itemName.toLowerCase()} onto the course, and it has hit ${race.horseName}! This place has lost its mind!`,
      (race) => `${race.horseName} has been hit again! Again! At this point the grandstand may be the seventh horse in the race!`,
      (race) => `A direct hit on ${race.horseName} with a ${race.itemName.toLowerCase()}! The stewards are staring at one another in complete disbelief!`,
      (race) => `I cannot believe what I am seeing! A ${race.itemName.toLowerCase()} flew out of nowhere and clobbered ${race.horseName}!`,
    ],
    leaderHit: [
      (race) => `THE LEADER HAS BEEN HIT! A ${race.itemName.toLowerCase()} has come sailing out of the seats and struck ${race.horseName} in full stride!`,
      (race) => `Oh, this is unbelievable! ${race.horseName} was leading the race, and now a ${race.itemName.toLowerCase()} may have changed everything!`,
      (race) => `A direct hit on the leader! ${race.horseName} is trying to recover while the entire stadium erupts!`,
      (race) => `Where did they even GET that ${race.itemName.toLowerCase()}? ${race.horseName} takes the hit, and this race has been turned upside down!`,
      (race) => `CHAOS at the front! ${race.horseName} is struck from the grandstand, and the chasing field is suddenly right there!`,
    ],
    miss: [
      (race) => `A ${race.itemName.toLowerCase()} lands harmlessly in the dirt.`,
      () => "That throw misses every horse. The track crew will enjoy cleaning that up.",
      () => "Wide of the target, and another piece of stadium food joins the racing surface.",
      () => "A hopeful throw from the seats, but no contact this time.",
    ],
    sabotage: [
      (race) => race.sabotageText,
      () => "There has been a paddock incident before the start. Officials are investigating, rather slowly.",
      () => "Sabotage has been reported. This meeting has taken a deeply unusual turn.",
    ],
    lap: [
      (race) => `${race.leader.name} leads the field onto lap ${race.lap}.`,
      (race) => `One circuit complete, and ${race.leader.name} remains the horse to catch.`,
      (race) => `They cross the line for lap ${race.lap}, led by ${race.leader.name}.`,
      (race) => `${race.leader.name} begins lap ${race.lap} with ${race.runner.name} in pursuit.`,
    ],
    finalLap: [
      (race) => `The bell lap begins! ${race.leader.name} leads, but the field is closing.`,
      (race) => `Final lap at Hotdog Downs, with ${race.leader.name} narrowly in front!`,
      (race) => `One circuit remains. ${race.runner.name} is hunting down ${race.leader.name}.`,
    ],
    finalStretch: [
      (race) => `They turn for home! ${race.leader.name} leads, and ${race.runner.name} is coming!`,
      (race) => `Into the final stretch, ${race.leader.name} by the smallest of margins!`,
      (race) => `Here comes the field! ${race.leader.name} has to find the line.`,
      (race) => `${race.leader.name} in front, ${race.runner.name} driving hard, and the crowd is on its feet!`,
    ],
    result: [
      (race) => `${race.winnerName} wins at Hotdog Downs!`,
      (race) => `${race.winnerName} gets there first after an extraordinary race!`,
      (race) => `Victory for ${race.winnerName}, surviving both the field and the grandstand!`,
    ],
    photo: [
      (race) => `${race.winnerName} wins a photo finish! That was desperately close.`,
      (race) => `A photo at the line, and ${race.winnerName} has it by the narrowest margin!`,
      (race) => `${race.winnerName} gets the verdict in a breathtaking photo finish!`,
    ],
  };

  function raceStart(announcement) {
    previousLeader = -1;
    previousRanks = new Map();
    previousSpeeds = new Map();
    repeatedHits = new Map();
    announcedLap = 0;
    announcedFinalStretch = false;
    commentaryQueue = [];
    commentaryTimer = 3.5;
    cue("raceStart");
    crowdReaction("cheer", 0.7);

    const race = commentaryContext();
    if (announcement?.startsWith("PADDOCK ALERT")) {
      cue("sabotage");
      const sabotageText = announcement
        .split(" Live betting")[0]
        .replace("PADDOCK ALERT:", "Paddock alert:");
      commentateCategory(
        "sabotage",
        "critical",
        { ...race, sabotageText },
        true,
      );
      queueCategory("intro", "leader", race);
    } else {
      commentateCategory("intro", "critical", race, true);
    }
  }

  function raceFinish(winner, closeFinish = false) {
    cue("finish");
    crowdReaction("cheer", 1);
    commentaryQueue = [];
    commentateCategory(
      closeFinish ? "photo" : "result",
      "critical",
      commentaryContext({ winnerName: winner.name }),
      true,
    );
  }

  function updateCommentary(dt) {
    if (previousPhase !== S.phase) {
      previousPhase = S.phase;
      commentaryTimer = S.phase === "betting" ? 3 + Math.random() * 2 : 2.5;
      if (S.phase !== "racing") {
        previousLeader = -1;
        previousRanks = new Map();
        previousSpeeds = new Map();
      }
    }

    if (!S.horses?.length) return;

    commentaryTimer -= dt;

    if (S.phase === "betting") {
      if (S.matchStarted && commentaryTimer <= 0) {
        commentateCategory("betting", "ambient", commentaryContext());
        commentaryTimer = 7 + Math.random() * 3;
      }
      return;
    }

    if (S.phase !== "racing") return;

    const ordered = [...S.horses].sort(
      (a, b) => b.userData.data.progress - a.userData.data.progress,
    );
    const leader = ordered[0].userData.data;
    const contextData = commentaryContext();
    const leaderLap = Math.min(C.raceLaps, Math.floor(leader.progress) + 1);
    const currentRanks = new Map(
      ordered.map((horse, index) => [horse.userData.data.id, index]),
    );

    if (leader.index !== previousLeader && S.raceTime > 4) {
      previousLeader = leader.index;
      crowdReaction("cheer", 0.68);
      commentateCategory("leaderChange", "lap", contextData);
      commentaryTimer = 3 + Math.random() * 2;
    } else if (previousLeader < 0) {
      previousLeader = leader.index;
    }

    if (leaderLap > announcedLap && leaderLap > 1 && leaderLap <= C.raceLaps) {
      announcedLap = leaderLap;
      const category = leaderLap === C.raceLaps ? "finalLap" : "lap";
      crowdReaction("rise", leaderLap === C.raceLaps ? 0.7 : 0.42);
      commentateCategory(category, "lap", contextData, true);
    }

    if (!announcedFinalStretch && leader.progress > C.raceLaps - 0.28) {
      announcedFinalStretch = true;
      crowdReaction("cheer", 0.9);
      commentateCategory("finalStretch", "critical", contextData, true);
    }

    if (S.raceTime > 5 && previousRanks.size) {
      const movement = ordered.map((horse, rank) => {
        const data = horse.userData.data;
        const previousRank = previousRanks.get(data.id) ?? rank;
        return {
          data,
          gained: previousRank - rank,
          lost: rank - previousRank,
        };
      });
      const mover = movement.sort((a, b) => b.gained - a.gained)[0];
      const faller = movement.sort((a, b) => b.lost - a.lost)[0];

      if (mover?.gained >= 2) {
        commentateCategory(
          "overtake",
          "leader",
          { ...contextData, mover: mover.data },
        );
      } else if (faller?.lost >= 2) {
        commentateCategory(
          "falling",
          "leader",
          { ...contextData, faller: faller.data },
        );
      }
    }

    const fastestSurge = ordered
      .map((horse) => horse.userData.data)
      .find((data) => {
        const previousSpeed = previousSpeeds.get(data.id) || data.motionSpeed;
        const surging = data.motionSpeed > data.baseSpeed * 1.16 &&
          data.motionSpeed > previousSpeed * 1.03;
        return surging;
      });
    if (fastestSurge) {
      commentateCategory(
        "surge",
        "leader",
        { ...contextData, mover: fastestSurge },
      );
    }

    previousRanks = currentRanks;
    previousSpeeds = new Map(
      ordered.map((horse) => {
        const data = horse.userData.data;
        return [data.id, data.motionSpeed || 0];
      }),
    );

    if (commentaryTimer > 0) return;

    const category = chooseProgressCategory(contextData);
    const spoken = commentateCategory(category, "ambient", contextData);
    commentaryTimer = spoken ? 4 + Math.random() * 2.5 : 1;
  }

  function chooseProgressCategory(race) {
    if (race.gap < 0.022) return "closeRace";
    if (race.leader.startingOdds >= 10) return "longshot";
    if (race.favoriteRank >= 3) return "favorite";
    return "progress";
  }

  function commentaryContext(extra = {}) {
    const ordered = [...(S.horses || [])]
      .map((horse) => horse.userData.data)
      .sort((a, b) => b.progress - a.progress);
    const fallback = {
      name: "the field",
      progress: 0,
      startingOdds: 1,
    };
    const leader = ordered[0] || fallback;
    const runner = ordered[1] || leader;
    const third = ordered[2] || runner;
    const favorite = [...ordered].sort((a, b) => {
      return a.startingOdds - b.startingOdds;
    })[0] || leader;
    const longshot = [...ordered].sort((a, b) => {
      return b.startingOdds - a.startingOdds;
    })[0] || leader;
    const favoriteRank = Math.max(0, ordered.indexOf(favorite));
    const favoriteRankNames = [
      "first",
      "second",
      "third",
      "fourth",
      "fifth",
      "sixth",
    ];
    const sections = [
      "home straight",
      "first turn",
      "backstretch",
      "far turn",
    ];
    const lapFraction = ((leader.progress % 1) + 1) % 1;
    const section = sections[Math.min(3, Math.floor(lapFraction * 4))];

    return {
      ordered,
      leader,
      runner,
      third,
      favorite,
      longshot,
      favoriteRank,
      favoriteRankText: favoriteRankNames[favoriteRank] || "the rear",
      gap: Math.max(0, leader.progress - runner.progress),
      lap: Math.min(C.raceLaps, Math.floor(leader.progress) + 1),
      section,
      ...extra,
    };
  }

  function commentateCategory(category, priorityName, race, force = false) {
    const now = clockSeconds();
    const cooldown = CATEGORY_COOLDOWNS[category] || 0;
    const previousTime = lastCategoryTimes.get(category) ?? -Infinity;

    if (!force && now - previousTime < cooldown) return false;

    const text = pickCommentaryLine(category, race || commentaryContext());
    if (!text) return false;

    const accepted = commentate(text, priorityName, category);
    if (accepted) lastCategoryTimes.set(category, now);
    return accepted;
  }

  function queueCategory(category, priorityName, race) {
    const text = pickCommentaryLine(category, race || commentaryContext());
    if (!text) return;
    enqueueCommentary(text, priorityName, category);
  }

  function pickCommentaryLine(category, race) {
    const lines = COMMENTARY_LINES[category];
    if (!lines?.length) return "";

    const candidates = lines
      .map((line) => line(race))
      .filter((line) => line && !recentCommentary.includes(line));
    const available = candidates.length
      ? candidates
      : lines.map((line) => line(race)).filter(Boolean);
    const text = available[Math.floor(Math.random() * available.length)] || "";

    recentCommentary.push(text);
    recentCommentary = recentCommentary.slice(-10);
    return text;
  }

  function commentate(text, priorityName = "ambient", category = "progress") {
    if (!text || !context || !unlocked) return false;

    const settings = HD.Settings.audioSettings();
    if (settings.muted || settings.commentator <= 0) return false;

    const priority = COMMENTARY_PRIORITIES[priorityName] ?? 0;
    if (!commentatorReady) {
      if (!commentatorFailed) enqueueCommentary(text, priorityName, category);
      return !commentatorFailed;
    }
    if (commentarySpeaking) {
      enqueueCommentary(text, priorityName, category);
      return true;
    }

    const token = ++commentaryToken;
    commentarySpeaking = true;
    commentaryPriority = priority;
    pendingSpeechToken = token;
    commentatorWorker.postMessage({
      type: "speak",
      id: token,
      text,
      urgent: category === "finalStretch" || category === "photo",
    });
    return true;
  }

  function startCommentatorWorker() {
    if (commentatorWorker || commentatorFailed) return;

    try {
      document.documentElement.dataset.commentator = "loading";
      commentatorWorker = new Worker(
        new URL("src/commentator-worker.js", document.baseURI),
        { type: "module", name: "hotdog-downs-commentator" },
      );
      commentatorWorker.addEventListener("message", handleCommentatorMessage);
      commentatorWorker.addEventListener("error", (event) => {
        failCommentator(event.message || "The speech worker stopped unexpectedly.");
      });
    } catch (error) {
      failCommentator(error?.message || String(error));
    }
  }

  function handleCommentatorMessage(event) {
    const message = event.data || {};

    if (message.type === "ready") {
      commentatorReady = true;
      commentatorFailed = false;
      document.documentElement.dataset.commentator = "ready";
      pumpCommentaryQueue();
      return;
    }
    if (message.type === "load-error") {
      failCommentator(message.message);
      return;
    }
    if (message.type === "speech-error") {
      if (message.id === pendingSpeechToken) finishCommentary(message.id);
      console.error("Commentator generation failed:", message.message);
      return;
    }
    if (message.type !== "speech" || message.id !== pendingSpeechToken) return;

    playCommentatorAudio(
      new Float32Array(message.samples),
      message.sampleRate,
      message.id,
    );
  }

  function failCommentator(message) {
    commentatorFailed = true;
    commentatorReady = false;
    document.documentElement.dataset.commentator = "error";
    commentaryQueue = [];
    if (commentarySpeaking) finishCommentary(pendingSpeechToken);
    console.error("Kokoro commentator unavailable:", message);
  }

  function playCommentatorAudio(samplesData, sampleRate, token) {
    if (token !== commentaryToken || !commentarySpeaking) return;

    const buffer = context.createBuffer(1, samplesData.length, sampleRate);
    buffer.copyToChannel(samplesData, 0);

    const source = context.createBufferSource();
    const highPass = context.createBiquadFilter();
    const lowPass = context.createBiquadFilter();
    const presence = context.createBiquadFilter();
    const megaphoneDrive = context.createWaveShaper();
    const paCompressor = context.createDynamicsCompressor();
    const gain = context.createGain();
    const stadiumDelay = context.createDelay(0.4);
    const stadiumReturn = context.createGain();

    source.buffer = buffer;
    highPass.type = "highpass";
    highPass.frequency.value = 190;
    lowPass.type = "lowpass";
    lowPass.frequency.value = 4300;
    presence.type = "peaking";
    presence.frequency.value = 1850;
    presence.Q.value = 0.9;
    presence.gain.value = 5;
    megaphoneDrive.curve = makeMegaphoneCurve(1.45);
    megaphoneDrive.oversample = "2x";
    paCompressor.threshold.value = -24;
    paCompressor.knee.value = 8;
    paCompressor.ratio.value = 5;
    paCompressor.attack.value = 0.004;
    paCompressor.release.value = 0.12;
    gain.gain.value = 0.9;
    stadiumDelay.delayTime.value = 0.095;
    stadiumReturn.gain.value = 0.13;

    source.connect(highPass);
    highPass.connect(lowPass);
    lowPass.connect(presence);
    presence.connect(megaphoneDrive);
    megaphoneDrive.connect(paCompressor);
    paCompressor.connect(gain);
    gain.connect(buses.commentator);
    paCompressor.connect(stadiumDelay);
    stadiumDelay.connect(stadiumReturn);
    stadiumReturn.connect(buses.commentator);

    setDucked(true);
    paTransmissionStart();
    activeCommentarySource = source;
    source.onended = () => finishCommentary(token);
    source.start();
  }

  function makeMegaphoneCurve(amount) {
    const curve = new Float32Array(256);
    for (let index = 0; index < curve.length; index++) {
      const value = index * 2 / (curve.length - 1) - 1;
      curve[index] = Math.tanh(value * amount) / Math.tanh(amount);
    }
    return curve;
  }

  function enqueueCommentary(text, priorityName, category) {
    if (commentaryQueue.some((entry) => entry.text === text)) return;

    commentaryQueue.push({
      text,
      priorityName,
      category,
      priority: COMMENTARY_PRIORITIES[priorityName] ?? 0,
      expiresAt: clockSeconds() + 25,
    });
    commentaryQueue.sort((a, b) => b.priority - a.priority);
    commentaryQueue = commentaryQueue.slice(0, 8);
  }

  function pumpCommentaryQueue() {
    const now = clockSeconds();
    commentaryQueue = commentaryQueue.filter((entry) => {
      return entry.expiresAt > now;
    });
    if (
      !commentaryQueue.length ||
      commentarySpeaking ||
      !commentatorReady
    ) return;

    const next = commentaryQueue.shift();
    commentate(next.text, next.priorityName, next.category);
  }

  function paTransmissionStart() {
    playSample("uiClick", {
      bus: "commentator",
      gain: 0.045,
      playbackRate: 0.78,
    });
  }

  function finishCommentary(token) {
    if (token !== commentaryToken) return;

    commentarySpeaking = false;
    commentaryPriority = -1;
    pendingSpeechToken = 0;
    activeCommentarySource = null;
    setDucked(false);

    const urgent = S.phase === "racing" &&
      leadingProgress() > C.raceLaps - 0.35;
    const pause = urgent
      ? 0.75 + Math.random() * 0.8
      : 1.8 + Math.random() * 1.8;
    commentaryTimer = pause;

    window.setTimeout(pumpCommentaryQueue, pause * 1000);
  }

  function clockSeconds() {
    return typeof performance !== "undefined"
      ? performance.now() / 1000
      : Date.now() / 1000;
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
    notifyMiss,
    raceStart,
    raceFinish,
    commentate,
  };
})();
