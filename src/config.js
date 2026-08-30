"use strict";
window.HD = window.HD || {};
HD.CONFIG = {
  // ---------------------------------------------------------------------------
  // Race and match rules
  // ---------------------------------------------------------------------------

  horses: [
    { name: "Hoof Hearted", color: 0xef476f, odds: 2, ability: 1.05, coat: 0x6b3824 },
    { name: "Mayo Neighs", color: 0x3a86ff, odds: 4, ability: 1, coat: 0x3e2921 },
    { name: "Sir Gallops", color: 0xffbe0b, odds: 7, ability: 0.96, coat: 0xa45a31 },
    { name: "Pony Soprano", color: 0x9b5de5, odds: 11, ability: 0.92, coat: 0xddd1b9 },
    { name: "Neigh Sayer", color: 0x22b573, odds: 14, ability: 0.89, coat: 0x7a4930 },
    { name: "Usain Colt", color: 0xff7b22, odds: 18, ability: 0.87, coat: 0x2e2723 },
  ],
  playerColors: [0xef476f, 0x3a86ff, 0xffbe0b, 0x9b5de5, 0x22b573, 0xff7b22, 0x42d4d4, 0xf06cad],
  items: {
    hotdog: {
      name: "Ballpark Hotdog",
      icon: "🌭",
      price: 8,
      speed: 36,
      lift: 8,
      gravity: 19,
      ragdollDuration: 1.8,
      description: "Knocks a horse into a brief, ridiculous tumble.",
    },
    soda: {
      name: "Mega Soda",
      icon: "🥤",
      price: 14,
      speed: 42,
      lift: 7,
      gravity: 21,
      slowDuration: 3.6,
      description: "Travels quickly and gives a horse a sticky surprise.",
    },
    horseshoe: {
      name: "Foam Horseshoe",
      icon: "🧲",
      price: 24,
      speed: 31,
      lift: 10,
      gravity: 16,
      slowDuration: 5,
      ragdollDuration: 2.4,
      description: "A heavy hit that tumbles and slows the target.",
    },
    carrot: {
      name: "Turbo Carrot",
      icon: "🥕",
      price: 20,
      speed: 38,
      lift: 8,
      gravity: 18,
      boostDuration: 5,
      resistanceDuration: 8,
      description: "Boosts a horse and grants temporary interference resistance.",
    },
    popcorn: {
      name: "Popcorn Bucket",
      icon: "🍿",
      price: 12,
      speed: 34,
      lift: 9,
      gravity: 18,
      slowDuration: 2.2,
      description: "Bursts across the track and briefly distracts a horse.",
    },
    chicken: {
      name: "Rubber Chicken",
      icon: "🐔",
      price: 18,
      speed: 33,
      lift: 11,
      gravity: 15,
      ragdollDuration: 2.8,
      description: "A floppy premium projectile with excellent knockdown.",
    },
  },
  roundBonuses: [100, 150, 250],
  racesPerRound: 2,
  totalRaces: 6,
  raceLaps: 3,
  preparationDuration: 30,
  roundBreakDuration: 120,
  phoneDeliveryDuration: 12,
  vendorDiscount: 0.25,
  walkSpeed: 10,
  seat: new THREE.Vector3(0, 17.2, 62),
  eyeHeight: 2.15,
};

HD.createInventory = () =>
  Object.fromEntries(Object.keys(HD.CONFIG.items).map((itemId) => [itemId, 0]));

HD.state = {
  money: 100,
  inventory: HD.createInventory(),
  selectedItem: "hotdog",
  round: 1,
  race: 1,
  selected: 0,
  bets: [],
  ledger: [],
  phase: "betting",
  timer: 30,
  raceTime: 0,
  horses: [],
  projectiles: [],
  finishOrder: [],
  elapsed: 0,
  lastOdds: 0,
  paused: true,
  mode: "look",
  yaw: 0,
  pitch: -0.18,
  throwPower: 0.55,
  charging: false,
  deliveries: [],
  standing: false,
  playerPosition: new THREE.Vector3(0, 17.2, 62),
  movement: { forward: false, backward: false, left: false, right: false },
  vendorOpen: false,
};
HD.world = {};
HD.util = {
  material(color, extra = {}) {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0.025, ...extra });
  },
  mesh(geometry, color, parent, position = [0, 0, 0], extra = {}) {
    const object = new THREE.Mesh(geometry, HD.util.material(color, extra));
    object.position.set(...position);
    object.castShadow = object.receiveShadow = true;
    parent.add(object);
    return object;
  },
  box(size, color, parent, position) {
    return HD.util.mesh(new THREE.BoxGeometry(...size), color, parent, position);
  },
  sphere(radius, color, parent, position) {
    return HD.util.mesh(new THREE.SphereGeometry(radius, 14, 10), color, parent, position);
  },
  cylinder(top, bottom, height, color, parent, position, segments = 12) {
    return HD.util.mesh(
      new THREE.CylinderGeometry(top, bottom, height, segments),
      color,
      parent,
      position,
    );
  },
};
