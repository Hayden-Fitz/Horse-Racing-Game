"use strict";
HD.UI = (() => {
  const S = HD.state,
    C = HD.CONFIG,
    $ = (s) => document.querySelector(s);
  const el = {
    money: $("#money"),
    bank: $("#bank-money"),
    round: $("#round"),
    race: $("#race-number"),
    inventory: $("#inventory"),
    countdown: $("#countdown"),
    announcement: $("#announcement"),
    progress: $("#race-progress div"),
    phase: $("#phase-label"),
    list: $("#horse-list"),
    amount: $("#bet-amount"),
    bet: $("#place-bet"),
    shop: $("#shop-items"),
    tickets: $("#tickets"),
    ledger: $("#ledger"),
    phone: $("#phone"),
    toggle: $("#phone-toggle"),
    results: $("#results"),
    resultTitle: $("#result-title"),
    resultCopy: $("#result-copy"),
    resultContinue: $("#result-continue"),
    mode: $("#mode-badge"),
    powerMeter: $("#power-meter"),
    powerFill: $("#power-meter i"),
    powerText: $("#power-meter strong"),
    oddsWatch: $("#odds-watch"),
    leaderboard: $("#leaderboard-list"),
    ponyCard: $("#pony-card"),
    drawCard: $("#draw-card"),
    roundBreak: $("#round-break"),
    breakTimer: $("#break-timer"),
    dayTransition: $("#day-transition"),
    dayTitle: $("#day-title"),
    vendorShop: $("#vendor-shop"),
    vendorItems: $("#vendor-items"),
    vendorClose: $("#vendor-close"),
    deliveries: $("#deliveries"),
    menu: $("#game-menu"),
    menuPlay: $("#menu-play"),
    menuResume: $("#menu-resume"),
  };

  // ---------------------------------------------------------------------------
  // Primary HUD and phone applications
  // ---------------------------------------------------------------------------

  function render() {
    el.money.textContent = el.bank.textContent = `$${S.money}`;
    el.round.textContent = `${S.round} / 3`;
    el.race.textContent = `${S.race} / ${C.totalRaces}`;
    el.inventory.textContent = Object.values(S.inventory).reduce(
      (total, count) => total + count,
      0,
    );
    const open = S.phase === "betting" || (S.phase === "racing" && S.raceTime < 30);
    el.bet.disabled = !open || S.money < 5;
    el.phase.textContent = open ? "BETTING OPEN" : "BOOK CLOSED";
    el.phase.classList.toggle("closed", !open);
    el.tickets.innerHTML = S.bets.length ? S.bets.map(ticketMarkup).join("") : "No bets placed.";
    el.ledger.innerHTML = S.ledger.map(ledgerMarkup).join("");
    renderCards();
    renderShop();
    renderDeliveries();
    renderOddsWatch();
    renderLeaderboard();
  }

  function renderOddsWatch() {
    el.oddsWatch.innerHTML = S.horses
      .map((horse, index) => {
        const data = horse.userData.data;
        const completed = Math.max(0, data.progress);
        const lap = Math.min(C.raceLaps, Math.floor(completed) + 1);
        const status = horseStatus(data);
        const color = data.color.toString(16).padStart(6, "0");
        return `
          <div>
            <i style="background:#${color}"></i>
            <span>#${index + 1} ${data.name}</span>
            <small>Lap ${lap}/${C.raceLaps}</small>
            <strong>${status}</strong>
          </div>
        `;
      })
      .join("");
  }

  function renderLeaderboard() {
    const rivals = [
      ["YOU", S.money],
      ["Maya", 80 + S.race * 28],
      ["Dex", 135 + S.race * 12],
      ["Rin", 105 + S.race * 19],
    ].sort((a, b) => b[1] - a[1]);
    el.leaderboard.innerHTML = rivals
      .map(
        ([name, money], index) => `
          <div>
            <em>${index + 1}</em>
            <span>${name}</span>
            <strong>$${money}</strong>
          </div>
        `,
      )
      .join("");
  }

  function horseStatus(data) {
    if (data.ragdoll > 0) return "TUMBLING";
    if (data.slow > 0) return "SLOWED";
    if (data.boost > 0) return "BOOSTED";
    if (data.resistance > 0) return "RESISTANT";
    return "RUNNING";
  }

  function drawCard() {
    const cards = [
      ["LEGENDARY", "THE TAX STALLION", "+99 AUDITS"],
      ["RARE", "MAYONNAISE MARE", "+4 SANDWICHES"],
      ["COMMON", "ACCOUNTANT COLT", "+2 SPREADSHEETS"],
      ["QUESTIONABLE", "HORSE.PNG", "NO ABILITIES"],
    ];
    const [rarity, name, ability] = cards[Math.floor(Math.random() * cards.length)];
    el.ponyCard.innerHTML = `<small>${rarity}</small><strong>${name}</strong><span>${ability}</span>`;
  }

  function renderShop() {
    el.shop.innerHTML = Object.entries(C.items)
      .map(([id, item]) => {
        const selected = S.selectedItem === id ? "selected" : "";
        const disabled = S.money < item.price ? "disabled" : "";
        return `
          <article class="shop-item ${selected}">
            <button class="item-select" data-select-item="${id}">
              <span class="item-icon">${item.icon}</span>
              <span><strong>${item.name}</strong><small>${item.description}</small></span>
              <em>x${S.inventory[id]}</em>
            </button>
            <button class="item-buy" data-buy-item="${id}" ${disabled}>
              ORDER $${item.price} · 12s
            </button>
          </article>
        `;
      })
      .join("");

    el.shop.querySelectorAll("[data-select-item]").forEach((button) => {
      button.onclick = () => HD.Controls.selectItem(button.dataset.selectItem);
    });
    el.shop.querySelectorAll("[data-buy-item]").forEach((button) => {
      button.onclick = () => buy(button.dataset.buyItem);
    });
  }
  function renderDeliveries() {
    const markup = S.deliveries.length
      ? S.deliveries
          .map((delivery) => {
            const seconds = Math.max(0, Math.ceil(delivery.remaining));
            return `<span>${C.items[delivery.id].icon} ${seconds}s</span>`;
          })
          .join("")
      : "No active deliveries.";
    if (el.deliveries.innerHTML !== markup) el.deliveries.innerHTML = markup;
  }

  function ticketMarkup(bet) {
    const horseName = C.horses[bet.horse].name;
    return `
      <div class="ticket">
        <span>#${bet.horse + 1} ${horseName}</span>
        <strong>$${bet.amount} @ ${bet.odds}:1</strong>
      </div>
    `;
  }

  function ledgerMarkup(entry) {
    const className = entry.amount > 0 ? "plus" : entry.amount < 0 ? "minus" : "";
    const sign = entry.amount > 0 ? "+" : "";
    const value = entry.amount ? `$${entry.amount}` : "USED";
    return `
      <div>
        <span>${entry.label}</span>
        <strong class="${className}">${sign}${value}</strong>
      </div>
    `;
  }
  function renderCards() {
    const order = [...S.horses].sort((a, b) => b.userData.data.progress - a.userData.data.progress);
    el.list.innerHTML = S.horses
      .map((horse, i) => {
        const d = horse.userData.data,
          rank = order.findIndex((h) => h === horse) + 1;
        const selectedClass = S.selected === i ? "selected" : "";
        const color = d.color.toString(16).padStart(6, "0");
        const suffix = rank === 1 ? "st" : rank === 2 ? "nd" : rank === 3 ? "rd" : "th";
        const completed = Math.max(0, d.progress);
        const lap = Math.min(C.raceLaps, Math.floor(completed) + 1);
        const lapProgress = Math.round((completed % 1) * 100);

        return `
          <button class="horse-choice ${selectedClass}" data-horse="${i}">
            <strong>
              <i class="dot" style="background:#${color}"></i>
              #${i + 1} &middot; ${d.odds}:1
            </strong>
            <span>${d.name}</span>
            <small>${rank}${suffix} &middot; Lap ${lap}/${C.raceLaps} &middot; ${lapProgress}%</small>
          </button>
        `;
      })
      .join("");
    document.querySelectorAll("[data-horse]").forEach(
      (button) =>
        (button.onclick = () => {
          S.selected = +button.dataset.horse;
          renderCards();
        }),
    );
  }
  function placeBet() {
    const amount = Math.max(5, Math.floor(Number(el.amount.value || 5) / 5) * 5),
      open = S.phase === "betting" || (S.phase === "racing" && S.raceTime < 30);
    if (!open) return announce("The betting book is closed.");
    if (amount > S.money) return announce("Not enough money for that ticket.");
    const d = S.horses[S.selected].userData.data;
    S.money -= amount;
    S.bets.push({ horse: S.selected, amount, odds: d.odds });
    addLedger(`Bet: #${S.selected + 1}`, -amount);
    announce(`$${amount} on ${d.name} at ${d.odds}:1.`);
    render();
  }
  function buy(id) {
    const item = C.items[id];
    if (S.money < item.price) return announce(`You need $${item.price}.`);
    S.money -= item.price;
    S.deliveries.push({ id, remaining: C.phoneDeliveryDuration });
    addLedger(`TrackMart order: ${item.name}`, -item.price);
    announce(`${item.name} ordered. Delivery in ${C.phoneDeliveryDuration} seconds.`);
    render();
  }

  function updateDeliveries(dt) {
    S.deliveries.forEach((delivery) => {
      delivery.remaining -= dt;
      if (delivery.remaining <= 0 && !delivery.complete) {
        delivery.complete = true;
        S.inventory[delivery.id]++;
        S.selectedItem = delivery.id;
        announce(`${C.items[delivery.id].name} delivered to your seat!`);
        render();
      }
    });
    S.deliveries = S.deliveries.filter((delivery) => !delivery.complete);
    renderDeliveries();
  }

  function menu(show, pauseMenu = false) {
    el.menu.classList.toggle("closed", !show);
    el.menuPlay.hidden = pauseMenu;
    el.menuResume.hidden = !pauseMenu;
  }
  function phone(show) {
    el.phone.classList.toggle("closed", !show);
    el.toggle.setAttribute("aria-expanded", String(show));
    document.body.classList.toggle("phone-open", show);
  }

  // ---------------------------------------------------------------------------
  // Overlays, intermissions, vendors, and feedback
  // ---------------------------------------------------------------------------

  function announce(text) {
    el.announcement.textContent = text;
    el.announcement.classList.add("pop");
    clearTimeout(el.announcement.timer);
    el.announcement.timer = setTimeout(() => el.announcement.classList.remove("pop"), 350);
  }
  function addLedger(label, amount) {
    S.ledger.unshift({ label, amount });
    S.ledger = S.ledger.slice(0, 12);
  }
  function showResult(title, copy, button = "CONTINUE") {
    el.resultTitle.textContent = title;
    el.resultCopy.textContent = copy;
    el.resultContinue.textContent = button;
    el.results.hidden = false;
    document.exitPointerLock?.();
  }
  function hideResult() {
    el.results.hidden = true;
  }
  function setMode(name) {
    el.mode.textContent = name.toUpperCase();
    el.mode.dataset.mode = name;
  }
  function power(value, visible) {
    const percent = Math.round(value * 100);
    el.powerMeter.hidden = !visible;
    el.powerFill.style.width = `${percent}%`;
    el.powerText.textContent = `${percent}%`;
  }
  function showRoundBreak(show) {
    el.roundBreak.hidden = !show;
  }
  function updateBreakTimer(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainder = Math.max(0, Math.ceil(seconds % 60));
    el.breakTimer.textContent = `${minutes}:${String(remainder).padStart(2, "0")}`;
  }
  function showDay(day, onComplete) {
    el.dayTitle.textContent = `DAY ${day}`;
    el.dayTransition.hidden = false;
    requestAnimationFrame(() => el.dayTransition.classList.add("visible"));
    setTimeout(() => {
      el.dayTransition.classList.remove("visible");
      setTimeout(() => {
        el.dayTransition.hidden = true;
        onComplete();
      }, 500);
    }, 2200);
  }
  function vendor(show) {
    S.vendorOpen = show;
    el.vendorShop.hidden = !show;
    document.body.classList.toggle("vendor-open", show);
    if (show) renderVendor();
  }
  function renderVendor() {
    el.vendorItems.innerHTML = Object.entries(C.items)
      .map(([id, item]) => {
        const price = Math.ceil(item.price * (1 - C.vendorDiscount));
        const disabled = S.money < price ? "disabled" : "";
        return `
          <article class="shop-item">
            <span class="item-icon">${item.icon}</span>
            <span><strong>${item.name}</strong><small>Instant pickup · x${S.inventory[id]}</small></span>
            <button class="item-buy" data-vendor-buy="${id}" ${disabled}>BUY $${price}</button>
          </article>
        `;
      })
      .join("");
    el.vendorItems.querySelectorAll("[data-vendor-buy]").forEach((button) => {
      button.onclick = () => buyFromVendor(button.dataset.vendorBuy);
    });
  }
  function buyFromVendor(id) {
    const item = C.items[id];
    const price = Math.ceil(item.price * (1 - C.vendorDiscount));
    if (S.money < price) return announce("Not enough money.");
    S.money -= price;
    S.inventory[id]++;
    S.selectedItem = id;
    addLedger(`Concourse pickup: ${item.name}`, -price);
    announce(`${item.name} picked up instantly.`);
    render();
    renderVendor();
  }
  el.bet.onclick = placeBet;
  el.toggle.onclick = () => HD.Controls.setMode(S.mode === "phone" ? "look" : "phone");
  el.menuPlay.onclick = () => HD.Controls.closeMenu();
  el.menuResume.onclick = () => HD.Controls.closeMenu();
  el.resultContinue.onclick = () => (S.phase === "matchOver" ? HD.Race.restart() : HD.Race.next());
  el.drawCard.onclick = drawCard;
  el.vendorClose.onclick = () => HD.Controls.closeVendor();
  document
    .querySelectorAll(".stake-step")
    .forEach(
      (b) =>
        (b.onclick = () =>
          (el.amount.value = Math.max(5, Number(el.amount.value || 5) + Number(b.dataset.step)))),
    );
  document.querySelectorAll("[data-app]").forEach(
    (b) =>
      (b.onclick = () => {
        document
          .querySelectorAll("[data-app]")
          .forEach((x) => x.classList.toggle("active", x === b));
        document
          .querySelectorAll("[data-panel]")
          .forEach((p) => p.classList.toggle("active", p.dataset.panel === b.dataset.app));
      }),
  );
  return {
    render,
    renderCards,
    renderOddsWatch,
    phone,
    announce,
    addLedger,
    showResult,
    hideResult,
    setMode,
    power,
    updateDeliveries,
    showRoundBreak,
    updateBreakTimer,
    showDay,
    vendor,
    menu,
    countdown: (value) => (el.countdown.textContent = value),
    progress: (value) => (el.progress.style.width = `${value * 100}%`),
  };
})();
