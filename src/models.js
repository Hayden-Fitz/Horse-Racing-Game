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

  function buildPlayerCharacter(color, options = {}) {
    const root = new THREE.Group();
    const bodyRig = new THREE.Group();
    root.add(bodyRig);

    const skinTones = [0xf1c7a5, 0xc88962, 0x8d593d, 0xe0aa82, 0x6e432f];
    const skin = options.skin ?? skinTones[(options.variant || 0) % skinTones.length];
    const trousers = options.trousers || 0x252525;
    const shoeColor = options.shoeColor || 0x20201f;
    const outfit = options.outfit || "plain";

    const torso = mesh(
      new THREE.CylinderGeometry(0.43, 0.75, 1.9, 20),
      color,
      bodyRig,
      [0, 1.52, 0],
    );
    torso.scale.z = 0.85;
    torso.userData.baseY = 1.52;
    const outfitStart = bodyRig.children.length;
    if (outfit !== "plain") addPlayerOutfit(bodyRig, outfit, color);
    const outfitParts = bodyRig.children.slice(outfitStart);

    const head = sphere(0.64, skin, bodyRig, [0, 3.25, -0.02]);
    head.scale.set(0.95, 1.02, 0.94);
    [-1, 1].forEach((side) => {
      const ear = sphere(0.13, skin, bodyRig, [side * 0.62, 3.26, -0.01]);
      ear.scale.set(0.45, 0.9, 0.65);
      ear.visible = false;
    });
    const nose = sphere(0.095, skin, bodyRig, [0, 3.22, -0.625]);
    nose.scale.set(0.72, 0.95, 0.62);
    nose.visible = false;

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
      ...createPlayerExpression(bodyRig, options.expression || "none", faceMaterial),
    );
    if (!options.expression || options.expression === "none") {
      faceParts.forEach((part) => { part.visible = false; });
    }

    const hair = mesh(
      new THREE.SphereGeometry(0.65, 14, 8, 0, Math.PI * 2, 0, 1.25),
      options.hairColor || 0x3a281f,
      bodyRig,
      [0, 3.58, 0],
    );
    hair.scale.set(0.96, 0.6, 0.96);
    hair.visible = false;
    const hatParts = createPlayerHat(bodyRig, options.hat || "none", color);
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
      arm.position.set(side * 0.82, 2.13, 0);
      arm.rotation.z = side * -0.13;
      bodyRig.add(arm);
      sphere(0.2, color, arm, [0, -0.05, 0]);
      cylinder(0.15, 0.18, 0.82, color, arm, [0, -0.42, 0], 12);
      sphere(0.16, skin, arm, [0, -0.84, 0]);

      const forearm = new THREE.Group();
      forearm.position.set(0, -0.83, 0);
      forearm.rotation.x = 1.05;
      arm.add(forearm);
      cylinder(0.14, 0.17, 0.72, color, forearm, [0, -0.34, 0], 11);
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
      baseHead: head,
      bodyRig,
      head: headRig,
      hatParts,
      faceParts,
      accessoryParts,
      outfitParts,
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

  function playerCharacter(color, options = {}) {
    const player = buildPlayerCharacter(color, options);
    const suppliedBase = HD.Assets?.create("playerBase");
    if (!suppliedBase?.getObjectByName("HDPlayer_torso")) return player;
    return applySuppliedPlayerBase(player, suppliedBase, color, options);
  }

  function applySuppliedPlayerBase(player, suppliedBase, color, options) {
    const data = player.userData;
    const skin = options.skin ?? 0xf1c7a5;
    const trousers = options.trousers || 0x252525;
    const shoes = options.shoeColor || 0x20201f;

    // The source character faces +X. Turn it toward the game's -Z and align
    // its original shoes/head with the stadium floor and first-person camera.
    suppliedBase.rotation.y = Math.PI / 2;
    suppliedBase.position.y = 1.27;
    player.add(suppliedBase);
    player.updateMatrixWorld(true);

    const sourceParts = {};
    suppliedBase.traverse((object) => {
      if (!object.name.startsWith("HDPlayer_")) return;
      const id = object.name.slice("HDPlayer_".length);
      sourceParts[id] = object;
      object.userData.sourcePlayerPart = id;
      object.traverse((child) => {
        if (!child.isMesh) return;
        child.material = child.material.clone();
        if (child.material.name === "Player shirt") child.material.color.setHex(color);
        if (child.material.name === "Player skin") child.material.color.setHex(skin);
        if (child.material.name === "Player dark") {
          child.material.color.setHex(id.startsWith("shoe") ? shoes : trousers);
        }
        child.castShadow = false;
        child.receiveShadow = true;
      });
    });

    removeMesh(data.torso);
    removeMesh(data.baseHead);
    data.arms.forEach(removeDirectMeshes);
    data.forearms.forEach(removeDirectMeshes);
    data.legs.forEach(removeDirectMeshes);
    data.shins.forEach(removeDirectMeshes);
    data.shoes.forEach(removeDirectMeshes);

    attachParts(data.bodyRig, sourceParts, ["torso", "waist", "collar"]);
    attachParts(data.head, sourceParts, ["head"]);
    attachParts(data.arms[0], sourceParts, ["armLeft", "sleeveLeft"]);
    attachParts(data.arms[1], sourceParts, ["armRight", "sleeveRight"]);
    attachParts(data.legs[0], sourceParts, ["legLeft"]);
    attachParts(data.legs[1], sourceParts, ["legRight"]);
    attachParts(data.shoes[0], sourceParts, ["shoeLeft"]);
    attachParts(data.shoes[1], sourceParts, ["shoeRight"]);
    suppliedBase.removeFromParent();
    addImportedFootwear(data.shoes, options.shoes || "sneakers", shoes);

    data.importedBase = true;
    data.importedParts = sourceParts;
    data.torso = sourceParts.torso;
    data.baseHead = sourceParts.head;
    adjustImportedCosmetics(data, options);
    return player;
  }

  function adjustImportedCosmetics(data, options) {
    data.faceParts.forEach((part) => {
      part.position.z = -0.8;
      part.scale.multiplyScalar(1.08);
    });

    if (options.accessory === "glasses") {
      data.accessoryParts.forEach((part) => {
        part.position.z = -0.84;
        part.scale.multiplyScalar(1.12);
      });
    }
    if (options.accessory === "headphones") {
      data.accessoryParts.forEach((part) => {
        if (Math.abs(part.position.x) > 0.2) part.position.x = Math.sign(part.position.x) * 0.78;
        part.scale.multiplyScalar(1.12);
      });
    }

    if (options.hat === "cap" || options.hat === "beanie") {
      const [crown, brimOrBand] = data.hatParts;
      if (crown) {
        crown.position.y += 0.13;
        crown.scale.x *= 1.18;
        crown.scale.z *= 1.18;
      }
      if (brimOrBand) {
        brimOrBand.position.y += 0.1;
        if (options.hat === "cap") brimOrBand.position.z = -0.73;
        brimOrBand.scale.x *= 1.24;
        brimOrBand.scale.z *= 1.15;
      }
    } else if (["fedora", "cowboy", "crown"].includes(options.hat)) {
      data.hatParts.forEach((part) => {
        part.scale.x *= 1.18;
        part.scale.z *= 1.18;
        part.position.y += 0.1;
      });
    }

    data.outfitParts.forEach((part) => {
      if (part.position.z < -0.3) {
        part.position.z = -0.94;
        part.scale.x *= 1.18;
      }
    });
  }

  function addImportedFootwear(feet, style, color) {
    if (style === "boots") {
      feet.forEach((foot) => {
        cylinder(0.25, 0.27, 0.48, color, foot, [0, 0.12, 0.05], 12);
      });
    }
    if (style === "high-tops") {
      feet.forEach((foot) => {
        box([0.5, 0.44, 0.46], color, foot, [0, 0.08, 0.02]);
        box([0.3, 0.24, 0.035], 0xf4f1e8, foot, [0, 0.1, -0.22]);
      });
    }
  }

  function attachParts(parent, parts, names) {
    parent.updateMatrixWorld(true);
    names.forEach((name) => {
      if (parts[name]) parent.attach(parts[name]);
    });
  }

  function removeMesh(object) {
    object?.removeFromParent();
  }

  function removeDirectMeshes(group) {
    [...(group?.children || [])].forEach((child) => {
      if (child.isMesh) group.remove(child);
    });
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
    if (person.userData.importedBase) {
      Object.values(person.userData.importedParts || {}).forEach((part) => {
        part?.traverse((object) => {
          if (object.isMesh && object.material.name === "Player shirt") {
            object.material.color.setHex(color);
          }
        });
      });
    } else {
      person.userData.torso.material.color.setHex(color);
    }
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

  // Shared primitives keep the articulated field inexpensive to render.
  const horseSphere = new THREE.SphereGeometry(1, 12, 8);
  const horseCylinder = new THREE.CylinderGeometry(1, 1, 1, 10);
  const horseMaterials = new Map();

  function horsePart(parent, color, position, scale, geometry = horseSphere) {
    if (!horseMaterials.has(color)) {
      horseMaterials.set(color, new THREE.MeshStandardMaterial({
        color, roughness: 0.72, metalness: 0.015,
      }));
    }
    const part = new THREE.Mesh(geometry, horseMaterials.get(color));
    part.position.set(...position);
    part.scale.set(...scale);
    part.castShadow = part.receiveShadow = true;
    parent.add(part);
    return part;
  }

  function horseJoint(parent, name, position) {
    const joint = new THREE.Group();
    joint.name = name;
    joint.position.set(...position);
    parent.add(joint);
    return joint;
  }

  function horseRod(parent, start, end, radius, color) {
    const a = new THREE.Vector3(...start);
    const b = new THREE.Vector3(...end);
    const rod = horsePart(parent, color, [0, 0, 0],
      [radius, a.distanceTo(b), radius], horseCylinder);
    rod.position.copy(a).add(b).multiplyScalar(0.5);
    rod.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0), b.sub(a).normalize(),
    );
    return rod;
  }

  // Rings [x, y, halfDepth, halfHeight] form continuous barrel/neck/head surfaces.
  function horseLoft(parent, rings, color, sides = 16) {
    // Interpolate the profile too, so shoulders and muzzle do not form hard bands.
    const profile = [];
    for (let i = 0; i < rings.length - 1; i++) {
      const p0 = rings[Math.max(0, i - 1)];
      const p1 = rings[i];
      const p2 = rings[i + 1];
      const p3 = rings[Math.min(rings.length - 1, i + 2)];
      for (let sample = 0; sample < 4; sample++) {
        const t = sample / 4;
        profile.push(p1.map((value, axis) => {
          const result = 0.5 * ((2 * value) + (-p0[axis] + p2[axis]) * t
            + (2 * p0[axis] - 5 * value + 4 * p2[axis] - p3[axis]) * t * t
            + (-p0[axis] + 3 * value - 3 * p2[axis] + p3[axis]) * t * t * t);
          return axis > 1 ? Math.max(0.008, result) : result;
        }));
      }
    }
    profile.push(rings[rings.length - 1]);
    rings = profile;
    const positions = [];
    const indices = [];
    rings.forEach(([x, y, depth, height]) => {
      for (let side = 0; side < sides; side++) {
        const angle = side / sides * Math.PI * 2;
        positions.push(x, y + Math.cos(angle) * height, Math.sin(angle) * depth);
      }
    });
    for (let ring = 0; ring < rings.length - 1; ring++) {
      for (let side = 0; side < sides; side++) {
        const a = ring * sides + side;
        const b = ring * sides + (side + 1) % sides;
        indices.push(a, b, a + sides, b, b + sides, a + sides);
      }
    }
    for (const end of [0, rings.length - 1]) {
      const center = positions.length / 3;
      positions.push(rings[end][0], rings[end][1], 0);
      for (let side = 0; side < sides; side++) {
        const a = end * sides + side;
        const b = end * sides + (side + 1) % sides;
        indices.push(...(end === 0 ? [center, b, a] : [center, a, b]));
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return horsePart(parent, color, [0, 0, 0], [1, 1, 1], geometry);
  }

  function createHorseLeg(body, front, side, coat, sock) {
    const root = horseJoint(body, (front ? "Shoulder" : "Hip") + side,
      [front ? 1.08 : -1.18, front ? 2.57 : 2.43, side * 0.48]);
    const proximalLength = (front ? 0.48 : 0.72) * 0.86;
    const upperLength = (front ? 1.08 : 0.96) * 0.86;
    const lowerLength = (front ? 1.36 : 1.34) * 0.86;
    horsePart(root, coat, [0, -proximalLength * 0.33, 0],
      [front ? 0.33 : 0.4, proximalLength * 0.85, 0.31]);
    const upper = horseJoint(root, front ? "Elbow" : "Stifle",
      [0, -proximalLength, 0]);
    horsePart(upper, coat, [0, -upperLength * 0.43, 0],
      [front ? 0.22 : 0.28, upperLength * 0.57, 0.22]);
    const lower = horseJoint(upper, front ? "Knee" : "Hock",
      [0, -upperLength, 0]);
    horsePart(lower, coat, [0, 0, 0], [0.155, 0.15, 0.15]);
    horsePart(lower, coat, [0, -lowerLength * 0.46, 0],
      [0.12, lowerLength * 0.51, 0.12]);
    if (sock) {
      horsePart(lower, 0xe9e1cf, [0, -lowerLength * 0.85, 0],
        [0.128, lowerLength * 0.19, 0.13]);
    }
    const fetlock = horseJoint(lower, "Fetlock", [0, -lowerLength, 0]);
    horsePart(fetlock, sock ? 0xe9e1cf : coat, [0, 0, 0],
      [0.15, 0.14, 0.15]);
    horsePart(fetlock, sock ? 0xe9e1cf : coat, [0.035, -0.12, 0],
      [0.12, 0.16, 0.13]);
    const hoof = horseJoint(fetlock, "Hoof", [0.055, -0.27, 0]);
    const hoofMesh = horsePart(hoof, 0x302923, [0.035, -0.03, 0],
      [0.22, 0.14, 0.19],
      new THREE.CylinderGeometry(0.8, 1, 1, 10));
    hoofMesh.rotation.z = -0.1;
    horsePart(hoof, 0x181b1d, [0.04, -0.105, 0],
      [0.225, 0.025, 0.195], horseCylinder);
    root.userData = {
      front, side, upper, lower, fetlock, hoof,
      proximalLength, upperLength, lowerLength,
    };
    return root;
  }

  function jockeyCharacter(silkColor) {
    const root = new THREE.Group();
    root.name = "Racing jockey";
    const skin = 0xdba57a;
    const white = 0xeee9dd;
    const boot = 0x20262c;
    horsePart(root, white, [-0.12, 0.04, 0], [0.32, 0.23, 0.4]);
    const torso = horseJoint(root, "Jockey torso", [0, 0.18, 0]);
    horsePart(torso, silkColor, [0.27, 0.3, 0], [0.33, 0.55, 0.36])
      .rotation.z = -0.83;
    horsePart(torso, white, [0.27, 0.3, 0], [0.337, 0.14, 0.367])
      .rotation.z = -0.83;
    const head = horseJoint(torso, "Jockey head", [0.72, 0.72, 0]);
    horsePart(head, skin, [0.04, 0.03, 0], [0.29, 0.34, 0.27]);
    horsePart(head, silkColor, [0, 0.18, 0], [0.335, 0.3, 0.31],
      new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.56));
    horsePart(head, boot, [0.025, 0.135, 0], [0.345, 0.045, 0.317]);
    horsePart(head, boot, [0.24, 0.135, 0], [0.27, 0.035, 0.29]);
    horseRod(head, [0, 0.1, -0.27], [0.14, -0.23, -0.2], 0.025, boot);
    horseRod(head, [0, 0.1, 0.27], [0.14, -0.23, 0.2], 0.025, boot);
    const hands = [];
    [-1, 1].forEach((side) => {
      horseRod(torso, [0.47, 0.58, side * 0.27], [0.58, 0.17, side * 0.48], 0.115, silkColor);
      horsePart(torso, white, [0.53, 0.35, side * 0.4], [0.12, 0.11, 0.12]);
      horseRod(torso, [0.58, 0.17, side * 0.48], [1.05, 0.24, side * 0.38], 0.085, silkColor);
      hands.push(horsePart(torso, boot, [1.05, 0.24, side * 0.38], [0.12, 0.095, 0.095]));
      // Knees forward, heels back: both legs straddle the horse and saddle.
      horseRod(root, [-0.12, 0.03, side * 0.34], [0.38, -0.42, side * 0.83], 0.17, white);
      horsePart(root, white, [0.38, -0.42, side * 0.83], [0.16, 0.16, 0.16]);
      horseRod(root, [0.38, -0.42, side * 0.83], [-0.2, -0.94, side * 0.9], 0.12, boot);
      horsePart(root, boot, [-0.07, -1.0, side * 0.91], [0.26, 0.13, 0.14]);
    });
    root.userData = { torso, head, hands };
    return root;
  }

  function batchHorseParts(root, movingParts = new Set()) {
    // Only fuse rigid siblings. Joint pivots and animated reins remain separate.
    for (const child of [...root.children]) {
      if (child.isGroup) batchHorseParts(child, movingParts);
    }
    const batches = new Map();
    for (const child of root.children) {
      if (!child.isMesh || movingParts.has(child)) continue;
      const batch = batches.get(child.material) || [];
      batch.push(child);
      batches.set(child.material, batch);
    }
    for (const [material, parts] of batches) {
      if (parts.length < 2) continue;
      const positions = [];
      const normals = [];
      const uv = [];
      for (const part of parts) {
        part.updateMatrix();
        const geometry = part.geometry.index
          ? part.geometry.toNonIndexed() : part.geometry.clone();
        geometry.applyMatrix4(part.matrix);
        positions.push(...geometry.attributes.position.array);
        normals.push(...geometry.attributes.normal.array);
        uv.push(...geometry.attributes.uv?.array || new Float32Array(geometry.attributes.position.count * 2));
        geometry.dispose();
        root.remove(part);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
      geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      geometry.computeBoundingSphere();
      const combined = new THREE.Mesh(geometry, material);
      combined.name = root.name + " surface";
      combined.castShadow = combined.receiveShadow = true;
      root.add(combined);
    }
  }

  function horseSaddlecloth(parent, color, side) {
    const shape = new THREE.Shape();
    const width = 1.35;
    const height = 0.83;
    const radius = 0.14;
    shape.moveTo(radius, 0);
    shape.lineTo(width - radius, 0);
    shape.quadraticCurveTo(width, 0, width, radius);
    shape.lineTo(width, height - radius);
    shape.quadraticCurveTo(width, height, width - radius, height);
    shape.lineTo(radius, height);
    shape.quadraticCurveTo(0, height, 0, height - radius);
    shape.lineTo(0, radius);
    shape.quadraticCurveTo(0, 0, radius, 0);
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.065, bevelEnabled: true, bevelSegments: 2,
      steps: 1, bevelSize: 0.025, bevelThickness: 0.02, curveSegments: 4,
    });
    geometry.translate(-0.83, -0.42, -0.0325);
    const cloth = horsePart(parent, color, [-0.08, 2.76, side * 0.66], [1, 1, 1], geometry);
    cloth.rotation.x = side * 0.15;
  }

  function buildHorseVisual(body, data, index) {
    const coat = data.coat;
    const maneColor = new THREE.Color(coat).multiplyScalar(0.25).getHex();
    horseLoft(body, [
      [-1.96, 2.43, 0.018, 0.05], [-1.53, 2.43, 0.6, 0.78],
      [-0.85, 2.39, 0.7, 0.83], [0.05, 2.36, 0.65, 0.75],
      [0.82, 2.47, 0.61, 0.83], [1.35, 2.48, 0.45, 0.64],
      [1.62, 2.5, 0.025, 0.06],
    ], coat, 20);
    horsePart(body, coat, [0.66, 3.01, 0], [0.62, 0.34, 0.4]);
    const neck = horseJoint(body, "Neck base", [1.0, 2.79, 0]);
    horseLoft(neck, [
      [-0.34, 0.02, 0.48, 0.49], [0.0, 0.42, 0.42, 0.7],
      [0.39, 0.91, 0.3, 0.63], [0.72, 1.27, 0.24, 0.35],
      [0.86, 1.31, 0.18, 0.22],
    ], coat);
    for (let tuft = 0; tuft < 8; tuft++) {
      const t = tuft / 7;
      horsePart(neck, maneColor,
        [-0.31 + t * 0.98, 0.48 + t * 1.06, 0],
        [0.16, 0.21 - t * 0.06, 0.095]).rotation.z = -0.42;
    }
    const head = horseJoint(neck, "Poll / head", [0.8, 1.27, 0]);
    horseLoft(head, [
      [-0.17, 0.03, 0.2, 0.23], [0.02, 0.03, 0.32, 0.41],
      [0.39, -0.13, 0.265, 0.32], [0.84, -0.39, 0.22, 0.23],
      [1.05, -0.47, 0.23, 0.19],
    ], coat);
    const muzzleColor = new THREE.Color(coat).lerp(new THREE.Color(0x594438), 0.52).getHex();
    horsePart(head, muzzleColor, [0.97, -0.46, 0], [0.27, 0.205, 0.25]);
    const jaw = horseJoint(head, "Jaw", [0.23, -0.3, 0]);
    horsePart(jaw, coat, [0.29, -0.085, 0], [0.5, 0.13, 0.22]);
    const ears = [];
    [-1, 1].forEach((side) => {
      horsePart(head, coat, [0.1, -0.09, side * 0.21], [0.3, 0.28, 0.17]);
      horsePart(head, 0x151511, [0.22, 0.12, side * 0.296], [0.1, 0.086, 0.031]);
      horsePart(head, 0xf9f5e8, [0.25, 0.146, side * 0.322], [0.023, 0.025, 0.009]);
      horsePart(head, 0x2b211c, [1.08, -0.41, side * 0.205], [0.075, 0.046, 0.028]);
      const ear = horseJoint(head, "Ear" + side, [-0.015, 0.37, side * 0.19]);
      horsePart(ear, coat, [0.015, 0.16, 0], [0.09, 0.21, 0.075]);
      horsePart(ear, 0x997060, [0.082, 0.17, 0], [0.014, 0.135, 0.041]);
      ears.push(ear);
      horseRod(head, [0, 0.22, side * 0.325], [0.84, -0.37, side * 0.245], 0.036, data.color);
      horseRod(head, [-0.1, 0.21, side * 0.3], [0.1, -0.33, side * 0.3], 0.029, data.color);
    });
    horsePart(head, data.color, [0.8, -0.36, 0],
      [0.24, 0.047, 0.264], horseCylinder).rotation.z = Math.PI / 2 - 0.48;
    horsePart(head, maneColor, [0.18, 0.36, 0], [0.26, 0.1, 0.12]).rotation.z = -0.4;
    if (index % 3 !== 1) {
      const forehead = [
        [0.1, 0.43, 0.034], [0.27, 0.30, 0.055],
        [0.48, 0.145, 0.05], [0.65, 0.005, 0.041], [0.8, -0.12, 0.025],
      ];
      const vertices = [];
      const faces = [];
      forehead.forEach(([x, y, width], i) => {
        vertices.push(x, y, -width, x, y, width);
        if (i) faces.push(i * 2 - 2, i * 2, i * 2 - 1, i * 2 - 1, i * 2, i * 2 + 1);
      });
      const blaze = new THREE.BufferGeometry();
      blaze.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
      blaze.setIndex(faces);
      blaze.computeVertexNormals();
      horsePart(head, 0xeee6d7, [0, 0, 0], [1, 1, 1], blaze);
    }
    const tail = horseJoint(body, "Tail dock", [-1.68, 2.73, 0]);
    horseLoft(tail, [
      [-0.64, -0.43, 0.14, 0.19], [-0.45, -0.21, 0.16, 0.2],
      [-0.12, -0.06, 0.12, 0.12], [0.06, 0, 0.09, 0.09],
    ], maneColor, 10);
    const tailTip = horseJoint(tail, "Tail tip", [-0.64, -0.43, 0]);
    horseLoft(tailTip, [
      [-0.56, -0.7, 0.012, 0.025], [-0.38, -0.54, 0.1, 0.16],
      [-0.14, -0.24, 0.16, 0.24], [0.02, 0, 0.14, 0.19],
    ], maneColor, 10);

    const legs = [];
    for (const front of [false, true]) {
      for (const side of [-1, 1]) {
        legs.push(createHorseLeg(body, front, side, coat, (index + legs.length) % 3 === 0));
      }
    }
    horsePart(body, data.color, [-0.21, 3.06, 0], [0.84, 0.18, 0.74]);
    [-1, 1].forEach((side) => {
      horseSaddlecloth(body, data.color, side);
      horseRod(body, [-0.27, 3.17, side * 0.58], [-0.27, 2.06, side * 0.9],
        0.027, 0x4b3325);
      horseRod(body, [-0.4, 2.04, side * 0.92], [0.04, 2.04, side * 0.92],
        0.034, 0x8e9294);
    });
    horsePart(body, 0x38271f, [-0.28, 3.22, 0], [0.65, 0.17, 0.49]);
    const jockey = jockeyCharacter(data.color);
    jockey.position.set(-0.2, 3.32, 0);
    body.add(jockey);
    const reins = [-1, 1].map(() =>
      horseRod(body, [0, 0, 0], [1, 0, 0], 0.022, 0x453023));
    batchHorseParts(body, new Set([...reins, ...jockey.userData.hands]));
    return { body, legs, neck, head, jaw, ears, tail, tailTip, jockey, reins,
      frontLegs: legs.filter(leg => leg.userData.front),
      hindLegs: legs.filter(leg => !leg.userData.front),
      motion: 0, phase: index * 0.9, lastTime: null,
      pointA: new THREE.Vector3(), pointB: new THREE.Vector3(),
      up: new THREE.Vector3(0, 1, 0),
    };
  }

  function poseHorseLeg(leg, x, y, lift, bodyPitch, bodyY) {
    const limb = leg.userData;
    const proximalAngle = limb.front ? 0.06 + lift * 0.15 : 0.56 - lift * 0.22;
    leg.rotation.z = proximalAngle;
    // Inverse body pitch keeps planted feet on dirt while the barrel bobs.
    const worldX = leg.position.x + x;
    const worldY = y - bodyY;
    const cosine = Math.cos(bodyPitch);
    const sine = Math.sin(bodyPitch);
    const dx = cosine * worldX + sine * worldY - leg.position.x
      - Math.sin(proximalAngle) * limb.proximalLength;
    const dy = -sine * worldX + cosine * worldY - leg.position.y
      + Math.cos(proximalAngle) * limb.proximalLength;
    const a = limb.upperLength;
    const b = limb.lowerLength;
    const distanceSquared = Math.max(0.01, dx * dx + dy * dy);
    const bend = (limb.front ? -1 : 1) * Math.acos(
      THREE.MathUtils.clamp((distanceSquared - a * a - b * b) / (2 * a * b), -0.98, 0.995),
    );
    const upperAngle = Math.atan2(dx, -dy)
      - Math.atan2(b * Math.sin(bend), a + b * Math.cos(bend));
    limb.upper.rotation.z = upperAngle - proximalAngle;
    limb.lower.rotation.z = bend;
    limb.fetlock.rotation.z = -upperAngle - bend - bodyPitch + lift * (limb.front ? -0.5 : 0.3);
    limb.hoof.rotation.z = lift * -0.35;
  }

  function animateHorse(horse, elapsed, active = true, groundSpeed) {
    const rig = horse.userData.rig;
    if (!rig) return;
    const data = horse.userData.data;
    const time = Number.isFinite(elapsed) ? elapsed : (rig.lastTime ?? 0);
    const dt = rig.lastTime === null ? 0 : THREE.MathUtils.clamp(time - rig.lastTime, 0, 0.05);
    rig.lastTime = time;
    const base = Number.isFinite(data.baseSpeed) ? Math.max(0.001, data.baseSpeed) : 0.04;
    const speed = Number.isFinite(data.motionSpeed) ? Math.max(0, data.motionSpeed) : 0;
    const requestedMotion = active ? THREE.MathUtils.clamp(speed / base, 0, 1.5) : 0;
    rig.motion += (requestedMotion - rig.motion) * (1 - Math.exp(-dt * 10));
    const movement = rig.motion;
    const amount = THREE.MathUtils.smoothstep(movement, 0.005, 0.17);
    const gallopBlend = THREE.MathUtils.smoothstep(movement, 0.3, 0.72);
    const stance = THREE.MathUtils.lerp(0.64, 0.34, gallopBlend);
    const travel = THREE.MathUtils.lerp(0.5, 0.82,
      THREE.MathUtils.smoothstep(movement, 0.15, 1)) * amount;
    // The oval has different local curvature/radius. Use actual distance per
    // second to keep the planted foot travelling backward at the ground speed.
    const cadence = Number.isFinite(groundSpeed) && travel > 0.01
      ? THREE.MathUtils.clamp(groundSpeed * stance * Math.PI / travel, 0, 28)
      : (3.5 + movement * 10.5) * amount;
    rig.phase = (rig.phase + dt * cadence) % (Math.PI * 2);
    const phase = rig.phase;
    const bob = Math.sin(phase * 2) * 0.026 * amount
      + Math.max(0, Math.sin(phase - 0.3)) * 0.09 * gallopBlend;
    const pitch = Math.sin(phase - 0.6) * 0.036 * gallopBlend;
    const stunned = Number.isFinite(data.ragdoll) && data.ragdoll > 0;
    // Lower the barrel along with the shorter limbs, not the hoof contact plane.
    const bodyHeight = bob - 0.45;
    rig.body.position.set(0, stunned ? 0.1 : bodyHeight, 0);
    rig.body.rotation.set(stunned ? Math.sin(time * 13) * 0.45 : 0, 0,
      stunned ? 0.8 + Math.sin(time * 9) * 0.15 : pitch);
    const contacts = [0, 0.12, 0.4, 0.53];
    const walkContacts = [0, 0.5, 0.75, 0.25];
    rig.legs.forEach((leg, index) => {
      const offset = THREE.MathUtils.lerp(walkContacts[index], contacts[index], gallopBlend);
      const cycle = ((phase / (Math.PI * 2) - offset) % 1 + 1) % 1;
      let reach;
      let lift = 0;
      if (cycle < stance) {
        reach = 1 - 2 * cycle / stance;
      } else {
        const swing = (cycle - stance) / (1 - stance);
        reach = -Math.cos(swing * Math.PI);
        lift = Math.pow(Math.sin(swing * Math.PI), 1.35) * amount;
      }
      leg.position.y = leg.userData.front ? 2.57 - 0.14 * amount : 2.43;
      const restX = leg.userData.front ? 0.03 : -0.08;
      poseHorseLeg(leg, restX + reach * travel,
        -0.33 + lift * (0.32 + 0.55 * gallopBlend),
        lift, stunned ? 0 : pitch, stunned ? -0.45 : bodyHeight);
    });
    rig.neck.rotation.z = -0.045 * movement + Math.sin(phase - 0.5) * 0.047 * amount;
    rig.head.rotation.z = 0.025 * Math.sin(time * 1.3) * (1 - amount)
      + Math.sin(phase + 0.7) * 0.06 * amount;
    rig.head.rotation.y = Math.sin(time * 0.6 + data.poolIndex) * 0.025;
    rig.jaw.rotation.z = Math.max(0, Math.sin(time * 1.8)) * 0.018 * (1 - amount);
    rig.ears.forEach((ear, index) => {
      ear.rotation.z = -0.16 + 0.09 * Math.sin(time * 2.2 + index * 2.7);
      ear.rotation.x = (index ? 1 : -1) * 0.12;
    });
    rig.tail.rotation.y = Math.sin(phase * 0.5 + time * 0.7) * (0.06 + movement * 0.1);
    rig.tail.rotation.z = -movement * 0.2 + Math.sin(phase - 0.7) * 0.09 * amount;
    rig.tailTip.rotation.z = Math.sin(phase - 1.3) * 0.13 * amount;
    rig.jockey.userData.torso.rotation.z = -0.035 * movement
      - Math.sin(phase - 0.6) * 0.04 * amount;
    rig.jockey.userData.head.rotation.z = -rig.jockey.userData.torso.rotation.z * 0.55;
    // Attach reins to both the animated bit and the rider's gloves.
    rig.body.updateWorldMatrix(true, false);
    rig.reins.forEach((rein, index) => {
      const side = index ? 1 : -1;
      rig.pointA.set(0.84, -0.37, side * 0.25);
      rig.head.localToWorld(rig.pointA);
      rig.body.worldToLocal(rig.pointA);
      rig.jockey.userData.hands[index].getWorldPosition(rig.pointB);
      rig.body.worldToLocal(rig.pointB);
      rein.position.copy(rig.pointA).add(rig.pointB).multiplyScalar(0.5);
      rein.scale.y = rig.pointB.sub(rig.pointA).length();
      rein.quaternion.setFromUnitVectors(rig.up, rig.pointB.normalize());
    });
    data.gaitPhase = rig.phase;
  }

  function addSaddleNumber(body, number) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const context = canvas.getContext("2d");
    context.fillStyle = "#fff9ed";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = "bold 88px sans-serif";
    context.fillText(number, 64, 68);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({
      map: texture, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -1,
    });
    const geometry = new THREE.PlaneGeometry(0.51, 0.51);
    [-1, 1].forEach(side => {
      const numberMesh = new THREE.Mesh(geometry, material);
      numberMesh.position.set(-0.68, 2.74, side * 0.755);
      numberMesh.rotation.y = side < 0 ? Math.PI : 0;
      numberMesh.rotation.x = side * 0.15;
      body.add(numberMesh);
    });
  }

  function horse(data, index) {
    const root = new THREE.Group(),
      body = new THREE.Group();
    const poolIndex = HD.CONFIG.horses.findIndex((horseData) => horseData.id === data.id);
    const speedRating = data.speed || 75;
    const staminaRating = data.stamina || 75;
    const accelerationRating = data.acceleration || 75;
    const resistanceRating = data.resistance || 75;
    root.add(body);
    root.userData.body = body;
    const rig = buildHorseVisual(body, data, Math.max(0, poolIndex));
    rig.phase = index * 0.9;
    const { legs, frontLegs, hindLegs, ears, tail, jockey } = rig;
    addSaddleNumber(body, HD.horseNumber(data));
    const label = numberSprite(HD.horseNumber(data));
    label.position.set(0, 6.15, 0);
    root.add(label);
    root.userData = {
      body,
      legs,
      frontLegs,
      hindLegs,
      ears,
      tail,
      jockey,
      numberLabel: label,
      rig,
      data: {
        ...data,
        index,
        poolIndex,
        progress: 0,
        speed: 0,
        momentum: 0,
        baseSpeed:
          (0.0412 + speedRating * 0.00004) *
          (0.992 + Math.random() * 0.016),
        speedRating,
        staminaRating,
        accelerationRating,
        resistanceRating,
        lane: index,
        targetLane: index,
        earlyPace: 0.94 + accelerationRating * 0.0012,
        stamina: 0.95 + staminaRating * 0.001,
        finishKick: Math.max(0.012, (accelerationRating - 62) * 0.0015),
        acceleration: 0.9 + accelerationRating * 0.006,
        deceleration: 1 + resistanceRating * 0.003,
        slow: 0,
        finished: false,
        place: 0,
        odds: data.odds,
        startingOdds: data.odds,
        ragdoll: 0,
        boost: 0,
        resistance: 0,
        weave: 0,
        panic: 0,
        sabotagePenalty: 0,
        startDelay: 0,
        blockedTime: 0,
        maxSpeedBonus: 0,
        passing: false,
        clearTime: 0,
        laneDecisionTime: 0.8 + Math.random() * 1.4,
        motionSpeed: 0,
      },
    };
    animateHorse(root, 0, false);
    return root;
  }

  function disposeHorse(horse) {
    // Primitive geometry and coat materials are shared by the entire field.
    const geometries = new Set();
    const materials = new Set();
    horse.traverse(node => {
      if (node.geometry && node.geometry !== horseSphere && node.geometry !== horseCylinder) {
        geometries.add(node.geometry);
      }
      if (node.material && ![...horseMaterials.values()].includes(node.material)) {
        materials.add(node.material);
      }
    });
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => {
      material.map?.dispose();
      material.dispose();
    });
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
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }));
    sprite.scale.set(2.3, 2.3, 1);
    sprite.renderOrder = 10000;
    return sprite;
  }

  function setPlayerNameTag(player, name) {
    if (!player || player.userData.isLocalPlayer) return;

    const safeName = String(name || "Player").trim().slice(0, 28) || "Player";
    if (player.userData.nameTag?.userData.label === safeName) return;
    if (player.userData.nameTag) player.remove(player.userData.nameTag);

    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const context = canvas.getContext("2d");
    context.font = "900 54px sans-serif";
    const measuredWidth = context.measureText(safeName).width;
    const fontSize = Math.min(54, Math.max(30, 54 * (390 / Math.max(1, measuredWidth))));

    drawRoundedNameplate(context, 8, 10, 496, 108, 34);
    context.font = `900 ${fontSize}px sans-serif`;
    context.fillStyle = "#fff7d6";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(safeName, 256, 65);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }));
    tag.position.set(0, 4.75, 0);
    tag.scale.set(4.2, 1.05, 1);
    tag.renderOrder = 10001;
    tag.userData.label = safeName;
    player.add(tag);
    player.userData.name = safeName;
    player.userData.nameTag = tag;
  }

  function drawRoundedNameplate(context, x, y, width, height, radius) {
    context.beginPath();
    context.moveTo(x + radius, y);
    context.lineTo(x + width - radius, y);
    context.quadraticCurveTo(x + width, y, x + width, y + radius);
    context.lineTo(x + width, y + height - radius);
    context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    context.lineTo(x + radius, y + height);
    context.quadraticCurveTo(x, y + height, x, y + height - radius);
    context.lineTo(x, y + radius);
    context.quadraticCurveTo(x, y, x + radius, y);
    context.closePath();
    context.fillStyle = "rgba(15, 31, 24, 0.88)";
    context.fill();
    context.lineWidth = 5;
    context.strokeStyle = "rgba(255, 222, 116, 0.95)";
    context.stroke();
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

  function hurdle() {
    const root = new THREE.Group();
    const white = 0xf4f0df;
    const orange = 0xf07b2e;
    box([1.8, 0.18, 0.18], orange, root, [0, 0.62, 0]);
    box([0.18, 1.25, 0.18], white, root, [-0.72, 0, 0]);
    box([0.18, 1.25, 0.18], white, root, [0.72, 0, 0]);
    box([0.65, 0.12, 0.48], orange, root, [-0.72, -0.58, 0]);
    box([0.65, 0.12, 0.48], orange, root, [0.72, -0.58, 0]);
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

  function performanceOats() {
    const root = new THREE.Group();
    const sack = mesh(new THREE.CapsuleGeometry(0.32, 0.55, 4, 10), 0xd9bd78, root);
    sack.scale.set(0.9, 1.1, 0.72);
    sack.rotation.z = 0.12;
    cylinder(0.3, 0.24, 0.18, 0x8c6134, root, [0, 0.42, 0], 10);
    for (let index = 0; index < 5; index++) {
      const grain = cylinder(0.025, 0.04, 0.42, 0xe9c94f, root, [
        -0.22 + index * 0.1,
        0.72 + (index % 2) * 0.06,
        0,
      ], 6);
      grain.rotation.z = -0.24 + index * 0.1;
    }
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
    const imported = HD.Assets?.create(type);
    if (imported) return imported;
    const recreated = HD.ReferenceModels?.create(type);
    if (recreated) return recreated;
    if (type === "soda") return soda();
    if (type === "horseshoe") return horseshoe();
    if (type === "carrot") return carrot();
    if (type === "hurdle") return hurdle();
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
    if (type === "performanceOats") return performanceOats();
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
      prop.traverse((object) => {
        object.layers.mask = person.layers.mask;
      });
      prop.userData.equipScale = scale;
      prop.rotation.set(propKey === "phone" ? 0.1 : -0.25, 0, propKey === "phone" ? 0 : -0.5);
      if (itemType === "hotdog" && propKey !== "phone") {
        prop.rotation.set(0.65, 0, -0.2);
      }
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
    if (!Number.isFinite(data.gaitPhase)) data.gaitPhase = data.phase || 0;
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
    animateHorse,
    disposeHorse,
    hotdog,
    soda,
    horseshoe,
    carrot,
    popcorn,
    hurdle,
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
    performanceOats,
    airHorn,
    throwable,
    equipPlayer,
    playPlayerThrow,
    animateCharacter,
    setPlayerColor,
    setPlayerNameTag,
  };
})();
