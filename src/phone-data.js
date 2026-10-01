"use strict";
HD.PhoneData = (() => {
  function horses(profiles, activeIds, tab) {
    const active = new Set(activeIds || []);
    if (tab === "field") {
      const byId = new Map(profiles.map((horse) => [horse.id, horse]));
      return [...active].map((id) => byId.get(id)).filter(Boolean);
    }
    if (tab === "discovered") return profiles.filter((horse) => horse.discovered === true);
    return [];
  }

  function recordEvent(state, event) {
    if (!event || !["HIT", "STUN", "OVERTAKE"].includes(event.label) ||
        typeof event.title !== "string" || typeof event.detail !== "string") return false;
    state.newsEvents ||= [];
    const at = Number(state.raceTime) || 0;
    const key = String(event.key || "");
    if (key && state.newsEvents.some((previous) => previous.key === key &&
        previous.race === state.race && at - previous.at < 5)) return false;
    state.newsEventSequence = (Number(state.newsEventSequence) || 0) + 1;
    state.newsEvents.unshift({ id: state.newsEventSequence, label: event.label,
      title: event.title.slice(0, 100), detail: event.detail.slice(0, 150),
      key: key.slice(0, 80), round: state.round, race: state.race, at });
    state.newsEvents.length = Math.min(state.newsEvents.length, 12);
    return true;
  }

  function headlines(state) {
    const items = [];
    const lastResult = state.dayResults?.at(-1);
    if (lastResult) items.push({
      label: "RESULT", title: lastResult.winner + " takes race " + lastResult.race,
      detail: lastResult.podium?.slice(0, 3).join(" / ") || "Official result",
    });
    for (const event of (state.newsEvents || []).slice(0, 3)) items.push(event);
    const payout = (state.ledger || []).find((entry) =>
      /^Race [0-9]+ payout$/.test(entry.label) && entry.amount > 0);
    if (payout) items.push({ label: "PAYOUT", title: "Your winning tickets paid",
      detail: "+$" + payout.amount + " / " + payout.label });
    if (state.phase === "racing" && state.raceAnnouncement?.startsWith("PADDOCK ALERT")) {
      items.push({ label: "PADDOCK", title: "Fixer activity reported",
        detail: state.raceAnnouncement.replace(/^PADDOCK ALERT:\s*/, "").split("They're off!")[0].trim() });
    }
    const leader = [...(state.horses || [])].sort((a, b) =>
      (b.userData.data.progress || 0) - (a.userData.data.progress || 0))[0]?.userData.data;
    if (leader && state.phase === "racing") items.push({
      label: "LIVE", title: leader.name + " leads the field",
      detail: Number.isFinite(leader.liveChance)
        ? Math.round(leader.liveChance * 100) + "% live win chance" : "Race in progress",
    });
    const mover = (state.horses || []).map((horse) => horse.userData.data)
      .filter((data) => Number.isFinite(data.liveChance) && Number.isFinite(data.openingChance))
      .sort((a, b) => Math.abs(b.liveChance - b.openingChance) -
        Math.abs(a.liveChance - a.openingChance))[0];
    if (mover && Math.abs(mover.liveChance - mover.openingChance) >= 0.02) items.push({
      label: "ODDS", title: mover.name + " moves in the book",
      detail: Math.round(mover.openingChance * 100) + "% to " +
        Math.round(mover.liveChance * 100) + "% live chance",
    });
    const latest = state.ledger?.[0];
    if (latest) items.push({
      label: "YOUR ACCOUNT", title: latest.label,
      detail: (latest.amount >= 0 ? "+" : "") + "$" + latest.amount,
    });
    return items.slice(0, 8);
  }
  return { horses, headlines, recordEvent };
})();
