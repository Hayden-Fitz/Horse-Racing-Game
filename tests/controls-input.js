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
  console.log('Input lifecycle: owned selection, charge cancellation, typing and menu isolation passed.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
