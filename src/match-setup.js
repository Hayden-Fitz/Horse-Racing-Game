"use strict";

// Match rules are separate from graphics, audio, and accessibility preferences.
HD.MatchSetup = (() => {
  const defaults = Object.freeze({
    days: 3,
    racesPerDay: 2,
    horses: 6,
    laps: 3,
    startingMoney: 100,
    crowd: "normal",
  });
  const crowdIntervals = Object.freeze({ off: 0, relaxed: 20, normal: 10, lively: 6 });
  let practice = { ...defaults, crowd: "lively" };
  let panel;
  let previousFocus;
  let mode = "single";

  function normalize(input = {}) {
    const integer = (value, minimum, maximum, fallback) => {
      if (value === "" || value == null) return fallback;
      const number = Number(value);
      return Number.isFinite(number)
        ? Math.min(maximum, Math.max(minimum, Math.round(number)))
        : fallback;
    };

    return {
      days: integer(input.days, 1, 10, defaults.days),
      racesPerDay: integer(input.racesPerDay, 1, 6, defaults.racesPerDay),
      horses: integer(input.horses, 4, 8, defaults.horses),
      laps: integer(input.laps, 1, 8, defaults.laps),
      startingMoney: integer(input.startingMoney, 100, 1000, defaults.startingMoney),
      crowd: Object.hasOwn(crowdIntervals, input.crowd) ? input.crowd : defaults.crowd,
    };
  }

  function apply(input) {
    const rules = normalize(input);
    HD.CONFIG.racesPerRound = rules.racesPerDay;
    HD.CONFIG.totalRaces = rules.days * rules.racesPerDay;
    HD.CONFIG.raceHorseCount = rules.horses;
    HD.CONFIG.raceLaps = rules.laps;
    HD.CONFIG.startingMoney = rules.startingMoney;
    HD.CONFIG.crowdThrowInterval = crowdIntervals[rules.crowd];
    HD.CONFIG.sabotageEnabled = true;
    HD.Stadium?.refreshTrackLayout?.();
    return rules;
  }

  function resetForOnline() {
    apply(defaults);
  }

  function open() {
    // Stay in the lobby until the player explicitly starts the sandbox.
    if (HD.Network?.isConnected()) {
      HD.UI.announce("Leave your online lobby before opening Single Player.");
      return;
    }
    openPanel(practice, "single");
  }

  function openOnline(rules) {
    if (!HD.Network?.isConnected() || !HD.Network?.isHost()) {
      HD.UI.announce("Only the lobby host can edit match rules.");
      return;
    }
    if (HD.Network.isPlaying()) {
      HD.UI.announce("Match rules lock when the race begins.");
      return;
    }
    openPanel(normalize(rules), "online");
  }

  function openPanel(values, nextMode) {
    mode = nextMode;
    panel = document.querySelector("#practice-setup");
    previousFocus = document.activeElement;
    for (const [key, value] of Object.entries(values)) {
      panel.querySelector(`[name="${key}"]`).value = value;
    }
    const online = mode === "online";
    panel.querySelector("#practice-kicker").textContent = online
      ? "HOTDOG DERBY / ONLINE HOST RULES"
      : "HOTDOG DERBY / SINGLE PLAYER";
    panel.querySelector("#practice-title").textContent = online
      ? "Set the room format."
      : "Your track. Your rules.";
    panel.querySelector("#practice-description").textContent = online
      ? "Every player sees these rules live. They lock when the host starts the match."
      : "Try your throws, test a bet, and learn the field. No AI player opponents.";
    panel.querySelector("#practice-submit").textContent = online
      ? "SAVE LOBBY RULES"
      : "START SINGLE PLAYER →";
    panel.querySelector("form").onsubmit = start;
    panel.querySelector("form").oninput = updateSummary;
    updateSummary();
    panel.querySelector("[data-back]").onclick = () => panel.close();
    panel.onclose = () => previousFocus?.focus?.();
    panel.showModal();
    panel.querySelector("select").focus();
  }

  function start(event) {
    event.preventDefault();
    const selected = normalize(
      Object.fromEntries(new FormData(panel.querySelector("form"))),
    );
    if (mode === "online") {
      if (!HD.Network?.updateMatchRules(selected)) return;
      panel.close();
      return;
    }
    if (HD.Network?.isConnected()) return;
    practice = apply(selected);
    HD.Race.restart();
    // restart initializes the simulation; closeMenu presents the Day 1 screen.
    HD.state.matchStarted = false;
    panel.close();
    HD.Controls.closeMenu();
  }

  function updateSummary() {
    const rules = normalize(Object.fromEntries(new FormData(panel.querySelector("form"))));
    const total = rules.days * rules.racesPerDay;
    panel.querySelector(".practice-note").textContent =
      `${rules.days} ${rules.days === 1 ? "day" : "days"} · ` +
      `${rules.racesPerDay} ${rules.racesPerDay === 1 ? "race" : "races"} per day · ` +
      `${total} total ${total === 1 ? "race" : "races"}`;
  }

  return { defaults, normalize, apply, resetForOnline, open, openOnline };
})();
