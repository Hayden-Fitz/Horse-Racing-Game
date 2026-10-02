'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const listeners = {};
const fetches = [];
const musicTargets = [];
const started = [];
class AudioContext {
  state = 'running'; currentTime = 0; destination = {};
  createDynamicsCompressor() { return this.node(); }
  createGain() { return this.node(); }
  node() { return { connect() {}, gain: { value: 1, setValueAtTime() {}, setTargetAtTime(value) { musicTargets.push(value); } }, threshold: {}, knee: {}, ratio: {}, attack: {}, release: {} }; }
  createBufferSource() { return { connect() {}, start() { started.push(this.buffer); }, playbackRate: { value: 1 } }; }
  async decodeAudioData() { return { duration: 3 }; }
}
const context = {
  HD: { state: { matchStarted: false, phase: 'lobby', horses: [] }, Settings: { audioSettings: () => ({ muted: false, master: 1, music: 1, crowd: 1, effects: 1 }) } },
  window: { AudioContext },
  document: { baseURI: 'http://localhost/', addEventListener: (name, callback) => { listeners[name] = callback; } },
  fetch: (url) => { fetches.push(String(url)); return String(url).endsWith('music-menu.mp3')
    ? Promise.resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) })
    : new Promise(() => {}); },
  URL, Map, Promise, Math, console,
  performance: { now: () => 0 },
};
vm.runInNewContext(fs.readFileSync('src/audio.js', 'utf8'), context);
context.HD.Audio.init();
(async () => {
  await listeners.pointerdown();
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(fetches.some((url) => url.endsWith('music-menu.mp3')), 'Lobby music starts loading independently of effects');
  assert.equal(started.length, 1, 'Lobby track begins after its own decode');
  assert.equal(musicTargets.at(-1), 0.2, 'Lobby track is audible');
  context.HD.state.matchStarted = true;
  context.HD.Audio.update(0.2);
  assert.equal(musicTargets.at(-1), 0, 'Music fades out during the match');
  console.log('Lobby music loads promptly; match music remains muted.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
