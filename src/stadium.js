"use strict";
HD.Stadium = (() => {
  const { mesh, box, sphere, cylinder } = HD.util;

  // ---------------------------------------------------------------------------
  // Track and stadium shell
  // ---------------------------------------------------------------------------

  function build(scene) {
    const ground = mesh(new THREE.CircleGeometry(190, 72), 0x4b8a45, scene, [0, -0.6, 0]);
    ground.rotation.x = -Math.PI / 2;
    const trackShape = new THREE.Shape();
    trackShape.absellipse(0, 0, 72, 43, 0, Math.PI * 2, false);
    const hole = new THREE.Path();
    hole.absellipse(0, 0, 49, 22, 0, Math.PI * 2, true);
    trackShape.holes.push(hole);
    const trackGeo = new THREE.ShapeGeometry(trackShape, 128);
    trackGeo.rotateX(-Math.PI / 2);
    trackGeo.rotateZ(Math.PI / 2);
    const track = new THREE.Mesh(trackGeo, HD.util.material(0xa96543));
    track.position.y = 0.03;
    track.receiveShadow = true;
    scene.add(track);
    for (let i = 0; i < 7; i++) addTrackLine(scene, 51.2 + i * 3.05, 24.2 + i * 3.05);
    addFinishLine(scene);
    addOvalRails(scene, 48.5, 21.5);
    addOvalRails(scene, 73.5, 44.5);
    const infield = mesh(new THREE.CylinderGeometry(1, 1, 0.1, 8), 0x519847, scene);
    infield.visible = false;
    createOvalGrandstands(scene);
    createBackground(scene);
    createInfield(scene);
    createConcourseDetails(scene);
    createPlayerRoutes(scene);
    createNearbyPlayers(scene);
    createViewModels(scene);
    HD.world.track = track;
    return track;
  }
  function oval(rx, rz, t) {
    return new THREE.Vector3(Math.cos(t) * rx, 0, Math.sin(t) * rz);
  }
  function addTrackLine(scene, rx, rz) {
    const points = [];
    for (let i = 0; i <= 160; i++) {
      const a = (i / 160) * Math.PI * 2;
      points.push(oval(rx, rz, a).setY(0.13));
    }
    scene.add(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({ color: 0xe8bd90, transparent: true, opacity: 0.65 }),
      ),
    );
  }
  function addOvalRails(scene, rx, rz) {
    const root = new THREE.Group();
    scene.add(root);
    const points = [];
    for (let i = 0; i <= 128; i++) {
      const a = (i / 128) * Math.PI * 2;
      points.push(oval(rx, rz, a).setY(1.1));
      if (i % 4 === 0) {
        const p = oval(rx, rz, a);
        cylinder(0.09, 0.12, 1.15, 0xf5e8c8, root, [p.x, 0.55, p.z], 7);
      }
    }
    root.add(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({ color: 0xf5e8c8 }),
      ),
    );
  }
  function addFinishLine(scene) {
    for (let z = -21; z < 22; z += 3)
      box([1.25, 0.14, 3], ((z + 21) / 3) % 2 ? 0x202020 : 0xffffff, scene, [71.1, 0.27, z]);
    const arch = new THREE.Group();
    scene.add(arch);
    cylinder(0.3, 0.4, 8, 0xf4df9f, arch, [71, 4, -22]);
    cylinder(0.3, 0.4, 8, 0xf4df9f, arch, [71, 4, 22]);
    box([1, 2.1, 45], 0xd94f31, arch, [71, 8, 0]);
  }
  function createOvalGrandstands(scene) {
    const root = new THREE.Group();
    scene.add(root);
    HD.world.crowd = [];
    const rows = 7;
    const columns = 128;
    const count = rows * columns;
    const dummy = new THREE.Object3D();
    const colors = [0xd94f31, 0x447fc1, 0xf0bd3b, 0x7e59a4, 0x3d8951, 0xd97d35];

    const seatBases = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1.35, 0.22, 1.25),
      HD.util.material(0x315b77),
      count,
    );
    const seatBacks = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1.35, 1.25, 0.18),
      HD.util.material(0x274b67),
      count,
    );
    const crowdBodies = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.32, 0.48, 1.25, 7),
      HD.util.material(0xffffff),
      count,
    );
    const crowdHeads = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.34, 7, 5),
      HD.util.material(0xefb88f),
      count,
    );

    [seatBases, seatBacks, crowdBodies, crowdHeads].forEach((batch) => {
      batch.castShadow = false;
      batch.receiveShadow = true;
      batch.frustumCulled = true;
      root.add(batch);
    });

    let instance = 0;
    for (let row = 0; row < rows; row++) {
      addTierRing(root, row);

      for (let column = 0; column < columns; column++) {
        const angle = (column / columns) * Math.PI * 2;
        const rx = 80 + row * 3.25;
        const rz = 50 + row * 2.75;
        const position = oval(rx, rz, angle);
        const yaw = -angle + Math.PI / 2;
        const height = 1.1 + row * 1.35;

        setInstance(dummy, seatBases, instance, position.x, height, position.z, yaw);
        setInstance(
          dummy,
          seatBacks,
          instance,
          position.x + Math.cos(angle) * 0.6,
          height + 0.55,
          position.z + Math.sin(angle) * 0.6,
          yaw,
        );
        setInstance(dummy, crowdBodies, instance, position.x, height + 1.05, position.z, yaw);
        setInstance(dummy, crowdHeads, instance, position.x, height + 1.95, position.z, yaw);
        crowdBodies.setColorAt(instance, new THREE.Color(colors[(column + row) % colors.length]));

        const inPlayerSection = Math.abs(angle - Math.PI / 2) < 0.13;
        if (inPlayerSection) {
          [seatBases, seatBacks, crowdBodies, crowdHeads].forEach((batch) => {
            hideInstance(dummy, batch, instance);
          });
        }
        instance++;
      }
    }

    crowdBodies.instanceColor.needsUpdate = true;
    createOvalCanopy(root);
  }

  function setInstance(dummy, batch, index, x, y, z, yaw) {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, yaw, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    batch.setMatrixAt(index, dummy.matrix);
  }

  function hideInstance(dummy, batch, index) {
    dummy.scale.set(0, 0, 0);
    dummy.updateMatrix();
    batch.setMatrixAt(index, dummy.matrix);
  }

  function addTierRing(root, row) {
    const shape = new THREE.Shape();
    const outerX = 82 + row * 3.25;
    const outerZ = 52 + row * 2.75;
    shape.absellipse(0, 0, outerX, outerZ, 0, Math.PI * 2, false);
    const hole = new THREE.Path();
    hole.absellipse(0, 0, outerX - 3, outerZ - 2.5, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const geometry = new THREE.ShapeGeometry(shape, 96);
    geometry.rotateX(-Math.PI / 2);
    geometry.rotateZ(Math.PI / 2);
    const tier = new THREE.Mesh(geometry, HD.util.material(row % 2 ? 0x456954 : 0x365744));
    tier.position.y = 0.55 + row * 1.35;
    tier.receiveShadow = true;
    root.add(tier);
  }

  function createOvalCanopy(root) {
    const shape = new THREE.Shape();
    shape.absellipse(0, 0, 110, 77, 0, Math.PI * 2, false);
    const hole = new THREE.Path();
    hole.absellipse(0, 0, 98, 65, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const geometry = new THREE.ShapeGeometry(shape, 96);
    geometry.rotateX(-Math.PI / 2);
    geometry.rotateZ(Math.PI / 2);
    const canopy = new THREE.Mesh(geometry, HD.util.material(0xf0cf61));
    canopy.position.y = 14.5;
    canopy.receiveShadow = true;
    root.add(canopy);
  }
  function createInfield(scene) {
    box([21, 4, 6], 0xf4d259, scene, [0, 2, 0]);
    box([18, 2.4, 6.2], 0x17382a, scene, [0, 5.2, 0]);
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2,
        p = oval(30, 10, angle);
      cylinder(0.45, 0.7, 6, 0x765034, scene, [p.x, 2.5, p.z]);
      sphere(3.8, 0x2f7d3e, scene, [p.x, 7, p.z]);
    }
    for (const x of [-89, 89]) {
      cylinder(1, 1.5, 28, 0xd7c990, scene, [x, 13, 0], 10);
      const lamps = box([11, 5, 1.6], 0x27352e, scene, [x, 27, 0]);
      for (let y = -1.5; y <= 1.5; y += 1.5)
        for (let z = -4; z <= 4; z += 2) sphere(0.35, 0xfff4be, lamps, [y, 0, z]);
    }
  }
  function createNearbyPlayers(scene) {
    HD.world.players = [];
    const seats = [
      [-3.4, 5.8, 49.2, "phone"],
      [0, 5.8, 49.2, "watch"],
      [3.4, 5.8, 49.2, "throw"],
      [-2.4, 10, 55, "watch"],
      [2.4, 10, 55, "phone"],
      [-4.2, 14.2, 61, "throw"],
      [4.2, 14.2, 61, "phone"],
    ];

    createPlayerSection(scene);

    seats.forEach((entry, i) => {
      const avatar = HD.Models.character(HD.CONFIG.playerColors[i + 1], {
        hat: HD.CONFIG.playerColors[(i + 3) % 8],
      });
      avatar.position.set(entry[0], entry[1], entry[2]);
      avatar.rotation.y = 0;
      avatar.userData.activity = entry[3];
      avatar.userData.name = `Player ${i + 2}`;
      scene.add(avatar);
      HD.world.players.push(avatar);
      createChair(scene, entry[0], entry[1] + 0.1, entry[2] + 0.45, HD.CONFIG.playerColors[i + 1]);
    });
  }

  // ---------------------------------------------------------------------------
  // Player seating, walkways, stairs, and physical shops
  // ---------------------------------------------------------------------------


  function createPlayerSection(scene) {
    const deckColor = 0xc8b389;
    box([14, 0.55, 5], deckColor, scene, [0, 5.05, 49.5]);
    box([14, 0.55, 5], deckColor, scene, [0, 9.25, 55.3]);
    box([14, 0.55, 5], deckColor, scene, [0, 13.45, 61.3]);

    for (const x of [-7, 7]) {
      box([0.25, 10.5, 0.25], 0xe9ddbd, scene, [x, 9.8, 54]);
    }
  }

  function createChair(scene, x, y, z, color) {
    box([2.1, 0.28, 1.8], color, scene, [x, y, z]);
    const back = box([2.1, 2, 0.25], color, scene, [x, y + 0.95, z + 0.8]);
    back.rotation.x = -0.08;
    cylinder(0.08, 0.1, 1.2, 0x39463e, scene, [x - 0.75, y - 0.65, z], 7);
    cylinder(0.08, 0.1, 1.2, 0x39463e, scene, [x + 0.75, y - 0.65, z], 7);
  }

  function createBackground(scene) {
    const canvas = document.createElement("canvas");
    canvas.width = 16;
    canvas.height = 512;
    const context = canvas.getContext("2d");
    const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, "#2e75bd");
    gradient.addColorStop(0.45, "#83cde8");
    gradient.addColorStop(0.72, "#e7d9a8");
    gradient.addColorStop(1, "#8eb06e");
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);

    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(340, 32, 16),
      new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(canvas),
        side: THREE.BackSide,
        fog: false,
      }),
    );
    sky.rotation.z = Math.PI;
    scene.add(sky);

    const mountainCount = 36;
    const mountains = new THREE.InstancedMesh(
      new THREE.ConeGeometry(18, 42, 6),
      new THREE.MeshLambertMaterial({ color: 0x58745d, flatShading: true }),
      mountainCount,
    );
    const dummy = new THREE.Object3D();
    for (let i = 0; i < mountainCount; i++) {
      const angle = (i / mountainCount) * Math.PI * 2;
      const radius = 205 + Math.sin(i * 4.7) * 18;
      dummy.position.set(Math.cos(angle) * radius, 12 + (i % 3) * 5, Math.sin(angle) * radius);
      dummy.scale.set(0.8 + (i % 4) * 0.12, 0.8 + (i % 5) * 0.08, 0.8);
      dummy.rotation.y = angle;
      dummy.updateMatrix();
      mountains.setMatrixAt(i, dummy.matrix);
    }
    mountains.castShadow = false;
    mountains.receiveShadow = false;
    scene.add(mountains);

    createTreeLine(scene);
  }

  function createTreeLine(scene) {
    const treeCount = 180;
    const trunks = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.45, 0.7, 5, 6),
      new THREE.MeshLambertMaterial({ color: 0x67472d }),
      treeCount,
    );
    const crowns = new THREE.InstancedMesh(
      new THREE.DodecahedronGeometry(2.8, 0),
      new THREE.MeshLambertMaterial({ color: 0x2f7541, flatShading: true }),
      treeCount,
    );
    const dummy = new THREE.Object3D();

    for (let i = 0; i < treeCount; i++) {
      const angle = (i / treeCount) * Math.PI * 2;
      const variation = Math.sin(i * 12.9898) * 10;
      const radius = 122 + (i % 5) * 7 + variation;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const scale = 0.75 + (i % 7) * 0.07;

      dummy.position.set(x, 2.4 * scale, z);
      dummy.scale.set(scale, scale, scale);
      dummy.rotation.y = angle;
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);

      dummy.position.y = 6.2 * scale;
      dummy.rotation.y = angle * 1.7;
      dummy.updateMatrix();
      crowns.setMatrixAt(i, dummy.matrix);
    }

    [trunks, crowns].forEach((batch) => {
      batch.castShadow = false;
      batch.receiveShadow = false;
      scene.add(batch);
    });

    createClouds(scene);
  }

  function createClouds(scene) {
    const cloudCount = 28;
    const clouds = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(5, 1),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.72 }),
      cloudCount,
    );
    const dummy = new THREE.Object3D();

    for (let i = 0; i < cloudCount; i++) {
      const angle = (i / cloudCount) * Math.PI * 2;
      const radius = 145 + (i % 4) * 22;
      dummy.position.set(Math.cos(angle) * radius, 45 + (i % 5) * 6, Math.sin(angle) * radius);
      dummy.scale.set(1.8 + (i % 3) * 0.5, 0.45 + (i % 2) * 0.12, 0.75);
      dummy.rotation.y = angle;
      dummy.updateMatrix();
      clouds.setMatrixAt(i, dummy.matrix);
    }

    clouds.frustumCulled = true;
    scene.add(clouds);
  }

  function createConcourseDetails(scene) {
    const vendorColors = [0xf25f5c, 0x247ba0, 0xffc857, 0x70c1b3];

    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2;
      const position = oval(82, 51, angle);
      const kiosk = new THREE.Group();
      kiosk.position.copy(position);
      kiosk.rotation.y = -angle + Math.PI / 2;
      scene.add(kiosk);

      box([5.5, 2.5, 2.6], vendorColors[i % vendorColors.length], kiosk, [0, 1.25, 0]);
      box([6, 0.35, 3.2], 0xffe29a, kiosk, [0, 2.8, 0]);
      box([4.6, 1.1, 0.12], 0x17382a, kiosk, [0, 3.65, 0]);

      cylinder(0.35, 0.55, 1.3, vendorColors[(i + 2) % vendorColors.length], kiosk, [0, 3.1, -1.3]);
      sphere(0.4, 0xefb88f, kiosk, [0, 4.05, -1.3]);
    }

    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * Math.PI * 2;
      const position = oval(78, 48, angle);
      cylinder(0.45, 0.55, 1.8, 0x294c3a, scene, [position.x, 0.9, position.z], 10);

      const flagPole = cylinder(0.05, 0.07, 6, 0xe9ddbd, scene, [position.x, 4.5, position.z], 7);
      const flag = box([2.2, 1.1, 0.08], HD.CONFIG.playerColors[i % 8], flagPole, [1.1, 2.2, 0]);
      flag.rotation.y = angle;
    }
  }

  function createPlayerRoutes(scene) {
    createRaisedRing(scene, 78.5, 48.5, 74, 44, 1.15, 0xd8c499);
    createRaisedRing(scene, 116, 82, 101, 67, 13.8, 0xb7a47f);

    for (let step = 0; step < 15; step++) {
      const progress = step / 14;
      const z = 44 + progress * 25;
      const y = 1.2 + progress * 13.1;
      box([5.5, 0.5, 2], step % 2 ? 0xc4b18c : 0xd3c09a, scene, [0, y, z]);
    }

    const shop = new THREE.Group();
    shop.position.set(0, 14.1, 73);
    shop.rotation.y = Math.PI;
    scene.add(shop);
    box([12, 5.2, 4], 0xe85d3b, shop, [0, 2.6, 0]);
    box([12.8, 0.5, 5], 0xffdd72, shop, [0, 5.4, 0]);
    box([8.5, 1.4, 0.18], 0x17382a, shop, [0, 6.6, -2.05]);
    box([10, 1.1, 1.2], 0xf3e4bd, shop, [0, 1.3, -2.3]);

    HD.world.shopPositions = [new THREE.Vector3(0, 18.2, 73)];
  }

  function createRaisedRing(scene, outerX, outerZ, innerX, innerZ, height, color) {
    const shape = new THREE.Shape();
    shape.absellipse(0, 0, outerX, outerZ, 0, Math.PI * 2, false);
    const hole = new THREE.Path();
    hole.absellipse(0, 0, innerX, innerZ, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const geometry = new THREE.ShapeGeometry(shape, 128);
    geometry.rotateX(-Math.PI / 2);
    geometry.rotateZ(Math.PI / 2);
    const walkway = new THREE.Mesh(geometry, HD.util.material(color));
    walkway.position.y = height;
    walkway.receiveShadow = true;
    scene.add(walkway);
  }
  function createViewModels(scene) {
    const camera = HD.world.camera,
      hand = new THREE.Group();
    camera.add(hand);
    scene.add(camera);
    hand.position.set(0.65, -0.6, -1.4);
    hand.rotation.set(-0.25, -0.25, -0.3);
    sphere(0.24, 0xefb88f, hand, [0, 0, 0]);
    HD.world.heldItems = {};
    Object.keys(HD.CONFIG.items).forEach((type) => {
      const item = HD.Models.throwable(type);
      item.scale.setScalar(type === "horseshoe" ? 0.85 : 0.7);
      item.position.set(-0.06, 0.24, -0.03);
      item.visible = type === HD.state.selectedItem;
      hand.add(item);
      HD.world.heldItems[type] = item;
    });
    hand.visible = false;
    HD.world.heldItem = hand;
    const phone = createPhoneModel();
    camera.add(phone);
    phone.position.set(0.62, -0.5, -1.18);
    phone.rotation.set(-0.18, -0.22, -0.05);
    phone.visible = false;
    HD.world.phoneModel = phone;
    const aimMaterial = new THREE.LineDashedMaterial({
      color: 0xffe25d,
      dashSize: 0.7,
      gapSize: 0.42,
      transparent: true,
      opacity: 0.9,
    });
    HD.world.trajectory = new THREE.Line(new THREE.BufferGeometry(), aimMaterial);
    scene.add(HD.world.trajectory);
    HD.world.trajectory.visible = false;
  }

  // ---------------------------------------------------------------------------
  // First-person held models
  // ---------------------------------------------------------------------------


  function createPhoneModel() {
    const phone = new THREE.Group();
    const shape = new THREE.Shape();
    const width = 0.76;
    const height = 1.46;
    const radius = 0.13;
    roundedRectangle(shape, -width / 2, -height / 2, width, height, radius);

    const shellGeometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.1,
      bevelEnabled: true,
      bevelSegments: 3,
      steps: 1,
      bevelSize: 0.035,
      bevelThickness: 0.025,
    });
    shellGeometry.translate(0, 0, -0.05);
    mesh(shellGeometry, 0x202523, phone);

    const screen = mesh(new THREE.PlaneGeometry(0.68, 1.34), 0x101b24, phone, [0, 0, 0.09], {
      roughness: 0.18,
      metalness: 0.08,
      emissive: 0x173b50,
      emissiveIntensity: 0.65,
    });
    screen.castShadow = false;

    box([0.28, 0.08, 0.025], 0x050807, phone, [0, 0.61, 0.105]);
    sphere(0.025, 0x1e3545, phone, [0.1, 0.61, 0.12]);

    const iconColors = [0xff5b5b, 0x4bc879, 0x4aa4ff, 0xffc84b, 0x9d6cff, 0x55d6d0];
    iconColors.forEach((color, index) => {
      const column = index % 3;
      const row = Math.floor(index / 3);
      const icon = box([0.14, 0.14, 0.02], color, phone, [
        -0.2 + column * 0.2,
        0.31 - row * 0.22,
        0.112,
      ]);
      icon.material.roughness = 0.35;
    });

    box([0.24, 0.025, 0.018], 0xe8eeee, phone, [0, -0.6, 0.115]);
    sphere(0.22, 0xefb88f, phone, [0.34, -0.52, 0.08]);
    return phone;
  }

  function roundedRectangle(shape, x, y, width, height, radius) {
    shape.moveTo(x + radius, y);
    shape.lineTo(x + width - radius, y);
    shape.quadraticCurveTo(x + width, y, x + width, y + radius);
    shape.lineTo(x + width, y + height - radius);
    shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    shape.lineTo(x + radius, y + height);
    shape.quadraticCurveTo(x, y + height, x, y + height - radius);
    shape.lineTo(x, y + radius);
    shape.quadraticCurveTo(x, y, x + radius, y);
  }
  function update(time) {
    HD.world.crowd.forEach((p, i) => {
      if (i % 3 === 0) HD.Models.animateCharacter(p, time, true);
    });
    HD.world.players.forEach((p) => HD.Models.animateCharacter(p, time, true));
  }
  return { build, update, oval };
})();
