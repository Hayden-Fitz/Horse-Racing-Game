"use strict";
HD.Models = (() => {
  const { mesh, box, sphere, cylinder } = HD.util;

  // ---------------------------------------------------------------------------
  // Characters and race horses
  // ---------------------------------------------------------------------------

  function character(color, options = {}) {
    const root = new THREE.Group(),
      skin = options.skin || 0xefb88f,
      torso = mesh(new THREE.CapsuleGeometry(0.92, 1.25, 4, 8), color, root, [0, 1.65, 0]);
    torso.userData.baseY = 1.7;
    box([1.35, 0.32, 0.12], 0xf3e8cf, root, [0, 2.25, -0.83]);
    sphere(0.84, skin, root, [0, 3.78, 0]);
    sphere(0.16, skin, root, [0, 3.72, -0.82]);
    [-0.77, 0.77].forEach((x) => sphere(0.16, skin, root, [x, 3.78, 0]));
    const hat = cylinder(0.78, 0.9, 0.38, options.hat || color, root, [0, 4.62, 0]);
    box([1.9, 0.16, 0.75], options.hat || color, root, [0, 4.43, -0.25]);
    [-0.28, 0.28].forEach((x) => sphere(0.09, 0x171717, root, [x, 3.88, -0.77]));
    [-0.29, 0.29].forEach((x) => {
      const brow = box([0.28, 0.06, 0.05], 0x51362b, root, [x, 4.09, -0.76]);
      brow.rotation.z = x > 0 ? -0.08 : 0.08;
    });
    const mouth = box([0.42, 0.06, 0.05], 0x8c493c, root, [0, 3.5, -0.81]);
    mouth.rotation.z = options.smile === false ? Math.PI : 0;
    const arms = [],
      legs = [];
    [-1, 1].forEach((side) => {
      const arm = cylinder(0.18, 0.22, 2.15, color, root, [side * 1.15, 1.9, 0], 8);
      arm.rotation.z = side * -0.24;
      arms.push(arm);
      sphere(0.25, skin, root, [side * 1.38, 0.9, 0]);
      const leg = cylinder(0.22, 0.28, 2.2, 0x263c50, root, [side * 0.48, -0.42, -0.45], 8);
      leg.rotation.x = Math.PI / 2.8;
      legs.push(leg);
      const shoe = box([0.58, 0.35, 0.9], 0xf1eee5, root, [side * 0.48, -1.25, -1.22]);
      shoe.rotation.x = 0.2;
    });
    root.userData = {
      arms,
      legs,
      torso,
      activity: options.activity || "watch",
      phase: Math.random() * 10,
    };
    return root;
  }
  function horse(data, index) {
    const root = new THREE.Group(),
      body = new THREE.Group();
    root.add(body);
    root.userData.body = body;
    const torso = mesh(new THREE.CapsuleGeometry(1.15, 2.4, 5, 10), data.coat, body, [0, 2, 0]);
    torso.rotation.z = Math.PI / 2;
    const neck = cylinder(0.62, 0.8, 2.1, data.coat, body, [1.65, 2.7, 0]);
    neck.rotation.z = -0.55;
    const head = mesh(new THREE.CapsuleGeometry(0.62, 0.8, 4, 8), data.coat, body, [2.45, 3.45, 0]);
    head.rotation.z = Math.PI / 2;
    sphere(0.1, 0x111111, body, [2.85, 3.72, -0.5]);
    sphere(0.1, 0x111111, body, [2.85, 3.72, 0.5]);
    box([1.25, 0.18, 1.35], 0x2a1b16, body, [1.3, 3.4, 0]);
    const mane = box([2.2, 0.65, 0.16], 0x241914, body, [0.95, 3.5, 0]);
    mane.rotation.z = -0.28;
    const ears = [];
    [-0.34, 0.34].forEach((z) => {
      const ear = cylinder(0.06, 0.18, 0.65, data.coat, body, [2.18, 4.15, z], 7);
      ear.rotation.z = -0.3;
      ears.push(ear);
    });
    const legs = [];
    [-1.15, 1.05].forEach((x, a) =>
      [-0.64, 0.64].forEach((z, b) => {
        const leg = cylinder(0.18, 0.25, 2.3, data.coat, body, [x, 0.55, z], 8);
        leg.userData.phase = ((a + b) % 2) * Math.PI;
        legs.push(leg);
        const hoof = box([0.48, 0.32, 0.58], 0x211a17, leg, [0.08, -1.22, 0]);
        hoof.rotation.z = -0.08;
      }),
    );
    box([1.3, 0.25, 1.7], data.color, body, [-0.2, 3.03, 0]);
    const jockey = character(data.color, { hat: data.color });
    jockey.scale.setScalar(0.52);
    jockey.position.set(-0.15, 3.2, 0);
    jockey.rotation.y = -Math.PI / 2;
    body.add(jockey);
    const label = numberSprite(index + 1);
    label.position.set(0, 3.35, -1.05);
    body.add(label);
    root.userData = {
      body,
      legs,
      ears,
      data: {
        ...data,
        index,
        progress: -index * 0.0025,
        speed: 0,
        baseSpeed: 0.044 * data.ability * (0.92 + Math.random() * 0.17),
        slow: 0,
        finished: false,
        place: 0,
        odds: data.odds,
        ragdoll: 0,
        boost: 0,
        resistance: 0,
      },
    };
    return root;
  }
  function numberSprite(number) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const c = canvas.getContext("2d");
    c.fillStyle = "white";
    c.beginPath();
    c.arc(64, 64, 54, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#17251d";
    c.font = "900 72px sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(number, 64, 68);
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas) }),
    );
    sprite.scale.set(2.3, 2.3, 1);
    return sprite;
  }
  function hotdog() {
    const root = new THREE.Group();
    const bun = mesh(new THREE.CapsuleGeometry(0.22, 0.75, 4, 8), 0xe2a44f, root);
    bun.rotation.z = Math.PI / 2;
    const dog = mesh(new THREE.CapsuleGeometry(0.12, 0.82, 4, 7), 0xb83b25, root, [0, 0.15, 0]);
    dog.rotation.z = Math.PI / 2;
    return root;
  }

  // ---------------------------------------------------------------------------
  // Throwable item models
  // ---------------------------------------------------------------------------


  function soda() {
    const root = new THREE.Group();
    cylinder(0.22, 0.22, 0.75, 0xe63946, root, [0, 0, 0], 16);
    cylinder(0.24, 0.24, 0.04, 0xdce5e8, root, [0, 0.395, 0], 16);
    const straw = cylinder(0.025, 0.025, 0.65, 0xffffff, root, [0.08, 0.68, 0], 8);
    straw.rotation.z = -0.18;
    return root;
  }

  function horseshoe() {
    const root = new THREE.Group();
    const shoe = mesh(new THREE.TorusGeometry(0.38, 0.11, 8, 18, Math.PI * 1.55), 0x5d6d76, root);
    shoe.rotation.z = -Math.PI * 0.775;
    return root;
  }

  function carrot() {
    const root = new THREE.Group();
    const vegetable = mesh(new THREE.ConeGeometry(0.22, 0.85, 9), 0xf58220, root);
    vegetable.rotation.z = -Math.PI / 2;
    vegetable.position.x = 0.15;
    [-0.14, 0, 0.14].forEach((z) => {
      const leaf = box([0.38, 0.07, 0.16], 0x3a9b4a, root, [-0.45, 0, z]);
      leaf.rotation.z = z * 1.4;
    });
    return root;
  }

  function popcorn() {
    const root = new THREE.Group();
    cylinder(0.34, 0.26, 0.7, 0xe53935, root, [0, 0, 0], 12);
    [-0.18, 0, 0.18].forEach((x, index) => {
      sphere(0.18, 0xffefae, root, [x, 0.42 + (index % 2) * 0.08, 0]);
    });
    return root;
  }

  function chicken() {
    const root = new THREE.Group();
    const body = mesh(new THREE.CapsuleGeometry(0.22, 0.75, 4, 8), 0xf0c33c, root);
    body.rotation.z = Math.PI / 2;
    sphere(0.25, 0xf0c33c, root, [0.58, 0.1, 0]);
    const beak = mesh(new THREE.ConeGeometry(0.1, 0.28, 7), 0xf47b20, root, [0.84, 0.1, 0]);
    beak.rotation.z = -Math.PI / 2;
    cylinder(0.06, 0.08, 0.42, 0xe78b27, root, [-0.2, -0.42, 0], 7);
    cylinder(0.06, 0.08, 0.42, 0xe78b27, root, [0.2, -0.42, 0], 7);
    return root;
  }

  function throwable(type) {
    if (type === "soda") return soda();
    if (type === "horseshoe") return horseshoe();
    if (type === "carrot") return carrot();
    if (type === "popcorn") return popcorn();
    if (type === "chicken") return chicken();
    return hotdog();
  }
  function animateCharacter(person, time, active = true) {
    const d = person.userData,
      wave = Math.sin(time * 2 + d.phase);
    d.torso.position.y = d.torso.userData.baseY + Math.abs(wave) * 0.05;
    if (active && d.activity === "throw") d.arms[0].rotation.x = -1.4 + wave * 0.3;
    else
      d.arms.forEach(
        (arm, i) => (arm.rotation.x = d.activity === "phone" ? -1.1 : wave * 0.08 * (i ? -1 : 1)),
      );
  }
  return {
    character,
    horse,
    hotdog,
    soda,
    horseshoe,
    carrot,
    popcorn,
    chicken,
    throwable,
    animateCharacter,
  };
})();
