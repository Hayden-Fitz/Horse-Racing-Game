"use strict";
window.HD = window.HD || {};

// Display identity is permanent; numeric references still address the active
// field for bets and network events. Never use a display number as an index.
HD.horseNumber = function (reference) {
  const horse = typeof reference === "number"
    ? HD.state.horses[reference]
    : reference;
  const data = horse?.userData?.data || horse;
  return Number.isInteger(data?.number)
    ? String(data.number).padStart(2, "0")
    : "??";
};

function makeHorseProfile(profile) {
  const personalityByStyle = {
    "Front Runner": "Front-runner",
    Closer: "Comeback",
    Stalker: "Cautious",
    Balanced: "Unpredictable",
  };
  const personality = profile.personality || personalityByStyle[profile.style] || "Balanced";
  const number = profile.number || 0;
  const clampStat = (value) => Math.max(35, Math.min(100, Math.round(value)));
  const maximumSpeed = clampStat(profile.maximumSpeed ?? profile.speed + 4 + (number % 4));
  const defense = clampStat(profile.defense ?? profile.resistance);
  const cornering = clampStat(profile.cornering ?? profile.stamina - 3 + ((number * 7) % 9));
  const recovery = clampStat(profile.recovery ?? profile.stamina - 5 + ((number * 5) % 11));
  const intelligence = clampStat(profile.intelligence ?? profile.acceleration - 4 + ((number * 3) % 12));
  const laneSwitching = clampStat(profile.laneSwitching ?? 58 + ((number * 11) % 34));
  const overtaking = clampStat(profile.overtaking ?? profile.acceleration - 2 + ((number * 7) % 10));
  const startPerformance = clampStat(profile.startPerformance ?? profile.acceleration - 6 + ((number * 5) % 13));
  const finalStretch = clampStat(profile.finalStretch ?? profile.stamina - 4 + ((number * 9) % 12));
  const consistency = clampStat(profile.consistency ?? 67 + ((number * 13) % 27));
  const interferenceResistance = clampStat(
    profile.interferenceResistance ?? profile.resistance - 3 + ((number * 5) % 10),
  );
  const rating =
    maximumSpeed * 0.25 +
    profile.speed * 0.2 +
    profile.stamina * 0.25 +
    profile.acceleration * 0.15 +
    defense * 0.08 +
    intelligence * 0.04 +
    consistency * 0.03;

  return {
    ...profile,
    personality,
    rarity: profile.rarity || "Common",
    appearance: profile.appearance || "Classic race coat",
    maximumSpeed,
    defense,
    cornering,
    recovery,
    intelligence,
    laneSwitching,
    overtaking,
    startPerformance,
    finalStretch,
    consistency,
    interferenceResistance,
    baseOddsTendency: profile.baseOddsTendency ?? profile.odds,
    ability: 0.84 + rating * 0.0024,
  };
}

HD.CONFIG = {
  // ---------------------------------------------------------------------------
  // Race and match rules
  // ---------------------------------------------------------------------------
 
  horses: [
    makeHorseProfile({
      id: "midnight-sovereign",
      number: 1,
      name: "Midnight Sovereign",
      color: 0xef476f,
      coat: 0x241c1a,
      odds: 3,
      speed: 92,
      stamina: 86,
      acceleration: 88,
      resistance: 72,
      style: "Front Runner",
    }),
    makeHorseProfile({
      id: "silver-comet",
      number: 2,
      name: "Silver Comet",
      color: 0x3a86ff,
      coat: 0xb8b9b4,
      odds: 4,
      speed: 90,
      stamina: 79,
      acceleration: 94,
      resistance: 66,
      style: "Closer",
    }),
    makeHorseProfile({
      id: "autumn-valor",
      number: 3,
      name: "Autumn Valor",
      color: 0xffbe0b,
      coat: 0x9b4e29,
      odds: 6,
      speed: 84,
      stamina: 88,
      acceleration: 78,
      resistance: 82,
      style: "Balanced",
    }),
    makeHorseProfile({
      id: "northern-tempest",
      number: 4,
      name: "Northern Tempest",
      color: 0x9b5de5,
      coat: 0x4c3b35,
      odds: 5,
      speed: 88,
      stamina: 82,
      acceleration: 86,
      resistance: 73,
      style: "Stalker",
    }),
    makeHorseProfile({
      id: "crimson-banner",
      number: 5,
      name: "Crimson Banner",
      color: 0x22b573,
      coat: 0x6f3926,
      odds: 8,
      speed: 81,
      stamina: 84,
      acceleration: 80,
      resistance: 79,
      style: "Balanced",
    }),
    makeHorseProfile({
      id: "golden-promise",
      number: 6,
      name: "Golden Promise",
      color: 0xff7b22,
      coat: 0xc18a4c,
      odds: 7,
      speed: 85,
      stamina: 77,
      acceleration: 89,
      resistance: 68,
      style: "Front Runner",
    }),
    makeHorseProfile({
      id: "blue-meridian",
      number: 7,
      name: "Blue Meridian",
      color: 0x42d4d4,
      coat: 0x3f302b,
      odds: 9,
      speed: 79,
      stamina: 90,
      acceleration: 72,
      resistance: 84,
      style: "Closer",
    }),
    makeHorseProfile({
      id: "royal-ember",
      number: 8,
      name: "Royal Ember",
      color: 0xf06cad,
      coat: 0x7d4128,
      odds: 6,
      speed: 86,
      stamina: 83,
      acceleration: 82,
      resistance: 75,
      style: "Stalker",
    }),
    makeHorseProfile({
      id: "willow-creek",
      number: 9,
      name: "Willow Creek",
      color: 0xe84a5f,
      coat: 0xb18b64,
      odds: 11,
      speed: 76,
      stamina: 91,
      acceleration: 70,
      resistance: 88,
      style: "Closer",
    }),
    makeHorseProfile({
      id: "iron-resolve",
      number: 10,
      name: "Iron Resolve",
      color: 0x5c7cfa,
      coat: 0x34302d,
      odds: 7,
      speed: 82,
      stamina: 87,
      acceleration: 76,
      resistance: 94,
      style: "Balanced",
    }),
    makeHorseProfile({
      id: "velvet-thunder",
      number: 11,
      name: "Velvet Thunder",
      color: 0xf4a261,
      coat: 0x221d1d,
      odds: 5,
      speed: 89,
      stamina: 80,
      acceleration: 91,
      resistance: 69,
      style: "Front Runner",
    }),
    makeHorseProfile({
      id: "coastal-wind",
      number: 12,
      name: "Coastal Wind",
      color: 0x845ec2,
      coat: 0xd0c4ae,
      odds: 10,
      speed: 80,
      stamina: 81,
      acceleration: 83,
      resistance: 71,
      style: "Stalker",
    }),
    makeHorseProfile({
      id: "scarlet-horizon",
      number: 13,
      name: "Scarlet Horizon",
      color: 0x2a9d8f,
      coat: 0xa96136,
      odds: 12,
      speed: 77,
      stamina: 79,
      acceleration: 81,
      resistance: 74,
      style: "Front Runner",
    }),
    makeHorseProfile({
      id: "noble-pursuit",
      number: 14,
      name: "Noble Pursuit",
      color: 0xe9c46a,
      coat: 0x5c382c,
      odds: 8,
      speed: 83,
      stamina: 85,
      acceleration: 77,
      resistance: 81,
      style: "Balanced",
    }),
    makeHorseProfile({
      id: "dancing-shadow",
      number: 15,
      name: "Dancing Shadow",
      color: 0x00b4d8,
      coat: 0x2c2523,
      odds: 9,
      speed: 82,
      stamina: 75,
      acceleration: 92,
      resistance: 64,
      style: "Closer",
    }),
    makeHorseProfile({
      id: "western-legend",
      number: 16,
      name: "Western Legend",
      color: 0xf28482,
      coat: 0x8c512f,
      odds: 10,
      speed: 78,
      stamina: 86,
      acceleration: 74,
      resistance: 87,
      style: "Stalker",
    }),
    makeHorseProfile({
      id: "emerald-bay",
      number: 17,
      name: "Emerald Bay",
      color: 0x84a59d,
      coat: 0xc0aa87,
      odds: 13,
      speed: 74,
      stamina: 89,
      acceleration: 69,
      resistance: 90,
      style: "Closer",
    }),
    makeHorseProfile({
      id: "storm-lantern",
      number: 18,
      name: "Storm Lantern",
      color: 0xf6bd60,
      coat: 0x514039,
      odds: 8,
      speed: 84,
      stamina: 78,
      acceleration: 87,
      resistance: 70,
      style: "Front Runner",
    }),
    makeHorseProfile({
      id: "quiet-majesty",
      number: 19,
      name: "Quiet Majesty",
      color: 0x577590,
      coat: 0xd7d0c4,
      odds: 11,
      speed: 77,
      stamina: 92,
      acceleration: 68,
      resistance: 92,
      style: "Closer",
    }),
    makeHorseProfile({
      id: "copper-ridge",
      number: 20,
      name: "Copper Ridge",
      color: 0x90be6d,
      coat: 0xa75f32,
      odds: 7,
      speed: 85,
      stamina: 82,
      acceleration: 79,
      resistance: 83,
      style: "Balanced",
    }),
    makeHorseProfile({
      id: "moonlit-harbor",
      number: 21,
      name: "Moonlit Harbor",
      color: 0xf94144,
      coat: 0x302927,
      odds: 12,
      speed: 76,
      stamina: 85,
      acceleration: 75,
      resistance: 86,
      style: "Stalker",
    }),
    makeHorseProfile({
      id: "grand-alliance",
      number: 22,
      name: "Grand Alliance",
      color: 0x277da1,
      coat: 0x74452f,
      odds: 6,
      speed: 87,
      stamina: 84,
      acceleration: 81,
      resistance: 78,
      style: "Balanced",
    }),
    makeHorseProfile({
      id: "summer-anthem",
      number: 23,
      name: "Summer Anthem",
      color: 0xf8961e,
      coat: 0xccaa76,
      odds: 9,
      speed: 81,
      stamina: 80,
      acceleration: 85,
      resistance: 67,
      style: "Front Runner",
    }),
    makeHorseProfile({
      id: "blackwater-belle",
      number: 24,
      name: "Blackwater Belle",
      color: 0x6a4c93,
      coat: 0x1e1b1b,
      odds: 4,
      speed: 91,
      stamina: 85,
      acceleration: 87,
      resistance: 80,
      style: "Stalker",
    }),
    makeHorseProfile({
      id: "highland-echo",
      number: 25,
      name: "Highland Echo",
      color: 0x43aa8b,
      coat: 0x8b725e,
      odds: 10,
      speed: 79,
      stamina: 83,
      acceleration: 80,
      resistance: 76,
      style: "Closer",
    }),
    makeHorseProfile({
      id: "riverstone",
      number: 26,
      name: "Riverstone",
      color: 0xf3722c,
      coat: 0x6a4737,
      odds: 14,
      speed: 72,
      stamina: 88,
      acceleration: 67,
      resistance: 91,
      style: "Closer",
    }),
    makeHorseProfile({
      id: "bold-venture",
      number: 27,
      name: "Bold Venture",
      color: 0x4d908e,
      coat: 0x9a5c36,
      odds: 8,
      speed: 83,
      stamina: 79,
      acceleration: 88,
      resistance: 65,
      style: "Front Runner",
    }),
    makeHorseProfile({
      id: "winter-rose",
      number: 28,
      name: "Winter Rose",
      color: 0xf9844a,
      coat: 0xe0d9ca,
      odds: 11,
      speed: 78,
      stamina: 84,
      acceleration: 73,
      resistance: 89,
      style: "Balanced",
    }),
    makeHorseProfile({
      id: "sunset-courier",
      number: 29,
      name: "Sunset Courier",
      color: 0x9b5de5,
      coat: 0xb76f3d,
      odds: 9,
      speed: 82,
      stamina: 76,
      acceleration: 90,
      resistance: 62,
      style: "Front Runner",
    }),
    makeHorseProfile({
      id: "cedar-run",
      number: 30,
      name: "Cedar Run",
      color: 0x2d6a4f,
      coat: 0x65402d,
      odds: 15,
      speed: 71,
      stamina: 82,
      acceleration: 71,
      resistance: 85,
      style: "Stalker",
    }),
  ],
  playerColors: [0xef476f, 0x3a86ff, 0xffbe0b, 0x9b5de5, 0x22b573, 0xff7b22, 0x42d4d4, 0xf06cad],
  items: {
    hotdog: {
      category: "Food",
      name: "Ballpark Hotdog",
      icon: "🌭",
      price: 8,
      speed: 36,
      lift: 8,
      gravity: 19,
      weight: 2,
      throwingEase: 4,
      ragdollDuration: 1.8,
      description: "Startles a horse into rearing and briefly stops its stride.",
    },
    goldenHotdog: {
      category: 'Rare', name: 'Golden Hotdog', icon: 'G', price: 55,
      speed: 39, lift: 9, gravity: 18, weight: 2, throwingEase: 4,
      ragdollDuration: 2.8, slowDuration: 2.4, vendorOnly: true,
      description: 'A premium hotdog that causes a longer startle and slowdown.',
    },
    soda: {
      category: "Food",
      name: "Mega Soda",
      icon: "🥤",
      price: 14,
      speed: 42,
      lift: 7,
      gravity: 21,
      weight: 3,
      throwingEase: 3,
      slowDuration: 3.6,
      description: "Travels quickly and gives a horse a sticky surprise.",
    },
    horseshoe: {
      category: "Bounce",
      name: "Foam Horseshoe",
      icon: "🧲",
      price: 24,
      speed: 31,
      lift: 10,
      gravity: 16,
      weight: 3,
      throwingEase: 3,
      slowDuration: 5,
      ragdollDuration: 2.4,
      description: "A heavy hit that startles and slows the target.",
    },
    carrot: {
      category: "Food",
      name: "Turbo Carrot",
      icon: "🥕",
      price: 20,
      speed: 38,
      lift: 8,
      gravity: 18,
      weight: 2,
      throwingEase: 5,
      boostDuration: 5,
      resistanceDuration: 8,
      description: "Boosts a horse and grants temporary interference resistance.",
    },
    goldenCarrot: {
      category: 'Rare', name: 'Golden Carrot', icon: 'G', price: 60,
      speed: 40, lift: 9, gravity: 17, weight: 2, throwingEase: 5,
      boostDuration: 8, resistanceDuration: 12, maxSpeedBonus: 0.01,
      maxSpeedBonusCap: 0.05, vendorOnly: true,
      description: 'A rare boost that also raises maximum speed by 1%, up to 5%.',
    },
    hurdle: {
      category: "Placable",
      name: "Foam Hurdle",
      icon: "🚧",
      price: 18,
      speed: 30,
      lift: 11,
      gravity: 17,
      weight: 4,
      throwingEase: 2,
      slowDuration: 1.2,
      forceLaneChange: true,
      trap: true,
      heldScale: 0.58,
      description: "Stays on the track and forces the first horse it catches to change lanes.",
    },
    waterBottle: {
      category: "Impact",
      name: "Throw Pillow",
      icon: "🛏️",
      price: 16,
      speed: 27,
      lift: 12,
      gravity: 13,
      weight: 3,
      throwingEase: 4,
      ragdollDuration: 1.4,
      vendorOnly: true,
      description: "Concourse exclusive. Light, floaty, and startling.",
    },
    beachBall: {
      category: "Impact",
      name: "Folding Chair",
      icon: "🪑",
      price: 42,
      speed: 25,
      lift: 9,
      gravity: 20,
      weight: 5,
      throwingEase: 1,
      slowDuration: 4,
      ragdollDuration: 3.5,
      vendorOnly: true,
      description: "Concourse exclusive. Heavy, slow, and a powerful startle.",
    },
    chair: {
      category: "Food",
      name: "Giant Pretzel",
      icon: "🥨",
      price: 10,
      speed: 35,
      lift: 8,
      gravity: 18,
      weight: 1,
      throwingEase: 5,
      slowDuration: 1.6,
      ragdollDuration: 1.1,
      heldScale: 0.78,
      description: "A bendy snack with a balanced arc and a short startle.",
    },
    performanceOats: {
      category: "Food",
      name: "Champion Oats",
      icon: "🌾",
      price: 24,
      speed: 32,
      lift: 9,
      gravity: 16,
      weight: 2,
      throwingEase: 4,
      maxSpeedBonus: 0.01,
      maxSpeedBonusCap: 0.05,
      heldScale: 0.76,
      description: "Permanently raises a horse's maximum speed by 1%, stacking up to 5%.",
    },
    airHorn: {
      category: "Special",
      name: "Air Horn",
      icon: "\ud83d\udce3",
      price: 28,
      speed: 39,
      lift: 7,
      gravity: 19,
      weight: 3,
      throwingEase: 3,
      panicDuration: 3.2,
      heldScale: 0.78,
      vendorOnly: true,
      description: "Concourse exclusive. Causes a panicked swerve and uneven pace.",
    },
  },
  sabotageOptions: {
    looseShoe: {
      name: "Sticky Starting Gate",
      price: 70,
      startDelay: 1.5,
      description: "Makes the target leave the gate 1.5 seconds late.",
    },
    badFeed: {
      name: "Missing Saddle Call",
      price: 105,
      startDelay: 2.8,
      description: "Delays the target at the start by 2.8 seconds.",
    },
    gateTampering: {
      name: "Weighted Saddle",
      price: 145,
      penalty: 0.15,
      description: "Reduces performance by 15% for the entire race.",
    },
    hotStart: {
      name: "Hot Start Tip",
      price: 90,
      boostDuration: 15,
      description: "Secretly boosts the target for the first 15 seconds.",
    },
  },
  sabotageFailureChance: 0.33,
  sabotageEnabled: true,
  roundBonuses: [100, 150, 250],
  racesPerRound: 2,
  totalRaces: 6,
  raceLaps: 3,
  raceHorseCount: 6,
  startingMoney: 100,
  crowdThrowInterval: 10,
  horseFieldRaces: 2,
  trackLanes: {
    // Keep every lane inside the existing 49/22 to 72/43 dirt oval.
    innerLineX: 49.3,
    innerLineZ: 22.3,
    get spacingX() {
      return 22.4 / HD.CONFIG.raceHorseCount;
    },

    get spacingZ() {
      return 20.4 / HD.CONFIG.raceHorseCount;
    },

    get centerX() {
      return this.innerLineX + this.spacingX / 2;
    },

    get centerZ() {
      return this.innerLineZ + this.spacingZ / 2;
    },
  },
  grandstandBaseHeight: 2.75,

  stairs: {
    startX: 78.5,
    startZ: 48,
    endX: 103.25,
    endZ: 69.75,
    width: 8,
    bottomHeight: 1.65,
    topHeight: 13.5,
  },
  liveBettingDuration: 15,
  preparationDuration: 45,
  roundBreakDuration: 60,
  phoneDeliveryDuration: 12,
  vendorDiscount: 0.33,
  onlineBetFeeRate: 0.08,
  throwVelocityMultiplier: 1,
  walkSpeed: 11.5,
  seat: new THREE.Vector3(8, 12.73, 60.85),
  playerSeatRoot: new THREE.Vector3(8, 9.45, 60.85),
  playerSeatYaw: 0,
  characterEyeOffset: 3.28,
  eyeHeight: 4.8,
};

// Rank the entered profiles, then build groups of two or three contenders.
// Weighted centering keeps the book at 100% even with uneven group sizes.
HD.openingHorseChances = (field) => {
  const sizes = {
    4: [2, 2],
    5: [2, 3],
    6: [2, 2, 2],
    7: [2, 2, 3],
    8: [3, 2, 3],
  }[field.length];
  if (!sizes) return field.map(() => 1 / field.length);
  const strength = (horse) =>
    Math.pow(horse.ability || 1, 6) /
    Math.pow(1 + (horse.baseOddsTendency ?? 7), 1.5);
  const ranked = field.map((horse, index) => ({ horse, index }))
    .sort((a, b) => strength(b.horse) - strength(a.horse) ||
      a.horse.id.localeCompare(b.horse.id));
  // Preserve random field selection. The strength contrast between adjacent
  // groups determines each gap, so different opponents produce different books.
  let offset = 0;
  const groupStrengths = sizes.map((size) => {
    const members = ranked.slice(offset, offset + size);
    offset += size;
    return members.reduce((sum, entry) => sum + strength(entry.horse), 0) / size;
  });
  const gaps = [0];
  for (let group = 1; group < sizes.length; group++) {
    const contrast = Math.log(groupStrengths[group - 1] / groupStrengths[group]);
    gaps[group] = gaps[group - 1] + 0.05 + 0.05 * Math.tanh(contrast);
  }
  const center = sizes.reduce((sum, size, group) => sum + size * gaps[group], 0) / field.length;
  const chances = [];
  let rank = 0;
  sizes.forEach((size, group) => {
    const chance = 1 / field.length + center - gaps[group];
    for (let member = 0; member < size; member++) {
      chances[ranked[rank++].index] = chance;
    }
  });
  return chances;
};

// The release hotbar is intentionally limited to ten clearly differentiated items.
delete HD.CONFIG.items.performanceOats;
delete HD.CONFIG.items.airHorn;
Object.assign(HD.CONFIG.items.waterBottle, {
  category: 'Drink', name: 'Water Bottle', icon: 'W', price: 10,
  speed: 43, lift: 7, gravity: 20, weight: 2, throwingEase: 4,
  slowDuration: 1.8, vendorOnly: false, ragdollDuration: 0,
  description: 'A fast, light throw that briefly reduces traction.',
});
Object.assign(HD.CONFIG.items.beachBall, {
  category: 'Bounce', name: 'Beach Ball', icon: 'B', price: 18,
  speed: 27, lift: 13, gravity: 12, weight: 1, throwingEase: 5,
  slowDuration: 0, ragdollDuration: 1.2, vendorOnly: false, heldScale: 0.9,
  description: 'A floaty distraction with a wide collision area.',
});
Object.assign(HD.CONFIG.items.chair, {
  category: 'Impact', name: 'Folding Chair', icon: 'C', price: 42,
  speed: 25, lift: 9, gravity: 20, weight: 5, throwingEase: 1,
  slowDuration: 4, ragdollDuration: 3.5, vendorOnly: true,
  description: 'A heavy concourse exclusive with a powerful startle.',
});

HD.createInventory = () =>
  Object.fromEntries(Object.keys(HD.CONFIG.items).map((itemId) => [itemId, 0]));

// Scan after the depleted slot, preferring the same inventory category.
HD.nextInventoryItem = (inventory, afterType) => {
  const ids = Object.keys(HD.CONFIG.items);
  const start = ids.indexOf(afterType);
  const category = HD.CONFIG.items[afterType]?.category;
  const available = [];

  for (let offset = 1; offset <= ids.length; offset++) {
    const candidate = ids[(start + offset) % ids.length];
    if (Number.isFinite(inventory[candidate]) && inventory[candidate] > 0) {
      available.push(candidate);
    }
  }

  return available.find((id) => HD.CONFIG.items[id].category === category) ??
    available[0] ?? null;
};

// Weight controls lift; throwing ease controls horizontal reach. Both stay
// deliberately modest so an item's unique physics and aim remain important.
HD.itemThrowProfile = (item) => {
  const weight = THREE.MathUtils.clamp(Number(item?.weight) || 3, 1, 5);
  const throwingEase = THREE.MathUtils.clamp(Number(item?.throwingEase) || 3, 1, 5);

  return {
    weight,
    throwingEase,
    liftMultiplier: Number((1.1 - weight * 0.06).toFixed(3)),
    rangeMultiplier: Number((0.76 + throwingEase * 0.08).toFixed(3)),
  };
};

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
  timer: HD.CONFIG.preparationDuration,
  raceTime: 0,
  horses: [],
  activeHorseIds: [],
  horseFieldRacesRemaining: 0,
  horseBag: HD.CONFIG.horses.map((horse) => horse.id),
  horseSpeedBonuses: {},
  projectiles: [],
  finishOrder: [],
  elapsed: 0,
  lastOdds: 0,
  paused: true,
  mode: "look",
  yaw: 0,
  pitch: -0.18,
  throwPower: 0,
  charging: false,
  deliveries: [],
  standing: true,
  playerPosition: new THREE.Vector3(8, 12.73, 60.85),
  movement: { forward: false, backward: false, left: false, right: false },
  vendorOpen: false,
  counterOpen: false,
  sabotagePlans: [],
  raceAnnouncement: "",
  matchStarted: false,
};
HD.world = {
  remotePlayers: new Map(),
};
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
