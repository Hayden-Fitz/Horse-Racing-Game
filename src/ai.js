"use strict";

// v13 removes simulated player opponents. Horse AI and the spectator crowd
// remain separate systems. Preserve lifecycle hooks for existing callers.
HD.AI = Object.freeze({
  init() {},
  update() {},
  prepareRace() {},
  settleRace() {},
  resetMatch() {},
  rankingPlayers: () => [],
  transferTargets: () => [],
  receiveTransfer: () => false,
});
