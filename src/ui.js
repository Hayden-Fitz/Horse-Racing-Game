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
    raceEventBadge: $("#race-event-badge"),
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
    leaderboard: $("#leaderboard-list"),
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
    trackPayBalance: $("#trackpay-balance"),
    requestMoney: $("#request-money"),
    requestItem: $("#request-item"),
    requestTransfer: $("#request-transfer"),
    trackPayRequests: $("#trackpay-requests"),
    phoneNotification: $("#phone-notification"),
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
  const rankingRowHeight = 44;
  const pendingTrackPayRequests = new Map();
  let activePhoneNotification = null;

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
    renderSabotage();
    renderTransfer();
    renderChat();
    renderRaceEvent();
  }

  function renderRaceEvent() {
    if (!el.raceEventBadge) return;
    const event = S.raceEvent;
    if (!event) {
      el.raceEventBadge.textContent = "";
      return;
    }
    el.raceEventBadge.innerHTML = `
      <strong>${escapeMarkup(event.location)}</strong>
      <span>${escapeMarkup(event.label)} · ${escapeMarkup(event.modifierLabel)}</span>
    `;
  }

  function renderOddsWatch() {
    const runningById = new Map(
      S.horses.map((horse) => [horse.userData.data.id, horse.userData.data]),
    );
    el.oddsWatch.innerHTML = C.horses
      .map((horse) => {
        const active = runningById.get(horse.id);
        const odds = active?.odds || horse.odds;
        const chance = active?.liveChance
          ? Math.round(active.liveChance * 100)
          : Math.max(3, Math.round(100 / (odds + 1)));
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
              <span><strong>${horse.name}</strong><small>${horse.style.toUpperCase()}</small></span>
              <em>${odds}:1</em>
            </header>
            <div>
              <span>WIN CHANCE <b>${chance}%</b></span>
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
    const rankings = rankingEntries();
    renderAnimatedRankings(el.leaderboard, rankings);
    if (!el.rankingsOverlay.hidden) renderAnimatedRankings(el.rankingsChart, rankings);
    if (!el.dayTransition.hidden) renderAnimatedRankings(el.dayRankings, rankings);
  }

  function rankingEntries() {
    const online = HD.Network?.rankingPlayers?.() || [];
    if (online.length) return online.sort((a, b) => b.money - a.money);

    const computerPlayers = HD.AI?.rankingPlayers?.() || [];
    if (computerPlayers.length) {
      return [
        { id: "you", name: "YOU", money: S.money },
        ...computerPlayers,
      ].sort((a, b) => b.money - a.money);
    }

    return [
      { id: "you", name: "YOU", money: S.money },
      { id: "maya", name: "Maya", money: 80 + S.race * 28 },
      { id: "dex", name: "Dex", money: 135 + S.race * 12 },
      { id: "rin", name: "Rin", money: 105 + S.race * 19 },
      { id: "sol", name: "Sol", money: 92 + S.race * 21 },
      { id: "nia", name: "Nia", money: 145 + S.race * 8 },
      { id: "bo", name: "Bo", money: 70 + S.race * 24 },
      { id: "kit", name: "Kit", money: 118 + S.race * 14 },
    ].sort((a, b) => b.money - a.money);
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
        return `
          <button class="${classes.join(" ")}" data-hotbar-item="${id}">
            <kbd>${index === 9 ? 0 : index + 1}</kbd>
            <span>${item.icon}</span>
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
      <strong>#${horseIndex + 1} ${S.horses[horseIndex].userData.data.name}</strong>
      <span>$${amount} total stake</span>
    `;
  }

  function renderSabotage() {
    if (!S.horses.length) return;
    const playerPlan = S.sabotagePlans.find((plan) => !plan.ai && !plan.remote);
    const canHire = S.phase === "betting" && !playerPlan;
    el.sabotageTargets.innerHTML = S.horses
      .map((horse, index) => {
        const data = horse.userData.data;
        const selected = S.selected === index ? "selected" : "";
        return `
          <button class="horse-choice ${selected}" data-sabotage-horse="${index}">
            <strong>#${index + 1} · ${data.odds}:1</strong>
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
        `Fixer hired for #${plan.horse + 1}. Outcome sealed until race start.`;
    } else {
      el.sabotageStatus.textContent = plan.failed
        ? `Attempt against #${plan.horse + 1}: FAILED.`
        : `Attempt against #${plan.horse + 1}: SUCCESSFUL.`;
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

    const requestedItem = el.requestItem.value;
    el.requestItem.innerHTML = '<option value="">No item</option>' +
      Object.entries(C.items)
        .map(([id, item]) => `<option value="${id}">${item.name}</option>`)
        .join("");
    if (C.items[requestedItem]) el.requestItem.value = requestedItem;
    el.requestTransfer.disabled = !targets.length;
    el.trackPayBalance.textContent = `$${S.money}`;
    renderTrackPayRequests();
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

  function requestTransfer() {
    const target = el.transferPlayer.value;
    const money = Math.max(0, Math.floor(Number(el.requestMoney.value) || 0));
    const itemId = el.requestItem.value;
    if (!target || (!money && !itemId)) {
      HD.Audio?.cue?.("error");
      return announce("Choose a player and money or an item to request.");
    }

    const requested = HD.Network.isConnected()
      ? HD.Network.sendTransferRequest(target, money, itemId)
      : HD.AI.requestTransfer(target, money, itemId);
    if (!requested) {
      HD.Audio?.cue?.("error");
      return announce("That TrackPay request could not be sent.");
    }

    el.requestMoney.value = 0;
    el.requestItem.value = "";
    const description = money ? `$${money}` : C.items[itemId]?.name || "an item";
    el.transferStatus.textContent = `Requested ${description}.`;
    HD.Audio?.cue?.("messageSent");
  }

  function receiveTrackPayRequest(request) {
    if (!request?.id || pendingTrackPayRequests.has(request.id)) return;
    pendingTrackPayRequests.set(request.id, request);
    renderTrackPayRequests();
    showPhoneNotification(
      "transfer",
      request.fromName || "TrackPay request",
      request.money
        ? `Requests $${request.money}`
        : `Requests your ${C.items[request.itemId]?.name || "item"}`,
    );
    HD.Audio?.cue?.("paymentRequest");
  }

  function receiveTrackPayTransfer(transfer) {
    const description = transfer.money
      ? `$${transfer.money}`
      : C.items[transfer.itemId]?.name || "an item";
    showPhoneNotification(
      "transfer",
      transfer.fromName || "TrackPay",
      `Sent you ${description}`,
    );
    HD.Audio?.cue?.("moneyGain");
  }

  function receiveTrackPayResponse(response) {
    showPhoneNotification(
      "transfer",
      response.fromName || "TrackPay",
      response.accepted ? "Accepted your request" : "Declined your request",
    );
    HD.Audio?.cue?.(response.accepted ? "message" : "error");
  }

  function renderTrackPayRequests() {
    if (!el.trackPayRequests) return;
    const requests = [...pendingTrackPayRequests.values()];
    el.trackPayRequests.innerHTML = requests.length
      ? requests.map((request) => {
          const description = request.money
            ? `$${request.money}`
            : C.items[request.itemId]?.name || "an item";
          return `
            <article data-trackpay-request="${escapeMarkup(request.id)}">
              <span>
                <strong>${escapeMarkup(request.fromName || "Player")}</strong>
                <small>REQUESTED ${escapeMarkup(description)}</small>
              </span>
              <button data-request-response="accept">PAY</button>
              <button data-request-response="decline">DECLINE</button>
            </article>
          `;
        }).join("")
      : "<span>No pending requests.</span>";

    el.trackPayRequests.querySelectorAll("[data-request-response]").forEach((button) => {
      button.onclick = () => respondToTrackPayRequest(
        button.closest("[data-trackpay-request]").dataset.trackpayRequest,
        button.dataset.requestResponse === "accept",
      );
    });
  }

  function respondToTrackPayRequest(requestId, accepted) {
    const request = pendingTrackPayRequests.get(requestId);
    if (!request) return;
    const completed = HD.Network.isConnected()
      ? HD.Network.respondToTransferRequest(request, accepted)
      : HD.AI.respondToTransferRequest(request, accepted);
    if (!completed && accepted) {
      HD.Audio?.cue?.("error");
      return announce("You do not have enough to complete that request.");
    }
    pendingTrackPayRequests.delete(requestId);
    renderTrackPayRequests();
    el.transferStatus.textContent = accepted ? "Request paid." : "Request declined.";
    if (![...pendingTrackPayRequests].length) {
      document.querySelector('[data-app="transfer"]')?.classList.remove("has-notification");
    }
    render();
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
    showPhoneNotification(
      "messages",
      message.fromName || "New message",
      message.text,
    );
    HD.Audio?.cue?.("message");
  }

  function showPhoneNotification(app, title, body) {
    const button = document.querySelector(`[data-app="${app}"]`);
    button?.classList.add("has-notification");
    activePhoneNotification = app;
    el.phoneNotification.dataset.app = app;
    el.phoneNotification.querySelector("strong").textContent = title;
    el.phoneNotification.querySelector("small").textContent = body;
    el.phoneNotification.hidden = false;
    el.phoneNotification.classList.remove("visible");
    requestAnimationFrame(() => el.phoneNotification.classList.add("visible"));
    clearTimeout(el.phoneNotification.timer);
    el.phoneNotification.timer = setTimeout(() => {
      el.phoneNotification.classList.remove("visible");
    }, 5200);
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
      .filter(([, item]) => !item.vendorOnly)
      .map(([id, item]) => {
        const selected = S.selectedItem === id ? "selected" : "";
        const disabled = S.money < item.price ? "disabled" : "";
        return `
          <article class="shop-item ${selected}">
            <button class="item-select" data-select-item="${id}">
              <span class="item-icon">${item.icon}</span>
              <span>
                <strong>${item.name}</strong>
                <small><b class="item-effect">${itemEffectSummary(item)}</b>${item.description}</small>
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
            return `<span>${C.items[delivery.id].icon} ${seconds}s</span>`;
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
        <span>#${bet.horse + 1} ${horseName} · ${source}</span>
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
  function isBettingOpen() {
    return HD.Race.liveBettingOpen();
  }

  function normalizedStake(input) {
    const minimum = S.raceEvent?.minBet || 5;
    return Math.max(
      minimum,
      Math.floor(Number(input.value || minimum) / 5) * 5,
    );
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
    if (!isBettingOpen()) {
      HD.Audio?.cue?.("error");
      return announce("The betting book is closed.");
    }
    if (amount + fee > S.money) {
      HD.Audio?.cue?.("error");
      return announce("Not enough money for that ticket and fee.");
    }
    const d = S.horses[S.selected].userData.data;
    if (d.finished) return announce("That horse has already finished.");
    S.money -= amount + fee;
    S.bets.push({ horse: S.selected, amount, odds: d.odds, fee, source });
    addLedger(`Bet: #${S.selected + 1}`, -amount);
    if (fee) addLedger("RaceBet service fee", -fee);
    const feeMessage = fee ? ` plus a $${fee} online fee` : " with no counter fee";
    announce(`$${amount} on ${d.name} at ${d.odds}:1${feeMessage}.`);
    HD.Audio?.cue?.("bet");
    HD.Audio?.cue?.("moneySpend");
    render();
    if (S.counterOpen) renderBetCounter();
  }
  function buy(id) {
    const item = C.items[id];
    if (S.money < item.price) {
      HD.Audio?.cue?.("error");
      return announce(`You need $${item.price}.`);
    }
    S.money -= item.price;
    S.deliveries.push({ id, remaining: C.phoneDeliveryDuration });
    addLedger(`TrackMart order: ${item.name}`, -item.price);
    announce(`${item.name} ordered. Delivery in ${C.phoneDeliveryDuration} seconds.`);
    HD.Audio?.cue?.("purchase");
    HD.Audio?.cue?.("moneySpend");
    render();
  }

  function updateDeliveries(dt) {
    deliveryRenderTimer -= dt;
    S.deliveries.forEach((delivery) => {
      delivery.remaining -= dt;
      if (delivery.remaining <= 0 && !delivery.complete) {
        delivery.complete = true;
        S.inventory[delivery.id]++;
        HD.Controls.selectItem(delivery.id);
        announce(`${C.items[delivery.id].name} delivered to your seat!`);
        HD.Audio?.cue?.("delivery");
        render();
      }
    });
    S.deliveries = S.deliveries.filter((delivery) => !delivery.complete);
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
    } else {
      el.menu.classList.remove("match-setup-open");
      document.querySelector("#match-setup").hidden = true;
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
    document.querySelectorAll("[data-app]").forEach((button) => {
      button.classList.remove("active");
    });
    document.querySelectorAll("[data-panel]").forEach((panel) => {
      panel.classList.remove("active");
    });
  }

  function openPhoneApp(button) {
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
    if (button.dataset.app === "transfer") {
      button.classList.remove("has-notification");
      renderTransfer();
    }
    if (activePhoneNotification === button.dataset.app) {
      activePhoneNotification = null;
      el.phoneNotification.classList.remove("visible");
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
    el.rankingsButton.hidden = !show;
    if (!show) showRankings(false);
  }
  function updateBreakTimer(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainder = Math.max(0, Math.ceil(seconds % 60));
    el.breakTimer.textContent = `${minutes}:${String(remainder).padStart(2, "0")}`;
  }
  function showDay(day, onComplete) {
    el.dayTitle.textContent = `DAY ${day}`;
    el.daySubtitle.textContent = day === 1
      ? "PLAYERS AT THE TRACK"
      : "CURRENT BANKROLL STANDINGS";
    renderAnimatedRankings(el.dayRankings, rankingEntries());
    el.dayTransition.hidden = false;
    requestAnimationFrame(() => el.dayTransition.classList.add("visible"));
    setTimeout(() => {
      el.dayTransition.classList.remove("visible");
      setTimeout(() => {
        el.dayTransition.hidden = true;
        onComplete();
      }, 500);
    }, day === 1 ? 4200 : 3800);
  }

  function showRankings(show, title = "CURRENT RANKINGS") {
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
            <strong>#${index + 1} · ${data.odds}:1</strong>
            <span>${data.name}</span>
            <small>Official fee-free window</small>
          </button>
        `;
      })
      .join("");
    el.counterPlaceBet.disabled = !open || S.money < 5;
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
        const price = Math.ceil(item.price * (1 - C.vendorDiscount));
        const disabled = S.money < price ? "disabled" : "";
        return `
          <article class="shop-item">
            <span class="item-icon">${item.icon}</span>
            <span>
              <strong>${item.name}</strong>
              <small>${itemEffectSummary(item)}Instant pickup · x${S.inventory[id]}</small>
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
    const item = C.items[id];
    const price = Math.ceil(item.price * (1 - C.vendorDiscount));
    if (S.money < price) {
      HD.Audio?.cue?.("error");
      return announce("Not enough money.");
    }
    S.money -= price;
    S.inventory[id]++;
    HD.Controls.selectItem(id);
    addLedger(`Concourse pickup: ${item.name}`, -price);
    announce(`${item.name} picked up instantly.`);
    HD.Audio?.cue?.("purchase");
    HD.Audio?.cue?.("moneySpend");
    render();
    renderVendor();
  }
  el.bet.onclick = placeOnlineBet;
  el.toggle.onclick = () => HD.Controls.setMode(S.mode === "phone" ? "look" : "phone");
  el.menuPlay.onclick = () => HD.MatchSetup.openSinglePlayer();
  el.menuResume.onclick = () => HD.Controls.closeMenu();
  el.resultContinue.onclick = () => (S.phase === "matchOver" ? HD.Race.restart() : HD.Race.next());
  el.vendorClose.onclick = () => HD.Controls.closeVendor();
  el.counterPlaceBet.onclick = placeCounterBet;
  el.counterClose.onclick = () => HD.Controls.closeBetCounter();
  el.sendTransfer.onclick = sendTransfer;
  el.requestTransfer.onclick = requestTransfer;
  el.phoneNotification.onclick = () => {
    const button = document.querySelector(
      `[data-app="${el.phoneNotification.dataset.app}"]`,
    );
    if (button) openPhoneApp(button);
  };
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
        (b.onclick = () =>
          (el.amount.value = Math.max(5, Number(el.amount.value || 5) + Number(b.dataset.step)))),
    );
  document.querySelectorAll("[data-app]").forEach((button) => {
    button.onclick = () => openPhoneApp(button);
  });
  el.phoneHome.onclick = showPhoneHome;
  el.messageThread.onchange = renderChat;
  el.messageCompose.onsubmit = sendChatMessage;
  return {
    render,
    renderCards,
    renderOddsWatch,
    renderLeaderboard,
    renderChat,
    receiveChatMessage,
    receiveTrackPayRequest,
    receiveTrackPayTransfer,
    receiveTrackPayResponse,
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
