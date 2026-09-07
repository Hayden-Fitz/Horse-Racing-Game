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
    HD.Stadium?.refreshTrackLayout?.();
    return rules;
  }

  function resetForOnline() {
    apply(defaults);
  }

  function open() {
    // Stay in the lobby until the player explicitly starts the sandbox.
    if (HD.Network?.isConnected()) {
      HD.UI.announce("Leave your online lobby before opening Practice Mode.");
      return;
    }
    panel = document.querySelector("#practice-setup");
    previousFocus = document.activeElement;
    for (const [key, value] of Object.entries(practice)) {
      panel.querySelector(`[name="${key}"]`).value = value;
    }
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
    if (HD.Network?.isConnected()) return;
    practice = apply(Object.fromEntries(new FormData(panel.querySelector("form"))));
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

  return { defaults, normalize, apply, resetForOnline, open };
})();
