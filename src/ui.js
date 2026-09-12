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
    raceNotice: $("#race-notice"),
    raceWinner: $("#race-winner-banner"),
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
    leaderboard: null,
    roundBreak: $("#round-break"),
    breakTimer: $("#break-timer"),
    dayTransition: $("#day-transition"),
    dayTitle: $("#day-title"),
    daySubtitle: $("#day-subtitle"),
    dayRankings: $("#day-rankings"),
    vendorShop: $("#vendor-shop"),
    vendorItems: $("#vendor-items"),
    vendorClose: $("#vendor-close"),
    betCounter: $("#bet-counter"),
    counterHorses: $("#counter-horses"),
    counterAmount: $("#counter-bet-amount"),
    counterPlaceBet: $("#counter-place-bet"),
    counterClose: $("#counter-close"),
    sabotageTargets: $("#sabotage-targets"),
    sabotageOptions: $("#sabotage-options"),
    sabotageStatus: $("#sabotage-status"),
    transferPlayer: $("#transfer-player"),
    transferMoney: $("#transfer-money"),
    transferItem: $("#transfer-item"),
    sendTransfer: $("#send-transfer"),
    transferStatus: $("#transfer-status"),
    phoneHome: $("#phone-home"),
    phoneTime: $("#phone-time"),
    phoneHomeClock: $("#phone-home-clock"),
    phoneHomeDate: $("#phone-home-date"),
    phoneHomeOwner: $("#phone-home-owner"),
    messageThread: $("#message-thread"),
    messageHistory: $("#message-history"),
    messageCompose: $("#message-compose"),
    messageText: $("#message-text"),
    messageStatus: $("#message-status"),
    deliveries: $("#deliveries"),
    menu: $("#game-menu"),
    menuPlay: $("#menu-play"),
    menuResume: $("#menu-resume"),
    hotbarItems: $("#hotbar-items"),
    bestBet: $("#best-bet"),
    rankingsButton: $("#current-rankings"),
    rankingsOverlay: $("#rankings-overlay"),
    rankingsTitle: $("#rankings-title"),
    rankingsChart: $("#rankings-chart"),
    rankingsClose: $("#rankings-close"),
  };
  let deliveryRenderTimer = 0;
  let dayTimeout;
  let dayGeneration = 0;
  const moneyRequests = [];
  const rankingRowHeight = 44;

  // ---------------------------------------------------------------------------
  // Primary HUD and phone applications
  // ---------------------------------------------------------------------------

  function render() {
    el.money.textContent = el.bank.textContent = `$${S.money}`;
    el.round.textContent = `${S.round} / ${Math.ceil(C.totalRaces / C.racesPerRound)}`;
    el.race.textContent = `${S.race} / ${C.totalRaces}`;
    el.inventory.textContent = Object.values(S.inventory).reduce(
      (total, count) => total + count,
      0,
    );
    const open = isBettingOpen();
    el.bet.disabled = !open || S.money < 6;
    el.phase.textContent = open ? "BETTING OPEN" : "BOOK CLOSED";
    el.phase.classList.toggle("closed", !open);
    el.tickets.innerHTML = S.bets.length ? S.bets.map(ticketMarkup).join("") : "No bets placed.";
    el.ledger.innerHTML = S.ledger.map(ledgerMarkup).join("");
    renderCards();
    renderShop();
    renderDeliveries();
    renderOddsWatch();
    renderLeaderboard();
    renderHotbar();
    renderNews();
    renderBank();
    renderSabotage();
    renderTransfer();
    renderMoneyRequests();
    renderChat();
  }

  function renderOddsWatch() {
    const runningById = new Map(
      S.horses.map((horse) => [horse.userData.data.id, horse.userData.data]),
    );
    el.oddsWatch.innerHTML = C.horses
      .map((horse) => {
        const active = runningById.get(horse.id);
        const odds = active?.odds || horse.odds;
        const chance = active && Number.isFinite(active.liveChance)
          ? `${Math.round(active.liveChance * 100)}%`
          : "NOT ENTERED";
        const rating = Math.round(
          horse.speed * 0.45 +
          horse.stamina * 0.25 +
          horse.acceleration * 0.2 +
          horse.resistance * 0.1,
        );
        const color = horse.color.toString(16).padStart(6, "0");
        return `
          <article class="odds-profile ${active ? "active" : "reserve"}">
            <header>
              <i style="background:#${color}"></i>
              <span><strong>#${HD.horseNumber(horse)} ${horse.name}</strong><small>${horse.style.toUpperCase()}</small></span>
              <em>${active ? `${odds}:1` : "RESERVE"}</em>
            </header>
            <div>
              <span>RACE CHANCE <b>${chance}</b></span>
              <span>BASE TENDENCY <b>${horse.odds}:1</b></span>
              <span>OVERALL <b>${rating}</b></span>
              <span>SPEED <b>${horse.speed}</b></span>
              <span>STAMINA <b>${horse.stamina}</b></span>
              <span>ACCEL <b>${horse.acceleration}</b></span>
              <span>RESIST <b>${horse.resistance}</b></span>
              <span>FIELD <b>${active ? horseStatus(active) : "RESERVE"}</b></span>
            </div>
          </article>
        `;
      })
      .join("");
  }

  function renderLeaderboard() {
    if (!hasOnlineLeaderboard()) {
      [el.leaderboard, el.rankingsChart, el.dayRankings].forEach((container) => {
        if (container) container.replaceChildren();
      });
      return;
    }
    const rankings = rankingEntries();
    renderAnimatedRankings(el.leaderboard, rankings);
    if (!el.rankingsOverlay.hidden) renderAnimatedRankings(el.rankingsChart, rankings);
    if (!el.dayTransition.hidden) renderAnimatedRankings(el.dayRankings, rankings);
  }

  function rankingEntries() {
    const online = HD.Network?.rankingPlayers?.() || [];
    return online.sort((a, b) => b.money - a.money);
  }

  function hasOnlineLeaderboard() {
    return Boolean(HD.Network?.isConnected?.() && HD.Network?.isPlaying?.());
  }

  function updateLeaderboardAvailability() {
    const available = hasOnlineLeaderboard();
    const appButton = document.querySelector('[data-app="leaders"]');
    const appPanel = document.querySelector('[data-panel="leaders"]');
    if (appButton) appButton.hidden = !available;
    if (appPanel) appPanel.hidden = !available;
    if (!available) showRankings(false);
  }

  function renderAnimatedRankings(container, rankings) {
    if (!container) return;

    const present = new Set(rankings.map((entry) => entry.id));
    container.querySelectorAll("[data-ranking-id]").forEach((row) => {
      if (!present.has(row.dataset.rankingId)) row.remove();
    });

    rankings.forEach((entry, index) => {
      let row = [...container.children].find((child) => {
        return child.dataset.rankingId === entry.id;
      });
      if (!row) {
        row = document.createElement("div");
        row.dataset.rankingId = entry.id;
        row.className = "ranking-row";
        row.innerHTML = "<em></em><span></span><strong></strong>";
        container.append(row);
      }

      row.querySelector("em").textContent = index + 1;
      row.querySelector("span").textContent = entry.name;
      row.querySelector("strong").textContent = `$${entry.money}`;
      row.classList.toggle("leader", index === 0);
      row.dataset.rank = String(index + 1);
      row.style.zIndex = String(rankings.length - index);
      requestAnimationFrame(() => {
        row.style.transform = `translate3d(0, ${index * rankingRowHeight}px, 0)`;
      });
    });
    container.style.height = `${rankings.length * rankingRowHeight}px`;
  }

  function renderHotbar() {
    el.hotbarItems.innerHTML = Object.entries(C.items)
      .map(([id, item], index) => {
        const count = S.inventory[id] || 0;
        const shortName = item.name.replace(
          /^(Ballpark|Mega|Foam|Turbo|Popcorn|Throw|Folding|Giant) /,
          "",
        );
        const classes = ["hotbar-slot"];
        if (S.selectedItem === id) classes.push("selected");
        if (!count) classes.push("empty");
        const thumbnail = HD.itemThumbnails?.[id];
        return `
          <button class="${classes.join(" ")}" data-hotbar-item="${id}">
            <kbd>${index === 9 ? 0 : index + 1}</kbd>
            ${thumbnail
              ? `<img src="${thumbnail}" alt="" draggable="false" />`
              : `<span>${item.icon}</span>`}
            <strong>${count}</strong>
            <small>${shortName}</small>
          </button>
        `;
      })
      .join("");

    el.hotbarItems.querySelectorAll("[data-hotbar-item]").forEach((button) => {
      button.onclick = () => {
        const id = button.dataset.hotbarItem;
        if (S.inventory[id] > 0) HD.Controls.selectItem(id);
        else announce(`${C.items[id].name} is out of stock.`);
      };
    });
    renderBestBet();
  }

  function renderNews() {
    const lead = document.querySelector('#news-lead');
    const feed = document.querySelector('#news-feed');
    if (!lead || !feed) return;
    const leader = [...S.horses].sort((a, b) =>
      (b.userData.data.progress || 0) - (a.userData.data.progress || 0))[0];
    const name = leader?.userData.data.name || 'The field';
    lead.innerHTML = '<small>LIVE FROM HOTDOG DOWNS</small><strong>' + escapeMarkup(name) +
      (S.phase === 'racing' ? ' sets the pace' : ' heads the race card') +
      '</strong><span>' + (S.horses.length || C.defaultHorseCount) + ' entrants and ' +
      S.bets.length + ' active tickets.</span>';
    const stories = S.ledger.slice(0, 4).map((entry) =>
      '<article><strong>' + escapeMarkup(entry.label) + '</strong><span>' +
      (entry.amount >= 0 ? '+' : '') + '$' + entry.amount + '</span></article>');
    feed.innerHTML = stories.length ? stories.join('') : '<p>No breaking stories yet.</p>';
  }

  function renderBank() {
    const income = S.ledger.reduce((total, entry) => total + Math.max(0, entry.amount), 0);
    const spending = S.ledger.reduce((total, entry) => total + Math.max(0, -entry.amount), 0);
    const net = income - spending;
    document.querySelector('#bank-income').textContent = '$' + income;
    document.querySelector('#bank-spending').textContent = '$' + spending;
    const netOutput = document.querySelector('#bank-net');
    netOutput.textContent = (net >= 0 ? '+' : '-') + '$' + Math.abs(net);
    netOutput.classList.toggle('negative', net < 0);
  }

  function renderBestBet() {
    const totals = new Map();
    S.bets.forEach((bet) => {
      totals.set(bet.horse, (totals.get(bet.horse) || 0) + bet.amount);
    });
    const top = [...totals.entries()].sort((a, b) => b[1] - a[1])[0];
    if (!top) {
      el.bestBet.innerHTML = `
        <small>TOP TICKET</small>
        <strong>NO BET</strong>
        <span>Place a wager to track it here</span>
      `;
      return;
    }

    const [horseIndex, amount] = top;
    el.bestBet.innerHTML = `
      <small>MOST BACKED</small>
      <strong>#${HD.horseNumber(horseIndex)} ${S.horses[horseIndex].userData.data.name}</strong>
      <span>$${amount} total stake</span>
    `;
  }

  function renderSabotage() {
    if (C.sabotageEnabled === false) {
      el.sabotageTargets.replaceChildren();
      el.sabotageOptions.replaceChildren();
      el.sabotageStatus.textContent = "Fixer services are disabled for this run.";
      return;
    }
    if (!S.horses.length) return;
    const playerPlan = S.sabotagePlans.find((plan) => !plan.ai && !plan.remote);
    const canHire = S.phase === "betting" && !playerPlan;
    el.sabotageTargets.innerHTML = S.horses
      .map((horse, index) => {
        const data = horse.userData.data;
        const selected = S.selected === index ? "selected" : "";
        return `
          <button class="horse-choice ${selected}" data-sabotage-horse="${index}">
            <strong>#${HD.horseNumber(data)} · ${data.odds}:1</strong>
            <span>${data.name}</span>
          </button>
        `;
      })
      .join("");
    const sabotageEntries = Object.entries(C.sabotageOptions).filter(([id]) => {
      return !S.atSabotageCounter || ["looseShoe", "hotStart"].includes(id);
    });
    el.sabotageOptions.innerHTML = sabotageEntries
      .map(([id, option]) => {
        const price = S.atSabotageCounter
          ? Math.ceil(option.price * (1 - C.vendorDiscount))
          : option.price;
        const disabled = !canHire || S.money < price ? "disabled" : "";
        return `
          <button data-sabotage-option="${id}" ${disabled}>
            <strong>${option.name} · $${price}</strong>
            <small>${option.description}</small>
          </button>
        `;
      })
      .join("");

    const plan = playerPlan;
    if (!plan) el.sabotageStatus.textContent = "No fixer hired for this race.";
    else if (!plan.resolved) {
      el.sabotageStatus.textContent =
        `Fixer hired for #${HD.horseNumber(plan.horse)}. Outcome sealed until race start.`;
    } else {
      el.sabotageStatus.textContent = plan.failed
        ? `Attempt against #${HD.horseNumber(plan.horse)}: FAILED.`
        : `Attempt against #${HD.horseNumber(plan.horse)}: SUCCESSFUL.`;
    }
    el.sabotageTargets.querySelectorAll("[data-sabotage-horse]").forEach((button) => {
      button.onclick = () => {
        S.selected = Number(button.dataset.sabotageHorse);
        renderSabotage();
        renderCards();
      };
    });
    el.sabotageOptions.querySelectorAll("[data-sabotage-option]").forEach((button) => {
      button.onclick = () => HD.Race.purchaseSabotage(S.selected, button.dataset.sabotageOption);
    });
  }

  function renderTransfer() {
    if (!el.transferPlayer) return;
    const targets = HD.Network.isConnected()
      ? HD.Network.transferTargets()
      : HD.AI.transferTargets();
    const previousTarget = el.transferPlayer.value;
    el.transferPlayer.innerHTML = targets.length
      ? targets.map((target) => `<option value="${target.id}">${target.name}</option>`).join("")
      : '<option value="">No other players online</option>';
    if (targets.some((target) => target.id === previousTarget)) {
      el.transferPlayer.value = previousTarget;
    }

    const previousItem = el.transferItem.value;
    const ownedItems = Object.entries(S.inventory).filter(([, count]) => count > 0);
    el.transferItem.innerHTML = '<option value="">No item</option>' + ownedItems
      .map(([id, count]) => `<option value="${id}">${C.items[id].name} · x${count}</option>`)
      .join("");
    if (ownedItems.some(([id]) => id === previousItem)) el.transferItem.value = previousItem;
    el.sendTransfer.disabled = !targets.length;
  }

  function sendTransfer() {
    const target = el.transferPlayer.value;
    const money = Math.max(0, Math.floor(Number(el.transferMoney.value) || 0));
    const itemId = el.transferItem.value;
    if (money > S.money) {
      HD.Audio?.cue?.("error");
      return announce("You do not have that much money.");
    }
    if (!money && !itemId) {
      HD.Audio?.cue?.("error");
      return announce("Choose money or an item to send.");
    }

    let sent = false;
    if (HD.Network.isConnected()) {
      sent = HD.Network.sendTransfer(target, money, itemId);
    } else {
      sent = HD.AI.receiveTransfer(target, money, itemId);
      if (sent) {
        S.money -= money;
        if (itemId) S.inventory[itemId]--;
      }
    }
    if (!sent) {
      HD.Audio?.cue?.("error");
      return announce("That transfer could not be completed.");
    }
    el.transferMoney.value = 0;
    el.transferStatus.textContent = `Sent ${money ? `$${money}` : C.items[itemId].name}.`;
    addLedger(`TrackPay transfer`, -money);
    announce("TrackPay transfer sent.");
    HD.Audio?.cue?.("moneySpend");
    render();
  }

  function requestMoney() {
    const target = document.querySelector('#transfer-player').value;
    const input = document.querySelector('#transfer-money');
    const amount = Math.floor(Number(input.value) || 0);
    if (!target || amount < 5) return announce('Choose a player and request at least .');
    if (!HD.Network.isConnected() || !HD.Network.requestMoney(target, amount)) {
      HD.Audio?.cue?.('error');
      return announce('Money requests are available in an online lobby.');
    }
    el.transferStatus.textContent = 'Requested $' + amount + '.';
    input.value = 0;
    HD.Audio?.cue?.('messageSent');
  }

  function receiveMoneyRequest(request) {
    if (moneyRequests.some((entry) => entry.id === request.id)) return;
    moneyRequests.unshift(request);
    renderMoneyRequests();
    document.querySelector('[data-app=transfer]')?.classList.add('has-notification');
    HD.Audio?.cue?.('message');
  }

  function renderMoneyRequests() {
    const container = document.querySelector('#money-requests');
    if (!container) return;
    container.replaceChildren();
    if (!moneyRequests.length) {
      const empty = document.createElement('p');
      empty.textContent = 'No pending requests.';
      container.append(empty);
      return;
    }
    moneyRequests.forEach((request) => {
      const card = document.createElement('article');
      const copy = document.createElement('span');
      const actions = document.createElement('div');
      const pay = document.createElement('button');
      const decline = document.createElement('button');
      copy.textContent = request.fromName + ' requested $' + request.amount;
      pay.textContent = 'PAY';
      decline.textContent = 'DECLINE';
      pay.onclick = () => {
        if (S.money < request.amount || !HD.Network.sendTransfer(request.from, request.amount, '')) {
          return announce('That request cannot be paid right now.');
        }
        addLedger('Paid ' + request.fromName, -request.amount);
        removeMoneyRequest(request.id);
        render();
      };
      decline.onclick = () => removeMoneyRequest(request.id);
      actions.append(pay, decline);
      card.append(copy, actions);
      container.append(card);
    });
  }

  function removeMoneyRequest(id) {
    const index = moneyRequests.findIndex((request) => request.id === id);
    if (index >= 0) moneyRequests.splice(index, 1);
    renderMoneyRequests();
    document.querySelector('[data-app=transfer]')?.classList
      .toggle('has-notification', moneyRequests.length > 0);
  }

  function renderChat() {
    if (!el.messageThread || !HD.Network?.chatTargets) return;
    const previousThread = el.messageThread.value || "group";
    const targets = HD.Network.chatTargets();
    el.messageThread.innerHTML = [
      '<option value="group">Everyone · Group Chat</option>',
      ...targets.map((target) => {
        return `<option value="${escapeMarkup(target.id)}">${escapeMarkup(target.name)} · Private</option>`;
      }),
    ].join("");
    el.messageThread.value = targets.some((target) => target.id === previousThread)
      ? previousThread
      : "group";

    const thread = el.messageThread.value;
    const messages = HD.Network.chatHistory(thread);
    if (!messages.length) {
      el.messageHistory.innerHTML = `
        <div class="message-empty">
          <strong>START A CONVERSATION</strong>
          <span>${thread === "group"
            ? "Everyone in the room can read messages sent here."
            : "This conversation is private between the two of you."}</span>
        </div>
      `;
    } else {
      el.messageHistory.innerHTML = messages.map((message) => {
        const time = new Date(message.createdAt).toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
        });
        return `
          <article class="chat-message ${message.mine ? "mine" : ""}">
            <strong>${escapeMarkup(message.mine ? "YOU" : message.fromName)}</strong>
            <span>${escapeMarkup(message.text)}</span>
            <time>${escapeMarkup(time)}</time>
          </article>
        `;
      }).join("");
    }
    el.messageStatus.textContent = thread === "group"
      ? "Group messages are visible to everyone in this room."
      : `Private conversation with ${targets.find((target) => target.id === thread)?.name || "player"}.`;
    requestAnimationFrame(() => {
      el.messageHistory.scrollTop = el.messageHistory.scrollHeight;
    });
  }

  function receiveChatMessage(message, notify) {
    renderChat();
    if (!notify) return;
    const messagesButton = document.querySelector('[data-app="messages"]');
    const messagesOpen = el.phone.classList.contains("app-open") &&
      messagesButton?.classList.contains("active");
    messagesButton?.classList.toggle("has-notification", !messagesOpen);
    HD.Audio?.cue?.("message");
  }

  function sendChatMessage(event) {
    event.preventDefault();
    const text = el.messageText.value.trim();
    if (!text) return;
    const sent = HD.Network.sendChatMessage(el.messageThread.value, text);
    if (!sent) {
      el.messageStatus.textContent = "That message could not be sent.";
      HD.Audio?.cue?.("error");
      return;
    }
    el.messageText.value = "";
    renderChat();
    HD.Audio?.cue?.("messageSent");
  }

  function escapeMarkup(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function horseStatus(data) {
    if (data.ragdoll > 0) return "TUMBLING";
    if (data.panic > 0) return "PANICKED";
    if (data.weave > 0) return "WEAVING";
    if (data.slow > 0) return "SLOWED";
    if (data.boost > 0) return "BOOSTED";
    if (data.resistance > 0) return "RESISTANT";
    return "RUNNING";
  }

  function renderShop() {
    el.shop.innerHTML = Object.entries(C.items)
      .filter(([id]) => HD.Concessions.phoneCatalog().includes(id))
      .map(([id, item]) => {
        const selected = S.selectedItem === id ? "selected" : "";
        const disabled = S.money < item.price ? "disabled" : "";
        const thumbnail = HD.itemThumbnails?.[id];
        const productArt = thumbnail
          ? '<img src="' + thumbnail + '" alt="" />'
          : item.icon;
        return `
          <article class="shop-item ${selected}">
            <button class="item-select" data-select-item="${id}">
              <span class="item-icon">${productArt}</span>
              <span>
                <strong>${item.name}</strong>
                <small><b class="item-effect">${itemEffectSummary(item)}</b>${item.description}</small>
                <small class="item-traits">${itemTraitSummary(item)}</small>
              </span>
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
  function itemEffectSummary(item) {
    const effects = [];
    if (item.slowDuration) effects.push(`SLOW 65% · ${item.slowDuration}s`);
    if (item.ragdollDuration) effects.push(`STUN · ${item.ragdollDuration}s`);
    if (item.boostDuration) effects.push(`BOOST 45% · ${item.boostDuration}s`);
    if (item.resistanceDuration) effects.push(`RESIST · ${item.resistanceDuration}s`);
    if (item.weaveDuration) effects.push(`WEAVE · ${item.weaveDuration}s`);
    if (item.panicDuration) effects.push(`PANIC · ${item.panicDuration}s`);
    return effects.length ? `${effects.join(" / ")} — ` : "UTILITY — ";
  }
  function renderDeliveries() {
    const markup = S.deliveries.length
      ? S.deliveries
          .map((delivery) => {
            const seconds = Math.max(0, Math.ceil(delivery.remaining));
            const duration = delivery.duration || C.phoneDeliveryDuration;
            const status = delivery.complete ? "DELIVERED" :
              seconds === duration ? "ORDERED" : "DELIVERING";
            return `<span title="${C.items[delivery.id].name}: ${status}">
              ${C.items[delivery.id].icon} ${delivery.complete ? 'Delivered' : `${seconds}s`}
            </span>`;
          })
          .join("")
      : "No active deliveries.";
    if (el.deliveries.innerHTML !== markup) el.deliveries.innerHTML = markup;
  }

  function ticketMarkup(bet) {
    const horseName = S.horses[bet.horse]?.userData.data.name || "Unknown horse";
    const source = bet.source === "counter" ? "COUNTER" : "ONLINE";
    return `
      <div class="ticket">
        <span>#${HD.horseNumber(bet.horse)} ${horseName} · ${source}</span>
        <strong>$${bet.amount} @ ${bet.odds}:1</strong>
        <small>WIN return $${bet.amount * (1 + bet.odds)} (includes stake)</small>
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
    renderBetQuotes();
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
              #${HD.horseNumber(d)} &middot; ${d.odds}:1
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
  function isBettingOpen() {
    return HD.Race.liveBettingOpen();
  }

  function normalizedStake(input) {
    return Math.max(5, Math.floor(Number(input.value || 5) / 5) * 5);
  }

  function placeOnlineBet() {
    const amount = normalizedStake(el.amount);
    const fee = Math.max(1, Math.ceil(amount * C.onlineBetFeeRate));
    submitBet(amount, fee, "online");
  }

  function placeCounterBet() {
    const amount = normalizedStake(el.counterAmount);
    submitBet(amount, 0, "counter");
  }

  function submitBet(amount, fee, source) {
    if (!Number.isFinite(amount) || amount < 5 ||
        !Number.isFinite(fee) || fee < 0) {
      HD.Audio?.cue?.("error");
      return announce("Enter a valid bet of at least $5.");
    }
    if (!isBettingOpen()) {
      HD.Audio?.cue?.("error");
      return announce("The betting book is closed.");
    }
    if (amount + fee > S.money) {
      HD.Audio?.cue?.("error");
      return announce("Not enough money for that ticket and fee.");
    }
    const d = S.horses[S.selected]?.userData.data;
    if (!d || !Number.isFinite(d.odds) || d.odds < 0) {
      return announce("Select a horse with an available betting quote.");
    }
    if (d.finished) return announce("That horse has already finished.");
    S.money -= amount + fee;
    S.bets.push({ horse: S.selected, amount, odds: d.odds, fee, source });
    addLedger(`Bet: #${HD.horseNumber(S.selected)}`, -amount);
    if (fee) addLedger("RaceBet service fee", -fee);
    const feeMessage = fee ? ` plus a $${fee} online fee` : " with no counter fee";
    announce(`$${amount} on ${d.name} at ${d.odds}:1${feeMessage}.`);
    HD.Audio?.cue?.("bet");
    HD.Audio?.cue?.("moneySpend");
    render();
    if (S.counterOpen) renderBetCounter();
  }
  function buy(id) {
    const { item, price, error } = HD.Concessions.purchase(id);
    if (error) {
      HD.Audio?.cue?.("error");
      return announce(error);
    }
    addLedger(`TrackMart order: ${item.name}`, -price);
    announce(`${item.name} ordered. Delivery in ${C.phoneDeliveryDuration} seconds.`);
    HD.Audio?.cue?.("purchase");
    HD.Audio?.cue?.("moneySpend");
    render();
  }

  function updateDeliveries(dt) {
    deliveryRenderTimer -= dt;
    const arrived = HD.Concessions.update(dt);
    arrived.forEach((id) => {
      announce(`${C.items[id].name} added to your inventory.`);
      HD.Audio?.cue?.("delivery");
    });
    if (arrived.length) render();
    if (deliveryRenderTimer <= 0) {
      deliveryRenderTimer = 0.25;
      renderDeliveries();
    }
  }

  function menu(show, pauseMenu = false) {
    el.menu.classList.toggle("closed", !show);
    el.menu.classList.toggle("pause-menu", show && pauseMenu);
    el.menuPlay.hidden = pauseMenu;
    el.menuResume.hidden = !pauseMenu;
    if (show) {
      document.querySelector("#settings-panel").hidden = true;
      document.querySelector(".menu-card").classList.remove("settings-active");
    }
  }
  function phone(show) {
    el.phone.classList.toggle("closed", !show);
    el.toggle.setAttribute("aria-expanded", String(show));
    document.body.classList.toggle("phone-open", show);
    HD.Audio?.cue?.(show ? "phoneOpen" : "phoneClose");
    if (show) {
      const now = new Date();
      el.phoneTime.textContent = now.toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      });
      el.phoneHomeClock.textContent = now.toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      });
      el.phoneHomeDate.textContent = now.toLocaleDateString([], {
        weekday: "long",
        month: "short",
        day: "numeric",
      }).toUpperCase();
      const owner = document.querySelector("#player-name")?.value.trim() || "TRACK FAN";
      el.phoneHomeOwner.textContent = `${owner.toUpperCase()}'S DAY AT THE DOWNS`;
      showPhoneHome();
    }
  }

  function showPhoneHome() {
    el.phone.classList.remove("app-open");
    el.phone.scrollTop = 0;
    document.querySelectorAll("[data-app]").forEach((button) => {
      button.classList.remove("active");
    });
    document.querySelectorAll("[data-panel]").forEach((panel) => {
      panel.classList.remove("active");
    });
  }

  function openPhoneApp(button) {
    if (button.dataset.app === 'transfer') {
      button.classList.remove('has-notification');
      renderMoneyRequests();
    }
    el.phone.classList.add("app-open");
    document.querySelectorAll("[data-app]").forEach((candidate) => {
      candidate.classList.toggle("active", candidate === button);
    });
    document.querySelectorAll("[data-panel]").forEach((panel) => {
      panel.classList.toggle("active", panel.dataset.panel === button.dataset.app);
    });
    if (button.dataset.app === "messages") {
      button.classList.remove("has-notification");
      renderChat();
    }
    HD.Audio?.cue?.("appOpen");
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
  function showRaceWinner(text) {
    el.raceWinner.textContent = text;
    el.raceWinner.classList.remove("visible");
    requestAnimationFrame(() => el.raceWinner.classList.add("visible"));
    clearTimeout(el.raceWinner.timer);
    el.raceWinner.timer = setTimeout(() => {
      el.raceWinner.classList.remove("visible");
    }, 4200);
  }
  function showRaceNotice(text, duration = 3600) {
    el.raceNotice.textContent = text;
    el.raceNotice.classList.add("visible");
    clearTimeout(el.raceNotice.timer);
    el.raceNotice.timer = setTimeout(() => {
      el.raceNotice.classList.remove("visible");
    }, duration);
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
    el.rankingsButton.hidden = !show || !hasOnlineLeaderboard();
    if (!show) showRankings(false);
  }

  function renderBetQuotes() {
    const horse = S.horses[S.selected]?.userData.data;
    for (const [input, button, id, online] of [
      [el.amount, el.bet, 'bet-quote', true],
      [el.counterAmount, el.counterPlaceBet, 'counter-bet-quote', false],
    ]) {
      const output = document.getElementById(id);
      if (!output) continue;
      const amount = normalizedStake(input);
      const fee = online ? Math.max(1, Math.ceil(amount * C.onlineBetFeeRate)) : 0;
      const valid = Number.isFinite(amount) && Number.isFinite(fee) &&
        horse && Number.isFinite(horse.odds) && !horse.finished;
      const open = isBettingOpen();
      button.disabled = !valid || !open || amount + fee > S.money;
      output.textContent = !open ? 'Betting closed.' : !valid
        ? 'Enter a valid stake and select a horse.'
        : 'WIN · #' + HD.horseNumber(horse) + ' ' + horse.name +
          ' · Stake $' + amount + ' + fee $' + fee +
          ' = $' + (amount + fee) + ' total. Return if won: $' +
          (amount * (1 + horse.odds)) + ' (includes stake).' +
          (amount + fee > S.money ? ' Insufficient funds.' : '');
    }
  }
  function itemTraitSummary(item) {
    const traits = HD.itemThrowProfile(item);
    return `${item.category.toUpperCase()} · WEIGHT ${traits.weight}/5 · EASE ${traits.throwingEase}/5`;
  }
  function updateBreakTimer(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainder = Math.max(0, Math.ceil(seconds % 60));
    el.breakTimer.textContent = `${minutes}:${String(remainder).padStart(2, "0")}`;
  }
  function showDay(day, onComplete) {
    cancelDayTransition();
    const generation = dayGeneration;
    const online = hasOnlineLeaderboard();
    el.dayTitle.textContent = `DAY ${day}`;
    el.daySubtitle.textContent = !online
      ? "PRACTICE RUN"
      : day === 1
      ? "PLAYERS AT THE TRACK"
      : "CURRENT BANKROLL STANDINGS";
    el.dayRankings.hidden = !online;
    if (online) renderAnimatedRankings(el.dayRankings, rankingEntries());
    el.dayTransition.hidden = false;
    requestAnimationFrame(() => {
      if (generation === dayGeneration) el.dayTransition.classList.add("visible");
    });
    dayTimeout = setTimeout(() => {
      el.dayTransition.classList.remove("visible");
      dayTimeout = setTimeout(() => {
        el.dayTransition.hidden = true;
        onComplete();
      }, 500);
    }, day === 1 ? 4200 : 3800);
  }

  function cancelDayTransition() {
    dayGeneration++;
    clearTimeout(dayTimeout);
    el.dayTransition.hidden = true;
    el.dayTransition.classList.remove("visible");
  }

  function showRankings(show, title = "CURRENT RANKINGS") {
    if (!hasOnlineLeaderboard()) {
      el.rankingsOverlay.hidden = true;
      return;
    }
    el.rankingsOverlay.hidden = !show;
    if (!show) return;

    el.rankingsTitle.textContent = title;
    renderAnimatedRankings(el.rankingsChart, rankingEntries());
    document.exitPointerLock?.();
  }
  function vendor(show) {
    S.vendorOpen = show;
    el.vendorShop.hidden = !show;
    document.body.classList.toggle("vendor-open", show);
    if (show) renderVendor();
  }
  function betCounter(show) {
    S.counterOpen = show;
    el.betCounter.hidden = !show;
    document.body.classList.toggle("vendor-open", show);
    if (show) renderBetCounter();
  }

  function renderBetCounter() {
    const open = isBettingOpen();
    el.counterHorses.innerHTML = S.horses
      .map((horse, index) => {
        const data = horse.userData.data;
        const selected = S.selected === index ? "selected" : "";
        return `
          <button class="horse-choice ${selected}" data-counter-horse="${index}">
            <strong>#${HD.horseNumber(data)} · ${data.odds}:1</strong>
            <span>${data.name}</span>
            <small>Official fee-free window</small>
          </button>
        `;
      })
      .join("");
    renderBetQuotes();
    el.counterHorses.querySelectorAll("[data-counter-horse]").forEach((button) => {
      button.onclick = () => {
        S.selected = Number(button.dataset.counterHorse);
        renderBetCounter();
        renderCards();
      };
    });
  }
  function renderVendor() {
    el.vendorItems.innerHTML = Object.entries(C.items)
      .map(([id, item]) => {
        const { price } = HD.Concessions.quote(id, "vendor");
        const disabled = S.money < price ? "disabled" : "";
        return `
          <article class="shop-item">
            <span class="item-icon">${item.icon}</span>
            <span>
              <strong>${item.name}</strong>
            <small>${itemEffectSummary(item)}Instant pickup · x${S.inventory[id]}</small>
            <small class="item-traits">${itemTraitSummary(item)}</small>
            </span>
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
    const { item, price, error } = HD.Concessions.purchase(id, "vendor");
    if (error) {
      HD.Audio?.cue?.("error");
      return announce(error);
    }
    HD.Controls.selectItem(id);
    addLedger(`Concourse pickup: ${item.name}`, -price);
    announce(`${item.name} picked up instantly.`);
    HD.Audio?.cue?.("purchase");
    HD.Audio?.cue?.("moneySpend");
    render();
    renderVendor();
  }
  el.bet.onclick = placeOnlineBet;
  el.amount.addEventListener('input', renderBetQuotes);
  el.counterAmount.addEventListener('input', renderBetQuotes);
  el.toggle.onclick = () => HD.Controls.setMode(S.mode === "phone" ? "look" : "phone");
  el.menuPlay.onclick = () => HD.MatchSetup.open();
  el.menuResume.onclick = () => HD.Controls.closeMenu();
  el.resultContinue.onclick = () => (S.phase === "matchOver" ? HD.Race.restart() : HD.Race.next());
  el.vendorClose.onclick = () => HD.Controls.closeVendor();
  el.counterPlaceBet.onclick = placeCounterBet;
  el.counterClose.onclick = () => HD.Controls.closeBetCounter();
  el.sendTransfer.onclick = sendTransfer;
  document.querySelector('#request-money').onclick = requestMoney;
  el.rankingsButton.onclick = () => {
    showRankings(true, `DAY ${S.round} CURRENT RANKINGS`);
  };
  el.rankingsClose.onclick = () => {
    showRankings(false);
    HD.world.renderer.domElement.requestPointerLock?.();
  };
  document
    .querySelectorAll(".stake-step")
    .forEach(
      (b) =>
        (b.onclick = () => {
          el.amount.value = Math.max(5, Number(el.amount.value || 5) + Number(b.dataset.step));
          renderBetQuotes();
        }),
    );
  document.querySelectorAll("[data-app]").forEach((button) => {
    button.onclick = () => openPhoneApp(button);
  });
  el.phoneHome.onclick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    showPhoneHome();
  };
  document.querySelectorAll('[data-horse-tab]').forEach((button) => {
    button.onclick = () => {
      const selectedTab = button.dataset.horseTab;
      document.querySelectorAll('[data-horse-tab]').forEach((candidate) => {
        candidate.classList.toggle('active', candidate === button);
      });
      document.querySelectorAll('[data-horse-view]').forEach((panel) => {
        panel.hidden = panel.dataset.horseView !== selectedTab;
      });
    };
  });
  el.messageThread.onchange = renderChat;
  el.messageCompose.onsubmit = sendChatMessage;
  updateLeaderboardAvailability();
  return {
    render,
    renderCards,
    renderOddsWatch,
    renderLeaderboard,
    updateLeaderboardAvailability,
    renderChat,
    receiveChatMessage,
    receiveMoneyRequest,
    phone,
    announce,
    showRaceWinner,
    showRaceNotice,
    addLedger,
    showResult,
    hideResult,
    setMode,
    power,
    updateDeliveries,
    showRoundBreak,
    updateBreakTimer,
    showDay,
    cancelDayTransition,
    showRankings,
    vendor,
    betCounter,
    menu,
    countdown: (value) => {
      const text = String(value);
      if (el.countdown.textContent !== text) el.countdown.textContent = text;
    },
    progress: (value) => {
      const width = `${Math.round(value * 1000) / 10}%`;
      if (el.progress.style.width !== width) el.progress.style.width = width;
    },
  };
})();
