"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const html = read("index.html");
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);

assert.equal(new Set(ids).size, ids.length, "index.html contains duplicate IDs");

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
assert.equal(
  sandbox.HD.CONFIG.trackLanes.centerX,
  53.35,
  "The innermost horse lane should be removed and replaced outside",
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
  sandbox.HD.CONFIG.items.performanceOats.maxSpeedBonus === 0.01,
  "Champion Oats should add one percent maximum speed",
);
assert.ok(
  sandbox.HD.CONFIG.items.performanceOats.maxSpeedBonusCap === 0.05,
  "Champion Oats should stop stacking at five percent",
);
assert.ok(
  sandbox.HD.CONFIG.items.airHorn.panicDuration > 0,
  "The air horn needs its unique panic effect",
);
assert.ok(html.includes('value="640"'), "The 640p resolution option is missing");
assert.ok(html.includes('value="2160"'), "The 2160p resolution option is missing");
assert.ok(ids.includes("message-thread"), "The messaging conversation picker is missing");
assert.ok(ids.includes("message-history"), "The messaging history is missing");
assert.ok(ids.includes("message-compose"), "The messaging composer is missing");
assert.ok(
  html.includes('data-app="messages"'),
  "The phone home screen is missing the Messages app",
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
].forEach((id) => {
  assert.ok(ids.includes(id), `The audio setting #${id} is missing`);
});
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
