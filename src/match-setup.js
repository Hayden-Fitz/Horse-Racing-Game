"use strict";

HD.MatchSetup = (() => {
  const C = HD.CONFIG;
  const S = HD.state;
  const $ = (selector) => document.querySelector(selector);

  let initialized = false;

  function init() {
    if (initialized) return;
    initialized = true;

    [
      "#match-horse-count",
      "#match-races-per-day",
      "#match-laps",
      "#match-variety",
      "#match-live-betting",
    ].forEach((selector) => {
      $(selector).addEventListener("change", updatePreview);
    });
    $("#match-setup-back").addEventListener("click", close);
    $("#match-setup-start").addEventListener("click", startSinglePlayer);
    updatePreview();
  }

  function openSinglePlayer() {
    const menu = $("#game-menu");
    $("#match-setup").hidden = false;
    menu.classList.add("match-setup-open");
    updatePreview();
  }

  function close() {
    $("#match-setup").hidden = true;
    $("#game-menu").classList.remove("match-setup-open");
  }

  function currentRules() {
    return sanitizeRules({
      horseCount: $("#match-horse-count").value,
      racesPerDay: $("#match-races-per-day").value,
      laps: $("#match-laps").value,
      raceVariety: $("#match-variety").value,
      liveBetting: $("#match-live-betting").checked,
    });
  }

  function sanitizeRules(source = {}) {
    const varietyOptions = new Set(["standard", "strategic", "chaos"]);
    return {
      horseCount: THREE.MathUtils.clamp(
        Math.round(Number(source.horseCount) || 6),
        4,
        8,
      ),
      racesPerDay: THREE.MathUtils.clamp(
        Math.round(Number(source.racesPerDay) || 2),
        2,
        3,
      ),
      laps: THREE.MathUtils.clamp(
        Math.round(Number(source.laps) || 3),
        2,
        4,
      ),
      raceVariety: varietyOptions.has(source.raceVariety)
        ? source.raceVariety
        : "standard",
      liveBetting: source.liveBetting !== false,
    };
  }

  function applyRules(source) {
    const rules = sanitizeRules(source);
    S.matchRules = { ...rules };
    C.raceHorseCount = rules.horseCount;
    C.racesPerRound = rules.racesPerDay;
    C.totalRaces = rules.racesPerDay * 3;
    C.raceLaps = rules.laps;
    return rules;
  }

  function useRules(source) {
    const rules = applyRules(source);
    $("#match-horse-count").value = rules.horseCount;
    $("#match-races-per-day").value = rules.racesPerDay;
    $("#match-laps").value = rules.laps;
    $("#match-variety").value = rules.raceVariety;
    $("#match-live-betting").checked = rules.liveBetting;
    updatePreview();
    return rules;
  }

  function updatePreview() {
    const rules = currentRules();
    $("#match-race-total").textContent = `${rules.racesPerDay * 3} RACES`;
    $("#match-field-summary").textContent = `${rules.horseCount} HORSES`;
  }

  function startSinglePlayer() {
    applyRules(currentRules());
    close();
    HD.Race.restart();
    S.matchStarted = false;
    HD.Controls.closeMenu();
  }

  function summary(source = S.matchRules) {
    const rules = sanitizeRules(source);
    return `${rules.horseCount} HORSES · ${rules.laps} LAPS · ` +
      `${rules.racesPerDay} RACES/DAY · ${rules.raceVariety.toUpperCase()}`;
  }

  return {
    init,
    openSinglePlayer,
    currentRules,
    sanitizeRules,
    applyRules,
    useRules,
    summary,
  };
})();
