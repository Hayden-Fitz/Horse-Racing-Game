import fs from "node:fs/promises";

const port = process.argv[2] || "9337";
const page = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" }).then((response) => response.json());
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});
let nextId = 1;
const pending = new Map();
const errors = [];
socket.addEventListener("message", ({ data }) => {
  const message = JSON.parse(data);
  if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails);
  if (message.id) {
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  }
});
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    const timeout = setTimeout(() => reject(new Error(`Browser timeout: ${method}`)), 30000);
    pending.set(id, {
      resolve(value) { clearTimeout(timeout); resolve(value); },
      reject(error) { clearTimeout(timeout); reject(error); },
    });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
await call("Runtime.enable");
await call("Page.enable");
await call("Network.enable");
await call("Network.setCacheDisabled", { cacheDisabled: true });
await call("Emulation.setDeviceMetricsOverride", { width: 1600, height: 1100, deviceScaleFactor: 1, mobile: false });
await call("Page.navigate", { url: "http://127.0.0.1:8080/model-gallery.html" });
let ready = false;
for (let attempt = 0; attempt < 100; attempt++) {
  const result = await call("Runtime.evaluate", { expression: "window.modelGalleryReady === true", returnByValue: true });
  if (result.result?.value) { ready = true; break; }
  await new Promise((resolve) => setTimeout(resolve, 300));
}
if (!ready) throw new Error(`Model gallery did not load: ${JSON.stringify(errors)}`);
const screenshot = await call("Page.captureScreenshot", { format: "png" });
await fs.mkdir("artifacts", { recursive: true });
await fs.writeFile("artifacts/model-gallery.png", Buffer.from(screenshot.data, "base64"));
await call("Runtime.evaluate", {
  expression: "window.scrollTo(0, document.documentElement.scrollHeight)",
});
await new Promise((resolve) => setTimeout(resolve, 180));
const playerScreenshot = await call("Page.captureScreenshot", { format: "png" });
await fs.writeFile(
  "artifacts/player-customization.png",
  Buffer.from(playerScreenshot.data, "base64"),
);
console.log(JSON.stringify({ galleryReady: ready, errors }));
await call("Page.navigate", { url: "http://127.0.0.1:8080/index.html" });
let booted = false;
for (let attempt = 0; attempt < 100; attempt++) {
  const result = await call("Runtime.evaluate", {
    expression: "Boolean(window.HD?.world?.renderer && window.HD?.state?.horses?.length)", returnByValue: true,
  });
  if (result.result?.value) { booted = true; break; }
  await new Promise((resolve) => setTimeout(resolve, 300));
}
const state = await call("Runtime.evaluate", {
  expression: `JSON.stringify({
    renderer: Boolean(window.HD?.world?.renderer),
    horses: window.HD?.state?.horses?.length,
    importedHotdog: window.HD?.Models?.throwable('hotdog')?.userData?.importedModel,
    assetFailures: [...(window.HD?.Assets?.failures || [])]
  })`, returnByValue: true,
});
console.log(JSON.stringify({ game: state.result?.value, errors }));
await call("Runtime.evaluate", {
  expression: `(() => {
    HD.state.paused = true;
    document.querySelectorAll('#viewport > :not(canvas)').forEach(node => { node.style.display = 'none'; });
    document.querySelector('#game-menu').style.display = 'none';
    document.querySelector('#phone').style.display = 'none';
    document.querySelector('#phone-toggle').style.display = 'none';
    const camera = HD.world.camera;
    window.__arenaReviewCamera = {
      position: camera.position.toArray(),
      quaternion: camera.quaternion.toArray(),
    };
    camera.position.set(148, 132, 156);
    camera.lookAt(0, 8, 0);
    camera.updateProjectionMatrix();
    HD.world.renderer.render(HD.world.scene, camera);
    return {
      secondFloor: [...HD.world.scene.children].some(root => root.traverse && (() => {
        let found = false; root.traverse(node => { found ||= node.userData?.seatingFloor === 2; }); return found;
      })()),
      tunnel: Boolean(HD.world.horseTunnel),
    };
  })()`, returnByValue: true,
});
const arenaScreenshot = await call("Page.captureScreenshot", { format: "png" });
await fs.writeFile("artifacts/arena-isometric.png", Buffer.from(arenaScreenshot.data, "base64"));
await call("Runtime.evaluate", {
  expression: `(() => {
    document.querySelectorAll('#viewport > :not(canvas)').forEach(node => { node.style.display = ''; });
    document.querySelector('#game-menu').style.display = '';
    document.querySelector('#phone').style.display = '';
    document.querySelector('#phone-toggle').style.display = '';
    const saved = window.__arenaReviewCamera;
    if (saved) {
      HD.world.camera.position.fromArray(saved.position);
      HD.world.camera.quaternion.fromArray(saved.quaternion);
      HD.world.camera.updateProjectionMatrix();
      delete window.__arenaReviewCamera;
    }
  })()`,
});
const typing = await call("Runtime.evaluate", {
  expression: `(() => {
    const input = document.createElement('textarea');
    document.body.append(input);
    input.focus();
    const before = HD.state.mode;
    const wasPaused = HD.state.paused;
    HD.state.paused = false;
    for (const code of ['ShiftLeft', 'KeyF', 'KeyR', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Digit1']) {
      input.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
    }
    const safe = HD.state.mode === before && !HD.state.charging &&
      Object.values(HD.state.movement).every(value => !value);
    input.remove();
    HD.state.paused = wasPaused;
    return safe;
  })()`, returnByValue: true,
});
console.log(JSON.stringify({ typingDoesNotTriggerGameplay: typing.result?.value }));
const setupOpened = await call("Runtime.evaluate", {
  expression: `(() => {
    document.querySelector('#menu-play').click();
    return document.querySelector('#practice-setup').open && HD.state.paused;
  })()`, returnByValue: true,
});
if (!setupOpened.result?.value) throw new Error('Practice setup did not open in a paused lobby');
await new Promise(resolve => setTimeout(resolve, 300));
const setupScreenshot = await call("Page.captureScreenshot", { format: "png" });
await fs.writeFile("artifacts/practice-setup.png", Buffer.from(setupScreenshot.data, "base64"));
await call("Emulation.setDeviceMetricsOverride", {
  width: 540, height: 820, deviceScaleFactor: 1, mobile: false,
});
const narrowSetup = await call("Runtime.evaluate", {
  expression: `(() => {
    const panel = document.querySelector('#practice-setup');
    return panel.scrollWidth <= panel.clientWidth + 1;
  })()`, returnByValue: true,
});
if (!narrowSetup.result?.value) throw new Error('Practice setup overflows a narrow screen');
await call("Emulation.setDeviceMetricsOverride", {
  width: 1600, height: 1100, deviceScaleFactor: 1, mobile: false,
});
const cancelledSetup = await call("Runtime.evaluate", {
  expression: `(() => {
    const panel = document.querySelector('#practice-setup');
    panel.querySelector('[name=horses]').value = '4';
    panel.querySelector('[data-back]').click();
    const cancelled = !panel.open && HD.CONFIG.raceHorseCount === 6 && HD.state.paused;
    document.querySelector('#menu-play').click();
    return cancelled && panel.querySelector('[name=horses]').value === '6';
  })()`, returnByValue: true,
});
if (!cancelledSetup.result?.value) throw new Error('Cancelling practice mutated match rules');
const practiceStarted = await call("Runtime.evaluate", {
  expression: `(() => {
    HD.world.renderer.domElement.requestPointerLock = () => {};
    const panel = document.querySelector('#practice-setup');
    panel.querySelector('[name=horses]').value = '8';
    panel.querySelector('[name=days]').value = '5';
    panel.querySelector('[name=racesPerDay]').value = '3';
    panel.querySelector('[name=days]').dispatchEvent(new Event('input', { bubbles: true }));
    const summary = panel.querySelector('.practice-note').textContent.includes('15 total races');
    panel.querySelector('[name=laps]').value = '1';
    panel.querySelector('[name=startingMoney]').value = '1000';
    panel.querySelector('[name=crowd]').value = 'off';
    panel.querySelector('form').requestSubmit();
    return summary && HD.CONFIG.totalRaces === 15 && HD.CONFIG.racesPerRound === 3 &&
      document.querySelector('#round').textContent === '1 / 5' &&
      !panel.open && HD.state.horses.length === 8 &&
      HD.world.laneMarkings.children.length === 9 &&
      HD.state.money === 1000 && HD.CONFIG.raceLaps === 1 &&
      HD.CONFIG.crowdThrowInterval === 0 && HD.CONFIG.sabotageEnabled === true &&
      document.querySelector('#sabotage-options button');
  })()`, returnByValue: true,
});
if (!practiceStarted.result?.value) throw new Error('Practice rules did not reach the simulation');
const practiceUi = await call("Runtime.evaluate", {
  expression: `(() => {
    const leadersButton = document.querySelector('[data-app=leaders]');
    const leadersPanel = document.querySelector('[data-panel=leaders]');
    const settings = document.querySelector('#settings-panel');
    const heading = settings.querySelector('.settings-heading');
    settings.hidden = false;
    settings.scrollTop = 10000;
    const sticky = getComputedStyle(heading).position === 'sticky' &&
      heading.getBoundingClientRect().top >= settings.getBoundingClientRect().top - 2;
    settings.hidden = true;
    document.documentElement.style.setProperty('--ui-scale', '1.25');
    const scaleSelectors = [
      '#menu-button', '.topbar', '.hotbar', '.menu-shell', '.results > div',
      '.vendor-shop > div', '.bet-counter > div', '.practice-setup'
    ];
    const scaleValues = Object.fromEntries(scaleSelectors.map((selector) => [
      selector,
      Number.parseFloat(getComputedStyle(document.querySelector(selector)).zoom)
    ]));
    const phone = document.querySelector('#phone');
    const phoneWasClosed = phone.classList.contains('closed');
    const phoneWasOpen = document.body.classList.contains('phone-open');
    const previousTransition = phone.style.transition;
    document.body.classList.add('phone-open');
    phone.classList.remove('closed');
    phone.style.transition = 'none';
    const phoneScale = Math.abs(new DOMMatrix(getComputedStyle(phone).transform).a);
    phone.classList.toggle('closed', phoneWasClosed);
    document.body.classList.toggle('phone-open', phoneWasOpen);
    phone.style.transition = previousTransition;
    const globallyScaled = Object.values(scaleValues).every((zoom) => zoom === 1.25) &&
      phoneScale === 1.25;
    document.documentElement.style.setProperty('--ui-scale', '1');
    return { ok: leadersButton.hidden && leadersPanel.hidden && sticky &&
      globallyScaled &&
      HD.state.money === 1000 && HD.MatchSetup.normalize({ startingMoney: 0 }).startingMoney === 100 &&
      HD.MatchSetup.normalize({ startingMoney: 5000 }).startingMoney === 1000,
      sticky, globallyScaled, phoneScale, scaleValues };
  })()`, returnByValue: true,
});
if (!practiceUi.result?.value?.ok) {
  throw new Error(`Practice UI review failed: ${JSON.stringify(practiceUi.result?.value)}`);
}
console.log(JSON.stringify({ practiceSetupAndStart: true, practiceUi: true }));
await call("Runtime.evaluate", {
  expression: `(() => {
    HD.world.renderer.domElement.requestPointerLock = () => {};
    HD.state.inventory.hotdog = 3;
    HD.state.phase = 'racing';
    HD.UI.menu(false);
    HD.state.paused = false;
    HD.Controls.selectItem('hotdog');
    HD.Controls.setMode('throw');
    HD.UI.countdown('');
    HD.Controls.update(0.016);
    HD.world.renderer.render(HD.world.scene, HD.world.camera);
  })()`, returnByValue: true,
});
await new Promise(resolve => setTimeout(resolve, 500));
const heldScreenshot = await call("Page.captureScreenshot", { format: "png" });
await fs.writeFile("artifacts/hotdog-held.png", Buffer.from(heldScreenshot.data, "base64"));
const throwing = await call("Runtime.evaluate", {
  expression: `(() => {
    const canvas = HD.world.renderer.domElement;
    const inventoryBefore = HD.state.inventory.hotdog;
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF', bubbles: true }));
    const stowed = HD.state.mode === 'look';
    document.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyF', bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF', bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyF', bubbles: true }));
    const heldWithoutThrowing = HD.state.mode === 'throw' && !HD.state.charging && HD.state.inventory.hotdog === inventoryBefore;
    canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true }));
    HD.Controls.update(0.3);
    const charged = HD.state.charging && HD.state.throwPower > 0;
    document.dispatchEvent(new PointerEvent('pointerup', { button: 0, bubbles: true }));
    return stowed && heldWithoutThrowing && charged && HD.state.inventory.hotdog === inventoryBefore - 1;
  })()`, returnByValue: true,
});
console.log(JSON.stringify({ holdToggleAndMouseThrow: throwing.result?.value }));
const replacement = await call("Runtime.evaluate", {
  expression: `(() => {
    const canvas = HD.world.renderer.domElement;
    HD.state.inventory = { ...HD.createInventory(), hotdog: 1, horseshoe: 1, carrot: 1 };
    HD.Controls.selectItem('hotdog');
    HD.Controls.setMode('throw');
    const throwOnce = () => {
      canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true }));
      HD.Controls.update(0.4);
      document.dispatchEvent(new PointerEvent('pointerup', { button: 0, bubbles: true }));
    };
    throwOnce();
    const sameCategory = HD.state.selectedItem === 'carrot' && HD.world.heldItem.visible;
    throwOnce();
    const fallback = HD.state.selectedItem === 'horseshoe' && HD.world.heldItem.visible;
    throwOnce();
    return sameCategory && fallback && HD.state.mode === 'look' && !HD.world.heldItem.visible;
  })()`, returnByValue: true,
});
console.log(JSON.stringify({ categoryReplacementAndEmptyHands: replacement.result?.value }));
if (!replacement.result?.value) throw new Error('Category replacement or empty-hands cleanup failed');
const horseIdentities = await call("Runtime.evaluate", {
  expression: `(() => {
    HD.UI.render();
    const cards = [...document.querySelectorAll('[data-horse]')];
    const identitiesMatch = cards.every(card => {
      const index = Number(card.dataset.horse);
      return card.textContent.includes('#' + HD.horseNumber(index));
    });
    const profiles = [...document.querySelectorAll('.odds-profile')];
    const reserves = profiles.filter(profile => profile.classList.contains('reserve'));
    return cards.length === HD.state.horses.length && identitiesMatch &&
      profiles.length === HD.CONFIG.horses.length && reserves.length > 0 &&
      reserves.every(profile => profile.textContent.includes('NOT ENTERED') &&
        !profile.textContent.includes('%'));
  })()`, returnByValue: true,
});
console.log(JSON.stringify({ horseIdentitiesAndReserveOdds: horseIdentities.result?.value }));
if (!horseIdentities.result?.value) throw new Error('Horse identity/odds UI check failed');
const concessions = await call("Runtime.evaluate", {
  expression: `(() => {
    HD.state.paused = true;
    HD.state.money = 1000;
    HD.state.deliveries = [];
    const selected = HD.state.selectedItem;
    const before = HD.state.inventory.hotdog || 0;
    document.querySelector('[data-buy-item="hotdog"]').click();
    const ordered = HD.state.deliveries.length === 1 &&
      (HD.state.inventory.hotdog || 0) === before &&
      document.querySelector('#deliveries').textContent.includes('ORDERED');
    HD.UI.updateDeliveries(6);
    const delivering = document.querySelector('#deliveries').textContent.includes('DELIVERING') &&
      document.querySelector('#deliveries progress').value === 50;
    HD.UI.updateDeliveries(6);
    const delivered = HD.state.inventory.hotdog === before + 1 &&
      HD.state.selectedItem === selected &&
      document.querySelector('#deliveries').textContent.includes('DELIVERED');
    HD.UI.updateDeliveries(4);
    return ordered && delivering && delivered && HD.state.deliveries.length === 0;
  })()`, returnByValue: true,
});
console.log(JSON.stringify({ concessionsFlow: concessions.result?.value }));
if (!concessions.result?.value) throw new Error('Concessions UI flow failed');
await call("Runtime.evaluate", {
  expression: `(() => {
    HD.UI.countdown('');
    HD.UI.menu(false);
    HD.Controls.setMode('phone');
    document.querySelector('[data-app="shop"]').click();
    document.querySelector('[data-buy-item="hotdog"]').click();
    document.querySelector('[data-buy-item="soda"]').click();
    HD.UI.updateDeliveries(5);
  })()`, returnByValue: true,
});
await new Promise(resolve => setTimeout(resolve, 400));
const deliveryLayout = await call("Runtime.evaluate", {
  expression: `(() => {
    const panel = document.querySelector('#deliveries');
    const cards = [...panel.querySelectorAll('.delivery-card')];
    return cards.length === 2 && panel.scrollWidth <= panel.clientWidth + 1 &&
      cards[1].getBoundingClientRect().top >= cards[0].getBoundingClientRect().bottom;
  })()`, returnByValue: true,
});
if (!deliveryLayout.result?.value) throw new Error('Multiple delivery cards overlap or overflow');
const deliveryScreenshot = await call("Page.captureScreenshot", { format: "png" });
await fs.writeFile("artifacts/concessions-deliveries.png", Buffer.from(deliveryScreenshot.data, "base64"));
// Close through the browser endpoint: Page.close can drop its own connection
// before the reply reaches us, leaving an otherwise successful review hanging.
await fetch(`http://127.0.0.1:${port}/json/close/${page.id}`, {
  signal: AbortSignal.timeout(5000),
});
socket.close();
if (errors.length || !throwing.result?.value || !typing.result?.value || !state.result?.value?.includes('"importedHotdog":"hotdog"')) process.exitCode = 1;
