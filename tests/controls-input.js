'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function run() {
  global.window = global;
  global.THREE = await import(
    pathToFileURL(path.resolve(__dirname, '../vendor/three.module.js')).href
  );
  require('../src/config.js');
  const handlers = {};
  const windowHandlers = {};
  const canvasHandlers = {};
  let pointerRequests = 0;
  let launches = 0;
  const canvas = {
    addEventListener: (name, handler) => { canvasHandlers[name] = handler; },
    requestPointerLock: () => { pointerRequests++; },
  };
  global.addEventListener = (name, handler) => { windowHandlers[name] = handler; };
  global.document = {
    addEventListener: (name, handler) => { handlers[name] = handler; },
    exitPointerLock() {},
    pointerLockElement: canvas,
  };
  HD.world.renderer = { domElement: canvas };
  HD.world.camera = new THREE.PerspectiveCamera();
  HD.world.trajectory = new THREE.Line(new THREE.BufferGeometry());
  HD.world.heldItem = new THREE.Group();
  HD.world.heldItems = { hotdog: new THREE.Group(), soda: new THREE.Group() };
  HD.world.phoneModel = new THREE.Group();
  HD.world.localPlayer = null;
  HD.UI = new Proxy({}, { get: () => () => {} });
  HD.Models = { equipPlayer() {}, playPlayerThrow() {} };
  HD.Network = { isConnected: () => false, isHost: () => true, sendThrow() {} };
  HD.Settings = {
    binding: (action) => ({ forward: 'KeyW' })[action],
    matches: () => false,
    sensitivity: () => 1,
    reducedMotion: () => true,
  };
  HD.Race = {
    predictTrajectory: () => 0,
    launch: (type) => {
      launches++;
      HD.state.inventory[type]--;
    },
  };
  require('../src/controls.js');
  HD.Controls.init();
  assert.equal(HD.Controls.gamepadAxis(0.1, 0.16), 0);
  assert.ok(HD.Controls.gamepadAxis(0.8, 0.16) > 0.7);
  assert.ok(HD.Controls.gamepadAxis(-0.8, 0.16) < -0.7);
  const state = HD.state;
  state.matchStarted = true;
  state.paused = false;
  state.phase = 'racing';
  state.mode = 'throw';
  state.inventory.hotdog = 2;
  state.inventory.soda = 1;
  state.selectedItem = 'hotdog';
  const pointer = { button: 0, preventDefault() {} };
  const key = (code, target = {}) => ({ code, target, preventDefault() {} });

  canvasHandlers.pointerdown(pointer);
  assert.equal(state.charging, true);
  HD.Controls.selectItem('soda');
  assert.equal(state.charging, false, 'Changing items cancels the old throw');
  handlers.pointerup(pointer);
  assert.equal(launches, 0);
  assert.equal(state.selectedItem, 'soda');
  state.inventory.hotdog = 0;
  HD.Controls.selectItem('hotdog');
  HD.Controls.selectItem('toString');
  assert.equal(state.selectedItem, 'soda', 'Unowned and invalid selections are rejected');

  canvasHandlers.pointerdown(pointer);
  document.pointerLockElement = null;
  handlers.pointerlockchange();
  assert.equal(state.charging, false, 'Losing mouse capture cancels charging');
  canvasHandlers.pointerdown(pointer);
  windowHandlers.blur();
  assert.equal(state.charging, false, 'Switching windows cancels charging');

  handlers.keydown(key('KeyW', { tagName: 'TEXTAREA' }));
  assert.equal(Boolean(state.movement.forward), false, 'Typing cannot move the player');
  handlers.keydown(key('KeyW'));
  assert.equal(state.movement.forward, true);
  HD.Controls.openMenu();
  assert.equal(state.movement.forward, false, 'Opening the menu clears held movement');
  canvasHandlers.pointerdown(pointer);
  canvasHandlers.click();
  assert.equal(state.charging, false, 'Menus cannot begin a throw');
  const requestsAfterMenu = pointerRequests;
  state.paused = false;
  state.matchStarted = false;
  canvasHandlers.click();
  handlers.keydown(key('KeyW'));
  assert.equal(pointerRequests, requestsAfterMenu, 'Lobby clicks cannot capture the mouse');
  assert.equal(state.movement.forward, false, 'Lobby keys cannot move the player');

  state.matchStarted = true;
  state.mode = 'throw';
  canvasHandlers.pointerdown(pointer);
  state.phase = 'finished';
  handlers.pointerup(pointer);
  assert.equal(state.charging, false, 'Race completion cancels a pending throw');
  assert.equal(launches, 0);
  state.phase = 'racing';
  state.standing = false;
  state.inventory = HD.createInventory();
  state.inventory.hotdog = 1;
  state.inventory.soda = 1;
  HD.Controls.selectItem('hotdog');
  HD.Controls.setMode('throw');
  canvasHandlers.pointerdown(pointer);
  assert.equal(state.throwPower, 0, 'Charge starts at zero');
  HD.Controls.update(0.675);
  assert.equal(state.throwPower, 0.5, 'Charge rises at the intended rate');
  HD.Controls.update(2);
  assert.equal(state.throwPower, 1, 'Charge stays capped at full power');
  handlers.pointerup(pointer);
  assert.equal(launches, 1);
  assert.equal(state.selectedItem, 'soda', 'Depletion selects the next owned food');
  canvasHandlers.pointerdown(pointer);
  HD.Controls.update(0.2);
  handlers.pointerup(pointer);
  assert.equal(launches, 2);
  assert.equal(state.selectedItem, null, 'An exhausted inventory clears selection');
  assert.equal(state.mode, 'look');
  assert.equal(HD.world.heldItem.visible, false);
  // Walk off the front row away from all stairs. Do not teleport onto the floor.
  const rowAngle = 1.05;
  state.yaw = Math.atan2(Math.cos(rowAngle) * 82.1, Math.sin(rowAngle) * 51.85);
  state.playerPosition.set(
    Math.cos(rowAngle) * 82.1,
    HD.CONFIG.grandstandBaseHeight + HD.CONFIG.eyeHeight,
    Math.sin(rowAngle) * 51.85,
  );
  state.movement.forward = true;
  let startedFalling = false;
  let previousY = state.playerPosition.y;
  for (let i = 0; i < 60; i++) {
    HD.Controls.update(1 / 120);
    if (state.playerPosition.y < previousY) {
      startedFalling = true;
      assert.ok(previousY - state.playerPosition.y < 0.02,
        'Leaving the row must start a gravity-driven fall, not snap down');
      break;
    }
    previousY = state.playerPosition.y;
  }
  assert.ok(startedFalling, 'No invisible barrier may block leaving the bottom row');
  state.movement.forward = false;
  state.mode = 'phone';
  for (let i = 0; i < 120; i++) HD.Controls.update(1 / 120);
  assert.ok(Math.abs(state.playerPosition.y - (1.65 + HD.CONFIG.eyeHeight)) < 0.001,
    'Gravity must continue with the phone open and land on the walkway');

  state.mode = 'look';
  HD.Settings.matches = (event, action) => action === 'stand' && event.code === 'Space';
  const baseY = state.playerPosition.y;
  handlers.keydown(key('Space'));
  for (let i = 0; i < 30; i++) HD.Controls.update(1 / 120);
  assert.ok(Math.abs(state.playerPosition.y - baseY - 1.625) < 0.002,
    'Jump height follows the analytic 28-unit gravity arc');
  for (let i = 0; i < 100; i++) HD.Controls.update(1 / 120);
  assert.ok(Math.abs(state.playerPosition.y - baseY) < 0.001);
  console.log('Input lifecycle, bottom-row falling, phone gravity and jump arc passed.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
