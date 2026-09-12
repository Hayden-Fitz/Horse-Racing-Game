"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
for (const file of ["src/ui.js", "src/race.js", "src/stadium.js"]) {
  assert.ok(!/#\$\{[^}]*\+\s*1\}/.test(read(file)),
    `${file}: displayed horse identity must not come from a field index`);
}
const html = read("index.html");
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);

assert.equal(new Set(ids).size, ids.length, "index.html contains duplicate IDs");
assert.ok(ids.includes('news-live-canvas'),
  'DerbyNews must include the Stadium Vision livestream canvas');
for (const icon of [
  'betting-flat.svg',
  'concessions-flat.svg',
  'horses-flat.svg',
  'bank-flat.svg',
  'news-flat.svg',
  'fixer-flat.svg',
  'pay-flat.svg',
  'messages-flat.svg',
]) {
  assert.ok(read('polish.css').includes(icon), 'Missing flat phone icon: ' + icon);
  assert.ok(fs.existsSync(path.join(root, 'assets', 'phone-apps', icon)),
    'Flat phone icon file is missing: ' + icon);
}
const broadcastSource = read('src/broadcast.js');
assert.ok(broadcastSource.includes('readRenderTargetPixels'),
  'DerbyNews must reuse the Stadium Vision render instead of rendering twice');
assert.ok(broadcastSource.includes('smoothedFrameTime > 0.04'),
  'DerbyNews must reduce preview cadence when browser frame time degrades');
assert.ok(broadcastSource.includes(': 20,'),
  'DerbyNews must target the same 20 fps cadence as Stadium Vision');
assert.ok(broadcastSource.includes('newsReadbackFailures++'),
  'A failed DerbyNews GPU copy must not crash the game broadcast');

const sources = [
  "src/audio.js",
  "src/main.js",
  "src/network.js",
  "src/settings.js",
  "src/ui.js",
].map(read).join("\n");
const referencedIds = [...sources.matchAll(/["'`]#([A-Za-z][\w-]*)["'`]/g)]
  .map((match) => match[1]);

referencedIds.forEach((id) => {
  assert.ok(ids.includes(id), `JavaScript references missing HTML element #${id}`);
});

const sandbox = {
  console,
  THREE: {
    MeshStandardMaterial: class {},
    Vector3: class {
      constructor(x, y, z) {
        Object.assign(this, { x, y, z });
      }
    },
  },
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(read("src/config.js"), sandbox);

assert.equal(Object.keys(sandbox.HD.CONFIG.items).length, 10, "The hotbar requires ten items");
assert.equal(sandbox.HD.CONFIG.raceLaps, 3, "Races should run for three laps");
assert.equal(sandbox.HD.CONFIG.horses.length, 30, "The rotating horse pool requires 30 horses");
assert.ok(
  sandbox.HD.CONFIG.horses.every((horse) => {
    return [
      horse.speed,
      horse.stamina,
      horse.acceleration,
      horse.resistance,
    ].every((rating) => Number.isFinite(rating) && rating >= 0 && rating <= 100);
  }),
  "Every horse needs complete Odds Watch ratings",
);
assert.equal(sandbox.HD.CONFIG.raceHorseCount, 6, "Each race should contain six horses");
assert.ok(
  sandbox.HD.CONFIG.trackLanes.centerX < 53.35,
  "The innermost dirt lane must be used",
);
assert.equal(sandbox.HD.CONFIG.horseFieldRaces, 2, "Each horse field should remain for two races");
assert.equal(
  sandbox.HD.CONFIG.sabotageOptions.looseShoe.startDelay,
  1.5,
  "The cheapest sabotage should delay the start",
);
assert.equal(
  sandbox.HD.CONFIG.sabotageOptions.badFeed.startDelay,
  2.8,
  "The second sabotage should delay the start",
);
assert.equal(
  sandbox.HD.CONFIG.sabotageOptions.gateTampering.penalty,
  0.15,
  "The premium sabotage should permanently reduce performance",
);
assert.ok(ids.includes("lobby-public"), "The public lobby button is missing");
assert.ok(ids.includes("lobby-private"), "The private lobby button is missing");
assert.ok(ids.includes("winner-coins"), "The Winner Coins balance is missing");
assert.ok(ids.includes("avatar-unlock"), "The cosmetic unlock control is missing");
assert.ok(
  sandbox.HD.CONFIG.items.goldenCarrot.maxSpeedBonus === 0.01,
  "Golden Carrot should add one percent maximum speed",
);
assert.ok(
  sandbox.HD.CONFIG.items.goldenCarrot.maxSpeedBonusCap === 0.05,
  "Golden Carrot should stop stacking at five percent",
);
assert.deepEqual(
  Object.keys(sandbox.HD.CONFIG.items),
  ["hotdog", "goldenHotdog", "soda", "horseshoe", "carrot", "goldenCarrot",
    "hurdle", "waterBottle", "beachBall", "chair"],
  "The release inventory must contain exactly the requested ten items",
);
assert.ok(html.includes('value="640"'), "The 640p resolution option is missing");
assert.ok(html.includes('value="2160"'), "The 2160p resolution option is missing");
assert.ok(ids.includes("message-thread"), "The messaging conversation picker is missing");
assert.ok(ids.includes("message-history"), "The messaging history is missing");
assert.ok(ids.includes("message-compose"), "The messaging composer is missing");
assert.ok(
  html.includes('name="startingMoney" type="number" min="100" max="1000"'),
  "Practice bankroll must be limited to $100–$1,000",
);
assert.ok(
  html.includes('<button id="menu-play">SINGLE PLAYER</button>') &&
    html.includes('START SINGLE PLAYER →'),
  "The solo flow must use the Single Player label",
);
assert.ok(
  read("src/match-setup.js").includes("integer(input.startingMoney, 100, 1000"),
  "Practice bankroll bounds must also be enforced in JavaScript",
);
assert.ok(
  read("src/ui.js").includes("function itemTraitSummary(item)") &&
    read("src/controls.js").includes("HD.itemThrowProfile(item)"),
  "Item weight and throwing ease must be visible and applied to throws",
);
assert.ok(
  read("src/ui.js").includes("function hasOnlineLeaderboard()") &&
    !read("src/ui.js").includes('{ id: "maya", name: "Maya"'),
  "Practice Mode must not fabricate leaderboard players",
);
assert.ok(
  read("polish.css").includes("position: sticky;") &&
    read("polish.css").includes("#settings-close"),
  "Settings needs a sticky Done button while scrolling",
);
assert.ok(
  read("polish.css").includes("#viewport > :not(canvas)") &&
    read("polish.css").includes(".menu-shell") &&
    read("polish.css").includes(".results > div"),
  "Global UI scale must cover the HUD, menu, results, phone and interaction panels",
);
assert.ok(
  html.includes('data-app="messages"'),
  "The phone home screen is missing the Messages app",
);
for (const app of ["messages", "horses", "transfer", "bet", "shop", "news", "bank", "sabotage"]) {
  assert.ok(html.includes(`data-app="${app}"`), `The phone is missing its ${app} app`);
}
const appOrder = ["bet", "shop", "horses", "bank", "news", "sabotage", "transfer", "messages"];
assert.deepEqual(
  [...html.matchAll(/data-app="([^"]+)"/g)].slice(0, 8).map((match) => match[1]),
  appOrder,
  "Phone apps must retain the requested two-row order",
);
assert.ok(
  ids.includes("bank-money") && ids.includes("bank-income") &&
    ids.includes("bank-spending") && ids.includes("bank-net") && ids.includes("ledger") &&
    ids.includes("request-money") && ids.includes("money-requests"),
  "The phone needs Bank activity and DerbyPay money requests",
);
assert.ok(
  !html.toLowerCase().includes("flappy horse"),
  "The retired Flappy Horse app is still present",
);
[
  "master-volume",
  "music-volume",
  "crowd-volume",
  "effects-volume",
  "commentator-volume",
  "mute-audio",
  "controller-deadzone",
].forEach((id) => {
  assert.ok(ids.includes(id), `The audio setting #${id} is missing`);
});
assert.ok(
  read("src/controls.js").includes("navigator.getGamepads") &&
    read("src/main.js").includes("HD.Controls.updateGamepad(realDt)"),
  "Controller polling must run continuously, including while menus are open",
);
assert.ok(
  !read("src/controls.js").includes("function toggleStanding") &&
    !read("src/controls.js").includes("function sitDown") &&
    read("src/controls.js").includes("function jump()"),
  "Sitting must be removed and Space must use the jump action",
);
assert.ok(
  read("src/main.js").includes("readRenderTargetPixels") &&
    read("src/ui.js").includes("HD.itemThumbnails"),
  "Hotbar images must be cached renders of the actual item models",
);
assert.ok(
  read("src/boot.js").includes('"audio.js"'),
  "The event-driven audio system is not loaded by the game",
);
const audioSource = read("src/audio.js");
const commentatorWorkerSource = read("src/commentator-worker.js");
assert.ok(
  !audioSource.includes("createStadiumBed"),
  "The removed looping crowd-noise bed was reintroduced",
);
assert.ok(
  audioSource.includes("COMMENTARY_LINES") &&
    audioSource.includes("leaderChange") &&
    audioSource.includes("finalStretch") &&
    audioSource.includes("sabotage"),
  "The contextual race commentary library is incomplete",
);
assert.ok(
  commentatorWorkerSource.includes('const VOICE = "am_fenrir"') &&
    commentatorWorkerSource.includes("kokoro.web.js") &&
    audioSource.includes("makeMegaphoneCurve"),
  "The worker-based Kokoro PA announcer is not configured",
);
assert.ok(
  !audioSource.includes("speech.cancel()"),
  "Commentary must finish its current sentence instead of being interrupted",
);
[
  "throw-whoosh-1.wav",
  "throw-whoosh-2.wav",
  "throw-whoosh-3.wav",
  "impact-soft-1.wav",
  "impact-soft-2.wav",
  "impact-heavy.wav",
  "horse-gallop-dirt.mp3",
  "ui-hover.ogg",
  "ui-click.ogg",
  "ui-open.ogg",
  "ui-close.ogg",
  "ui-confirm.ogg",
  "ui-error.ogg",
  "music-menu.mp3",
  "music-race.ogg",
].forEach((fileName) => {
  const audioPath = path.join(root, "assets", "audio", fileName);
  assert.ok(fs.existsSync(audioPath), `Missing recorded audio asset ${fileName}`);
});

console.log("UI, messaging, audio, inventory, and resolution checks passed.");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}
