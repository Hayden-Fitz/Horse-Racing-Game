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
    const faceDetails = [];
    faceDetails.push(sphere(0.16, skin, root, [0, 3.72, -0.82]));
    [-0.77, 0.77].forEach((x) => sphere(0.16, skin, root, [x, 3.78, 0]));
    const hat = cylinder(0.78, 0.9, 0.38, options.hat || color, root, [0, 4.62, 0]);
    box([1.9, 0.16, 0.75], options.hat || color, root, [0, 4.43, -0.25]);
    [-0.28, 0.28].forEach((x) => {
      faceDetails.push(sphere(0.09, 0x171717, root, [x, 3.88, -0.77]));
    });  
    [-0.29, 0.29].forEach((x) => {
      const brow = box([0.28, 0.06, 0.05], 0x51362b, root, [x, 4.09, -0.76]);
      brow.rotation.z = x > 0 ? -0.08 : 0.08;
      faceDetails.push(brow);
    });
    const mouth = box([0.42, 0.06, 0.05], 0x8c493c, root, [0, 3.5, -0.81]);
    mouth.rotation.z = options.smile === false ? Math.PI : 0;
    faceDetails.push(mouth);
    if (options.faceless) faceDetails.forEach((detail) => detail.visible = false);
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

  function playerCharacter(color, options = {}) {
    const root = new THREE.Group();
    const bodyRig = new THREE.Group();
    root.add(bodyRig);

    const skinTones = [0xf1c7a5, 0xc88962, 0x8d593d, 0xe0aa82, 0x6e432f];
    const skin = options.skin || skinTones[options.variant % skinTones.length];
    const trousers = options.trousers || 0x252525;
    const shoeColor = options.shoeColor || 0x20201f;
    const outfit = options.outfit || "raceday";

    const torso = mesh(
      new THREE.CapsuleGeometry(0.61, 0.72, 5, 14),
      color,
      bodyRig,
      [0, 1.62, 0],
    );
    torso.scale.z = 0.72;
    torso.userData.baseY = 1.62;
    cylinder(0.13, 0.15, 0.16, skin, bodyRig, [0, 2.52, -0.02], 12);
    addPlayerOutfit(bodyRig, outfit, color);

    const head = sphere(0.64, skin, bodyRig, [0, 3.25, -0.02]);
    head.scale.set(0.95, 1.02, 0.94);
    [-1, 1].forEach((side) => {
      const ear = sphere(0.13, skin, bodyRig, [side * 0.62, 3.26, -0.01]);
      ear.scale.set(0.45, 0.9, 0.65);
    });
    const nose = sphere(0.095, skin, bodyRig, [0, 3.22, -0.625]);
    nose.scale.set(0.72, 0.95, 0.62);

    const faceMaterial = new THREE.MeshBasicMaterial({
      color: 0x171717,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const faceParts = [];
    [-0.2, 0.2].forEach((x) => {
      const eye = mesh(
        new THREE.PlaneGeometry(0.085, 0.22),
        0x171717,
        bodyRig,
        [x, 3.32, -0.625],
      );
      eye.material = faceMaterial;
      faceParts.push(eye);

      const brow = box(
        [0.2, 0.035, 0.025],
        0x3a281f,
        bodyRig,
        [x, 3.5, -0.61],
      );
      brow.rotation.z = x < 0 ? -0.05 : 0.05;
      faceParts.push(brow);
    });
    faceParts.push(
      ...createPlayerExpression(bodyRig, options.expression || "smile", faceMaterial),
    );

    const hair = mesh(
      new THREE.SphereGeometry(0.65, 14, 8, 0, Math.PI * 2, 0, 1.25),
      options.hairColor || 0x3a281f,
      bodyRig,
      [0, 3.58, 0],
    );
    hair.scale.set(0.96, 0.6, 0.96);
    const hatParts = createPlayerHat(bodyRig, options.hat || "cap", color);
    const accessoryParts = createPlayerAccessory(
      bodyRig,
      options.accessory || "none",
      color,
    );
    const headRig = new THREE.Group();
    headRig.position.set(0, 3.25, 0);
    bodyRig.add(headRig);
    [
      head,
      hair,
      nose,
      ...faceParts,
      ...hatParts,
      ...accessoryParts,
    ].forEach((part) => headRig.attach(part));

    const arms = [];
    const forearms = [];
    [-1, 1].forEach((side) => {
      const arm = new THREE.Group();
      arm.position.set(side * 0.68, 2.13, 0);
      arm.rotation.z = side * -0.13;
      bodyRig.add(arm);
      sphere(0.2, color, arm, [0, -0.05, 0]);
      cylinder(0.15, 0.18, 0.82, color, arm, [0, -0.42, 0], 12);
      sphere(0.16, skin, arm, [0, -0.84, 0]);

      const forearm = new THREE.Group();
      forearm.position.set(0, -0.83, 0);
      forearm.rotation.x = 1.05;
      arm.add(forearm);
      cylinder(0.11, 0.14, 0.72, 0x282725, forearm, [0, -0.34, 0], 11);
      cylinder(0.14, 0.14, 0.12, color, forearm, [0, -0.69, 0], 10);
      sphere(0.18, skin, forearm, [0, -0.79, 0]);
      arms.push(arm);
      forearms.push(forearm);
    });

    const propAnchor = new THREE.Group();
    propAnchor.position.set(0, -0.82, -0.05);
    propAnchor.rotation.set(-0.2, 0, -0.18);
    forearms[1].add(propAnchor);

    const legs = [];
    const shins = [];
    const shoes = [];
    [-1, 1].forEach((side) => {
      const hip = new THREE.Group();
      hip.position.set(side * 0.33, 0.54, -0.02);
      root.add(hip);
      cylinder(0.2, 0.23, 0.94, trousers, hip, [0, -0.46, 0], 12);
      sphere(0.205, trousers, hip, [0, -0.92, 0]);

      const knee = new THREE.Group();
      knee.position.set(0, -0.91, 0);
      hip.add(knee);
      cylinder(0.16, 0.19, 0.9, trousers, knee, [0, -0.44, 0], 12);

      const foot = new THREE.Group();
      foot.position.set(0, -0.88, -0.08);
      knee.add(foot);
      const shoe = mesh(
        new THREE.CapsuleGeometry(0.22, 0.38, 4, 10),
        shoeColor,
        foot,
        [0, 0, -0.16],
      );
      shoe.rotation.x = Math.PI / 2;
      shoe.scale.set(1.05, 1.12, 0.92);
      const sole = box([0.48, 0.1, 0.78], 0x111211, foot, [0, -0.19, -0.19]);
      sole.rotation.x = -0.03;
      if (options.shoes === "boots") {
        cylinder(0.23, 0.24, 0.42, shoeColor, foot, [0, 0.12, 0.05], 12);
      } else if (options.shoes === "high-tops") {
        box([0.45, 0.42, 0.42], shoeColor, foot, [0, 0.08, 0.04]);
        box([0.28, 0.22, 0.03], 0xf4f1e8, foot, [0, 0.1, -0.19]);
      }

      legs.push(hip);
      shins.push(knee);
      shoes.push(foot);
    });

    root.userData = {
      arms,
      forearms,
      legs,
      shins,
      shoes,
      torso,
      bodyRig,
      head: headRig,
      hatParts,
      activity: options.activity || "watch",
      seatedActivity: options.activity || "watch",
      phase: Math.random() * 10,
      propAnchor,
      props: new Map(),
      equippedProp: "",
      moving: false,
      throwUntil: 0,
      throwStartedAt: 0,
      walkBlend: 0,
      gaitPhase: Math.random() * Math.PI * 2,
      lastAnimationTime: null,
      phoneBlend: 0,
      headTurn: 0,
      headPitch: 0,
    };
    return root;
  }

  function addPlayerOutfit(parent, outfit, color) {
    if (outfit === "varsity") {
      box([0.32, 1.18, 0.06], 0xf2eee4, parent, [-0.3, 1.67, -0.56]);
      box([0.32, 1.18, 0.06], 0xf2eee4, parent, [0.3, 1.67, -0.56]);
      cylinder(0.5, 0.5, 0.08, 0xf2eee4, parent, [0, 2.35, 0], 14);
      return;
    }

    if (outfit === "blazer") {
      const left = box([0.48, 1.18, 0.07], 0x202a3a, parent, [-0.24, 1.66, -0.57]);
      const right = box([0.48, 1.18, 0.07], 0x202a3a, parent, [0.24, 1.66, -0.57]);
      left.rotation.z = -0.08;
      right.rotation.z = 0.08;
      box([0.07, 0.07, 0.05], 0xe8c04e, parent, [0, 1.6, -0.63]);
      return;
    }

    if (outfit === "hoodie") {
      const hood = mesh(
        new THREE.TorusGeometry(0.45, 0.13, 8, 16, Math.PI),
        color,
        parent,
        [0, 2.37, 0.06],
      );
      hood.rotation.x = Math.PI / 2;
      cylinder(0.025, 0.025, 0.58, 0xf2eee4, parent, [-0.12, 2.12, -0.58], 6);
      cylinder(0.025, 0.025, 0.58, 0xf2eee4, parent, [0.12, 2.12, -0.58], 6);
      return;
    }

    box([1.02, 0.13, 0.08], 0xf2eee4, parent, [0, 2.22, -0.55]);
    box([0.09, 0.92, 0.06], 0xf2eee4, parent, [0, 1.68, -0.58]);
  }

  function createPlayerExpression(root, expression, material) {
    if (expression === "surprised") {
      const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.09, 16), material);
      mouth.position.set(0, 3.06, -0.628);
      root.add(mouth);
      return [mouth];
    }

    const center = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.045), material);
    center.position.set(0, 3.06, -0.628);
    root.add(center);
    if (expression === "neutral") return [center];

    const parts = [center];
    [-1, 1].forEach((side) => {
      const corner = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.045), material);
      corner.position.set(side * 0.145, 3.1, -0.628);
      corner.rotation.z = side * -0.55;
      root.add(corner);
      parts.push(corner);
    });
    return parts;
  }

  function createPlayerHat(root, style, color) {
    const parts = [];
    if (style === "none") return parts;

    if (style === "crown") {
      const band = cylinder(0.58, 0.62, 0.28, 0xf1bf3e, root, [0, 3.66, 0], 12);
      parts.push(band);
      for (let index = 0; index < 6; index++) {
        const angle = (index / 6) * Math.PI * 2;
        const point = mesh(
          new THREE.ConeGeometry(0.16, 0.5, 6),
          0xf1bf3e,
          root,
          [Math.cos(angle) * 0.48, 4.02, Math.sin(angle) * 0.48],
        );
        parts.push(point);
      }
      return parts;
    }

    if (style === "fedora" || style === "cowboy") {
      const crown = cylinder(0.48, 0.58, 0.55, color, root, [0, 3.86, 0], 14);
      const brim = cylinder(
        style === "cowboy" ? 0.92 : 0.78,
        style === "cowboy" ? 0.92 : 0.78,
        0.09,
        color,
        root,
        [0, 3.58, 0],
        18,
      );
      crown.scale.z = 0.88;
      brim.scale.z = style === "cowboy" ? 0.62 : 0.78;
      parts.push(crown, brim);
      return parts;
    }

    const crown = mesh(
      new THREE.SphereGeometry(0.66, 14, 8, 0, Math.PI * 2, 0, 1.62),
      color,
      root,
    );
    crown.position.y = style === "beanie" ? 3.64 : 3.62;
    crown.scale.set(1, style === "beanie" ? 0.82 : 0.68, 1);
    parts.push(crown);
    if (style === "cap") {
      const brim = sphere(0.5, color, root, [0, 3.5, -0.42]);
      brim.scale.set(0.9, 0.12, 0.58);
      parts.push(brim);
    } else {
      parts.push(cylinder(0.64, 0.64, 0.12, color, root, [0, 3.5, 0], 14));
    }
    return parts;
  }

  function createPlayerAccessory(root, style, color) {
    const parts = [];
    if (style === "glasses") {
      [-1, 1].forEach((side) => {
        const lens = mesh(
          new THREE.TorusGeometry(0.18, 0.025, 7, 14),
          0x171717,
          root,
          [side * 0.22, 3.33, -0.61],
        );
        parts.push(lens);
      });
      parts.push(box([0.12, 0.025, 0.025], 0x171717, root, [0, 3.33, -0.63]));
    } else if (style === "headphones") {
      const band = mesh(
        new THREE.TorusGeometry(0.68, 0.07, 8, 20, Math.PI),
        color,
        root,
        [0, 3.45, 0],
      );
      band.rotation.z = Math.PI;
      parts.push(band);
      [-1, 1].forEach((side) => {
        const cup = box([0.16, 0.42, 0.3], color, root, [side * 0.66, 3.25, 0]);
        parts.push(cup);
      });
    }
    return parts;
  }

  function setPlayerColor(person, color) {
    if (!person?.userData?.torso) return;
    person.userData.torso.material.color.setHex(color);
    person.userData.hatParts.forEach((part) => part.material.color.setHex(color));
  }

  function setPlayerStanding(person, standing) {
    person.userData.forearms.forEach((forearm) => {
      forearm.rotation.x = standing ? 0.08 : 1.05;
    });
    person.userData.legs.forEach((leg, index) => {
      const side = index ? 1 : -1;
      leg.position.set(side * 0.33, standing ? 0.54 : 0.44, standing ? -0.02 : -0.1);
      leg.rotation.x = standing ? 0 : 0.98;
    });
    person.userData.shins.forEach((shin, index) => {
      shin.position.set(0, -0.91, 0);
      shin.rotation.x = standing ? 0 : -0.82;
    });
    person.userData.shoes.forEach((shoe) => {
      shoe.position.set(0, -0.88, standing ? -0.08 : -0.04);
      shoe.rotation.x = standing ? 0 : -0.16;
    });
    person.userData.standing = standing;
  }

  function jockeyCharacter(silkColor) {
    const root = new THREE.Group();
    const skin = 0xdca677;
    const torso = mesh(
      new THREE.CylinderGeometry(0.52, 0.62, 1.35, 12),
      0xf4f1e8,
      root,
      [0, 1.65, 0],
    );
    torso.scale.z = 0.72;

    const head = sphere(0.55, skin, root, [0, 3.15, 0]);
    head.scale.set(0.92, 1.04, 0.92);
    const helmet = mesh(
      new THREE.SphereGeometry(0.61, 14, 8, 0, Math.PI * 2, 0, 1.7),
      0x1d1d1c,
      root,
    );
    helmet.position.y = 3.5;
    box([0.86, 0.09, 0.42], 0x1d1d1c, root, [0, 3.4, -0.38]);
    addRodBetween(root, [-0.46, 3.38, -0.08], [-0.33, 2.87, -0.4], 0.035, 0x20201f);
    addRodBetween(root, [0.46, 3.38, -0.08], [0.33, 2.87, -0.4], 0.035, 0x20201f);

    for (let row = 0; row < 3; row++) {
      for (let column = 0; column < 3; column++) {
        if ((row + column) % 2) continue;
        box(
          [0.34, 0.34, 0.035],
          silkColor,
          root,
          [-0.34 + column * 0.34, 2.02 - row * 0.34, -0.52],
        );
      }
    }
    box([1.18, 0.18, 0.78], 0x20201f, root, [0, 0.98, 0]);

    [-1, 1].forEach((side) => {
      const arm = cylinder(
        0.13,
        0.16,
        1.25,
        silkColor,
        root,
        [side * 0.76, 1.65, 0],
        10,
      );
      arm.rotation.z = side * -0.16;
      sphere(0.18, 0x20201f, root, [side * 0.86, 1.02, 0]);
      const leg = new THREE.Group();
      leg.position.set(side * 0.34, 0.88, 0);
      root.add(leg);
      const thigh = cylinder(0.18, 0.21, 0.92, 0xf1eee7, leg, [0, -0.38, 0], 10);
      thigh.rotation.x = -0.55;
      const lowerLeg = cylinder(
        0.16,
        0.18,
        0.95,
        0xf1eee7,
        leg,
        [0, -1.02, -0.28],
        10,
      );
      lowerLeg.rotation.x = 0.48;
      box([0.46, 0.64, 0.58], 0x20201f, leg, [0, -1.57, -0.06]);
      box([0.48, 0.12, 0.62], silkColor, leg, [0, -1.25, -0.12]);
    });
    return root;
  }

  function horse(data, index) {
    const root = new THREE.Group(),
      body = new THREE.Group();
    const earlyPaces = [1.035, 0.99, 1.015, 0.975, 1.025, 1, 0.985, 1.02];
    const staminaRatings = [0.98, 1.01, 1.04, 1.02, 0.97, 1, 1.035, 0.99];
    const finishingKicks = [0.02, 0.035, 0.055, 0.04, 0.025, 0.045, 0.05, 0.03];
    const accelerationRatings = [1.45, 1.2, 1.3, 1.15, 1.4, 1.25, 1.18, 1.35];
    root.add(body);
    root.userData.body = body;
    const torso = mesh(new THREE.CapsuleGeometry(1.15, 2.4, 5, 10), data.coat, body, [0, 2, 0]);
    torso.rotation.z = Math.PI / 2;
    const haunch = sphere(1.08, data.coat, body, [-1.35, 2.05, 0]);
    haunch.scale.set(1.15, 1, 0.95);
    const chest = sphere(0.92, data.coat, body, [1.25, 2.18, 0]);
    chest.scale.set(0.85, 1.12, 0.94);
    const neck = cylinder(0.62, 0.8, 2.1, data.coat, body, [1.65, 2.7, 0]);
    neck.rotation.z = -0.55;
    const head = mesh(new THREE.CapsuleGeometry(0.62, 0.8, 4, 8), data.coat, body, [2.45, 3.45, 0]);
    head.rotation.z = Math.PI / 2;
    const muzzle = mesh(new THREE.CapsuleGeometry(0.4, 0.65, 4, 9), data.coat, body, [3.05, 3.25, 0]);
    muzzle.rotation.z = Math.PI / 2;
    sphere(0.075, 0x211817, body, [3.42, 3.32, -0.26]);
    sphere(0.075, 0x211817, body, [3.42, 3.32, 0.26]);
    sphere(0.1, 0x111111, body, [2.85, 3.72, -0.5]);
    sphere(0.1, 0x111111, body, [2.85, 3.72, 0.5]);
    const blaze = box([0.78, 0.08, 0.2], 0xe8dfce, body, [2.68, 3.96, 0]);
    blaze.rotation.z = -0.18;
    const bridle = mesh(new THREE.TorusGeometry(0.57, 0.055, 7, 18), 0x2c1c17, body);
    bridle.position.set(2.7, 3.42, 0);
    bridle.rotation.y = Math.PI / 2;
    box([1.25, 0.18, 1.35], 0x2a1b16, body, [1.3, 3.4, 0]);
    const mane = box([2.2, 0.65, 0.16], 0x241914, body, [0.95, 3.5, 0]);
    mane.rotation.z = -0.28;
    const tail = cylinder(0.08, 0.18, 1.8, 0x241914, body, [-2.2, 2.1, 0], 7);
    tail.rotation.z = -0.8;
    const ears = [];
    [-0.34, 0.34].forEach((z) => {
      const ear = cylinder(0.06, 0.18, 0.65, data.coat, body, [2.18, 4.15, z], 7);
      ear.rotation.z = -0.3;
      ears.push(ear);
    });
    const legs = [];
    const frontLegs = [];
    const hindLegs = [];
    [-1.15, 1.05].forEach((x, a) =>
      [-0.64, 0.64].forEach((z, b) => {
        const leg = cylinder(0.18, 0.25, 2.3, data.coat, body, [x, 0.55, z], 8);
        leg.userData.phase = ((a + b) % 2) * Math.PI;
        legs.push(leg);
        if (x > 0) frontLegs.push(leg);
        else hindLegs.push(leg);
        sphere(0.24, data.coat, leg, [0, -0.72, 0]);
        const hoof = box([0.48, 0.32, 0.58], 0x211a17, leg, [0.08, -1.22, 0]);
        hoof.rotation.z = -0.08;
      }),
    );
    box([1.5, 0.28, 1.75], data.color, body, [-0.2, 3.03, 0]);
    box([0.95, 0.18, 1.9], 0x4a2d22, body, [-0.15, 3.2, 0]);
    addRodBetween(body, [2.8, 3.42, -0.5], [0.25, 4.05, -0.72], 0.025, 0x2c1c17);
    addRodBetween(body, [2.8, 3.42, 0.5], [0.25, 4.05, 0.72], 0.025, 0x2c1c17);
    const jockey = jockeyCharacter(data.color);
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
      frontLegs,
      hindLegs,
      ears,
      tail,
      jockey,
      data: {
        ...data,
        index,
        poolIndex: HD.CONFIG.horses.findIndex((horseData) => horseData.id === data.id),
        progress: 0,
        speed: 0,
        momentum: 0,
        baseSpeed: 0.044 * (0.88 + data.ability * 0.12) * (0.99 + Math.random() * 0.02),
        lane: index,
        targetLane: index,
        earlyPace: earlyPaces[index],
        stamina: staminaRatings[index],
        finishKick: finishingKicks[index],
        acceleration: accelerationRatings[index],
        deceleration: 1.05 + (index % 3) * 0.12,
        slow: 0,
        finished: false,
        place: 0,
        odds: data.odds,
        ragdoll: 0,
        boost: 0,
        resistance: 0,
        sabotagePenalty: 0,
        startDelay: 0,
        blockedTime: 0,
        preferredLane: index,
        passing: false,
        clearTime: 0,
        motionSpeed: 0,
      },
    };
    return root;
  }

  function addRodBetween(parent, startValues, endValues, radius, color) {
    const start = new THREE.Vector3(...startValues);
    const end = new THREE.Vector3(...endValues);
    const direction = end.clone().sub(start);
    const rod = cylinder(radius, radius, direction.length(), color, parent, [0, 0, 0], 6);
    rod.position.copy(start).add(end).multiplyScalar(0.5);
    rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    return rod;
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

  function pillow() {
    const root = new THREE.Group();
    const cushion = mesh(new THREE.IcosahedronGeometry(0.48, 2), 0x65a9d8, root);
    cushion.scale.set(1.25, 0.5, 0.95);
    const button = sphere(0.06, 0xf4e9d4, root, [0, 0, 0.47]);
    button.scale.z = 0.35;
    return root;
  }

  function chair() {
    const root = new THREE.Group();
    box([0.75, 0.12, 0.7], 0x6d7477, root, [0, 0, 0]);
    box([0.75, 0.9, 0.1], 0x6d7477, root, [0, 0.48, 0.32]);
    [-0.28, 0.28].forEach((x) => {
      const leg = cylinder(0.04, 0.05, 0.85, 0x303638, root, [x, -0.45, 0], 6);
      leg.rotation.x = x > 0 ? 0.2 : -0.2;
    });
    return root;
  }

  function pretzel() {
    const root = new THREE.Group();
    const dough = mesh(new THREE.TorusGeometry(0.38, 0.1, 8, 20), 0xc98232, root);
    dough.scale.y = 0.8;
    box([0.12, 0.65, 0.12], 0xc98232, root, [-0.2, -0.2, 0]);
    box([0.12, 0.65, 0.12], 0xc98232, root, [0.2, -0.2, 0]);
    [-0.25, 0, 0.24].forEach((x) => sphere(0.035, 0xffe4a3, root, [x, 0.25, 0.1]));
    return root;
  }

  function nachos() {
    const root = new THREE.Group();
    const tray = mesh(new THREE.CylinderGeometry(0.46, 0.34, 0.22, 4), 0xd7342a, root);
    tray.rotation.y = Math.PI / 4;
    [-0.22, 0, 0.22].forEach((x, index) => {
      const chip = mesh(new THREE.ConeGeometry(0.18, 0.42, 3), 0xf4bd3f, root, [x, 0.28, 0]);
      chip.rotation.z = (index - 1) * 0.35;
    });
    sphere(0.12, 0xf29e22, root, [0.08, 0.25, 0.12]);
    return root;
  }

  function waterBottle() {
    const root = new THREE.Group();
    cylinder(0.16, 0.2, 0.72, 0x72cde2, root, [0, 0, 0], 14);
    cylinder(0.11, 0.14, 0.16, 0xbbeaf2, root, [0, 0.43, 0], 12);
    cylinder(0.12, 0.12, 0.08, 0x2f75bf, root, [0, 0.55, 0], 12);
    const label = cylinder(0.205, 0.205, 0.22, 0xf1f7f5, root, [0, -0.05, 0], 14);
    label.material.roughness = 0.4;
    return root;
  }

  function beachBall() {
    const root = new THREE.Group();
    sphere(0.52, 0xf6e9cb, root, [0, 0, 0]);
    const redStripe = mesh(new THREE.TorusGeometry(0.4, 0.09, 8, 20), 0xe94b3c, root);
    redStripe.rotation.x = Math.PI / 2;
    const blueStripe = mesh(new THREE.TorusGeometry(0.4, 0.09, 8, 20), 0x3b87d6, root);
    blueStripe.rotation.y = Math.PI / 2;
    return root;
  }

  function tennisBall() {
    const root = new THREE.Group();
    sphere(0.32, 0xc9e43d, root, [0, 0, 0]);
    const seam = mesh(new THREE.TorusGeometry(0.25, 0.018, 6, 18), 0xf5f3dc, root);
    seam.rotation.x = Math.PI / 2;
    return root;
  }

  function iceCream() {
    const root = new THREE.Group();
    const cone = mesh(new THREE.ConeGeometry(0.28, 0.8, 10), 0xc98b45, root, [0, -0.25, 0]);
    cone.rotation.z = Math.PI;
    sphere(0.29, 0xf4b7c7, root, [-0.16, 0.25, 0]);
    sphere(0.29, 0xd9a46f, root, [0.16, 0.25, 0]);
    sphere(0.3, 0xf4ead1, root, [0, 0.48, 0]);
    return root;
  }

  function foamFinger() {
    const root = new THREE.Group();
    box([0.72, 0.82, 0.18], 0xe94b3c, root, [0, -0.15, 0]);
    const finger = cylinder(0.14, 0.18, 1.05, 0xe94b3c, root, [0.18, 0.75, 0], 9);
    finger.rotation.z = -0.08;
    box([0.28, 0.55, 0.18], 0xf4d259, root, [-0.13, 0.05, -0.11]);
    return root;
  }

  function bananaPeel() {
    const root = new THREE.Group();
    for (let index = 0; index < 4; index++) {
      const angle = (index / 4) * Math.PI * 2;
      const peel = mesh(new THREE.ConeGeometry(0.12, 0.85, 7), 0xf3d13b, root);
      peel.position.set(Math.cos(angle) * 0.2, -0.12, Math.sin(angle) * 0.2);
      peel.rotation.z = Math.cos(angle) * 1.05;
      peel.rotation.x = Math.sin(angle) * 1.05;
    }
    sphere(0.18, 0xe0b82e, root, [0, 0.1, 0]);
    return root;
  }

  function airHorn() {
    const root = new THREE.Group();
    cylinder(0.2, 0.2, 0.72, 0xd84035, root, [0, -0.15, 0], 14);
    const horn = mesh(new THREE.ConeGeometry(0.38, 0.65, 14, 1, true), 0xe8e6dc, root, [0, 0.45, 0]);
    horn.rotation.z = Math.PI;
    cylinder(0.1, 0.12, 0.16, 0x333c3b, root, [0, 0.83, 0], 10);
    return root;
  }

  function throwable(type) {
    if (type === "soda") return soda();
    if (type === "horseshoe") return horseshoe();
    if (type === "carrot") return carrot();
    if (type === "popcorn") return popcorn();
    if (type === "chicken") return chicken();
    if (type === "pillow") return pillow();
    if (type === "chair") return chair();
    if (type === "pretzel") return pretzel();
    if (type === "nachos") return nachos();
    if (type === "waterBottle") return waterBottle();
    if (type === "beachBall") return beachBall();
    if (type === "tennisBall") return tennisBall();
    if (type === "iceCream") return iceCream();
    if (type === "foamFinger") return foamFinger();
    if (type === "bananaPeel") return bananaPeel();
    if (type === "airHorn") return airHorn();
    return hotdog();
  }

  function playerPhoneProp() {
    const phone = new THREE.Group();
    box([0.42, 0.78, 0.08], 0x171d20, phone, [0, 0, 0]);
    box([0.35, 0.65, 0.025], 0x3292b3, phone, [0, 0, -0.055]);
    sphere(0.035, 0x111111, phone, [0, 0.31, -0.075]);
    return phone;
  }

  function equipPlayer(person, mode, itemType) {
    const data = person?.userData;
    if (!data?.propAnchor) return;

    const propKey = mode === "phone"
      ? "phone"
      : mode === "throw" && HD.CONFIG.items[itemType]
        ? `item:${itemType}`
        : "";
    if (data.equippedProp === propKey) return;

    data.props.forEach((prop) => {
      prop.visible = false;
    });
    data.equippedProp = propKey;
    if (!propKey) return;

    if (!data.props.has(propKey)) {
      const prop = propKey === "phone" ? playerPhoneProp() : throwable(itemType);
      const scale = propKey === "phone"
        ? 1.02
        : 1.45 * (HD.CONFIG.items[itemType].heldScale || 0.7);
      prop.scale.setScalar(scale);
      prop.userData.equipScale = scale;
      prop.rotation.set(propKey === "phone" ? 0.1 : -0.25, 0, propKey === "phone" ? 0 : -0.5);
      prop.traverse((object) => {
        if (object.isMesh) object.castShadow = false;
      });
      data.propAnchor.add(prop);
      data.props.set(propKey, prop);
    }

    data.props.get(propKey).visible = true;
  }

  function playPlayerThrow(person, itemType) {
    if (!person?.userData) return;
    person.userData.activity = "throw";
    person.userData.throwStartedAt = HD.state.elapsed - 0.2;
    person.userData.throwUntil = HD.state.elapsed + 0.58;
    equipPlayer(person, "throw", itemType);
  }

  function animateCharacter(person, time, active = true) {
    const data = person.userData;
    const previousTime = data.lastAnimationTime;
    const deltaTime = previousTime === null || previousTime === undefined
      ? 1 / 60
      : THREE.MathUtils.clamp(time - previousTime, 1 / 240, 0.05);
    data.lastAnimationTime = time;

    const idleWave = Math.sin(time * 2 + data.phase);
    const movementTarget = data.standing && data.moving ? 1 : 0;
    const movementBlend = 1 - Math.exp(-deltaTime * 10);
    const actionBlend = 1 - Math.exp(-deltaTime * 12);
    data.walkBlend = THREE.MathUtils.lerp(
      data.walkBlend || 0,
      movementTarget,
      movementBlend,
    );
    data.phoneBlend = THREE.MathUtils.lerp(
      data.phoneBlend || 0,
      data.activity === "phone" ? 1 : 0,
      actionBlend,
    );
    if (data.walkBlend > 0.002) {
      data.gaitPhase += deltaTime * (7.2 + data.walkBlend * 0.8);
    }

    const stride = Math.sin(data.gaitPhase) * data.walkBlend;
    const throwing = active && data.throwUntil > time;
    const throwPhase = throwing
      ? THREE.MathUtils.clamp(
        (time - data.throwStartedAt) / (data.throwUntil - data.throwStartedAt),
        0,
        1,
      )
      : 1;

    if (data.head) {
      data.head.rotation.y = THREE.MathUtils.lerp(
        data.head.rotation.y,
        data.headTurn || 0,
        actionBlend,
      );
      data.head.rotation.x = THREE.MathUtils.lerp(
        data.head.rotation.x,
        THREE.MathUtils.clamp(data.headPitch || 0, -1.35, 1.35),
        actionBlend,
      );
    }

    if (data.bodyRig) {
      const stepBounce = (1 - Math.cos(data.gaitPhase * 2)) * 0.035 * data.walkBlend;
      data.bodyRig.position.y = stepBounce + Math.abs(idleWave) * 0.012;
      data.bodyRig.rotation.x = 0.035 * data.walkBlend;
      data.bodyRig.rotation.z = Math.sin(data.gaitPhase) * 0.022 * data.walkBlend;
    }

    if (data.standing) {
      data.legs.forEach((leg, index) => {
        const legCycle = Math.sin(data.gaitPhase + index * Math.PI);
        leg.rotation.x = legCycle * 0.55 * data.walkBlend;
        leg.rotation.z = Math.cos(data.gaitPhase + index * Math.PI) *
          0.025 * data.walkBlend;
        leg.position.y = 0.54;
      });
      (data.shins || []).forEach((shin, index) => {
        const legCycle = Math.sin(data.gaitPhase + index * Math.PI);
        const kneeLift = Math.max(0, -legCycle) * 0.78 * data.walkBlend;
        const pushOff = Math.max(0, legCycle) * 0.1 * data.walkBlend;
        shin.rotation.x = kneeLift + pushOff;
        shin.position.set(0, -0.91, 0);
      });
      (data.shoes || []).forEach((shoe, index) => {
        const legCycle = Math.sin(data.gaitPhase + index * Math.PI);
        const kneeLift = Math.max(0, -legCycle) * 0.78 * data.walkBlend;
        const hipSwing = legCycle * 0.55 * data.walkBlend;
        shoe.position.set(0, -0.88, -0.08);
        shoe.rotation.x = THREE.MathUtils.clamp(
          -hipSwing * 0.38 - kneeLift * 0.72,
          -0.58,
          0.28,
        );
      });
    }

    data.arms.forEach((arm, index) => {
      const side = index ? -1 : 1;
      if (throwing && index === 1) {
        if (throwPhase < 0.28) {
          arm.rotation.x = THREE.MathUtils.lerp(0.45, -1.35, throwPhase / 0.28);
          arm.rotation.z = THREE.MathUtils.lerp(-0.13, -0.55, throwPhase / 0.28);
        } else if (throwPhase < 0.45) {
          arm.rotation.x = THREE.MathUtils.lerp(
            -1.35,
            2.5,
            (throwPhase - 0.28) / 0.17,
          );
          arm.rotation.z = THREE.MathUtils.lerp(
            -0.55,
            -0.08,
            (throwPhase - 0.28) / 0.17,
          );
        } else {
          arm.rotation.x = THREE.MathUtils.lerp(
            2.5,
            0.45,
            (throwPhase - 0.45) / 0.55,
          );
          arm.rotation.z = THREE.MathUtils.lerp(
            -0.08,
            -0.13,
            (throwPhase - 0.45) / 0.55,
          );
        }
      } else if (throwing && index === 0) {
        arm.rotation.x = -0.35;
      } else if (data.phoneBlend > 0.01) {
        arm.rotation.x = THREE.MathUtils.lerp(
          data.standing ? stride * 0.3 * side : idleWave * 0.06 * side,
          1.12 + idleWave * 0.025,
          data.phoneBlend,
        );
      } else if (data.activity === "throw" && index === 1) {
        arm.rotation.x = 0.72;
      } else {
        arm.rotation.x = data.standing
          ? stride * 0.34 * side
          : idleWave * 0.06 * side;
      }
    });

    (data.forearms || []).forEach((forearm, index) => {
      const rest = data.standing ? 0.08 : 1.05;
      if (throwing && index === 1) {
        forearm.rotation.x = throwPhase < 0.45
          ? THREE.MathUtils.lerp(1.05, 0.12, throwPhase / 0.45)
          : THREE.MathUtils.lerp(0.12, 0.7, (throwPhase - 0.45) / 0.55);
        return;
      }
      forearm.rotation.x = THREE.MathUtils.lerp(rest, 1.35, data.phoneBlend);
    });

    const phoneProp = data.props?.get("phone");
    if (phoneProp?.visible) {
      const scale = phoneProp.userData.equipScale || 1;
      phoneProp.scale.setScalar(scale * (0.45 + data.phoneBlend * 0.55));
    }
  }
  return {
    character,
    playerCharacter,
    setPlayerStanding,
    horse,
    hotdog,
    soda,
    horseshoe,
    carrot,
    popcorn,
    chicken,
    pillow,
    chair,
    pretzel,
    nachos,
    waterBottle,
    beachBall,
    tennisBall,
    iceCream,
    foamFinger,
    bananaPeel,
    airHorn,
    throwable,
    equipPlayer,
    playPlayerThrow,
    animateCharacter,
    setPlayerColor,
  };
})();
