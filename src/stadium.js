"use strict";
HD.Stadium = (() => {
  const { mesh, box, sphere, cylinder } = HD.util;
  const STAIR_ANGLES = [
    0,
    Math.PI / 2,
    Math.PI,
    (Math.PI * 3) / 2,
  ];
  const GRANDSTAND_COLUMNS = 128;
  const SEAT = Object.freeze({
    width: 2.1, depth: 1.6, cushionY: 1.52,
    backY: 2.48, backHeight: 1.8, backOffset: 0.72,
  });
  const UPPER_CONCOURSE_Y = 13.5;
  const STAIR_SURFACE_INSET = 0.055;
  const FIXER_ANGLE = Math.PI - 0.28;
  const REPLAY_ANGLE = 1.34 + Math.PI;
  const CAMERA_BAY_ANGLES = [0.6, Math.PI + 0.6];

  function inCameraBay(row, angle) {
    return row <= 2 && CAMERA_BAY_ANGLES.some(bay =>
      angleDistance(angle, bay) < 0.085);
  }
  const SECONDARY_ENTRANCE_ANGLES = Object.freeze([0, Math.PI]);
  const CONCOURSE_FACILITIES = Object.freeze([
    { angle: 0.2, label: 'RESTROOMS', accent: 0x256b9b },
    { angle: 2.16, label: 'FIRST AID', accent: 0xc34c46 },
    { angle: 3.38, label: 'RESTROOMS', accent: 0x256b9b },
    { angle: 5.95, label: 'STADIUM INFO', accent: 0x2b765c },
  ]);
  const ARENA_COLORS = Object.freeze({
    concrete: 0xc6c8c6,
    concreteDark: 0x7b8281,
    railing: 0x205b8f,
    lowerSeats: 0xe5b833,
    middleSeats: 0x438557,
    upperSeats: 0x2e6eb3,
  });
  const ELEVATED_SEATING = Object.freeze([
    // One intentionally open quadrant creates a believable mixed skyline.
    { floor: 2, start: 0.14, end: 1.43, baseY: 18 },
    { floor: 2, start: 3.28, end: 4.57, baseY: 18 },
    { floor: 2, start: 4.86, end: 6.14, baseY: 18 },
    { floor: 3, start: 3.28, end: 4.57, baseY: 29 },
    { floor: 3, start: 4.86, end: 6.14, baseY: 29 },
  ]);
  const DETAILED_SEATS = [
    { row: 1, column: 27, local: true, activity: "watch" },
    { row: 1, column: 26, activity: "phone" },
    { row: 1, column: 25, activity: "watch" },
    { row: 3, column: 27, activity: "throw" },
    { row: 3, column: 26, activity: "watch" },
    { row: 5, column: 27, activity: "phone" },
    { row: 5, column: 26, activity: "watch" },
    { row: 5, column: 25, activity: "throw" },
  ];

  // ---------------------------------------------------------------------------
  // Track and stadium shell
  // ---------------------------------------------------------------------------

  function build(scene) {
    HD.world.structuralBarriers = [];
    HD.world.projectileBarriers = [];
    HD.world.commentatorBox = undefined;
    HD.world.commentators = [];
    HD.world.horseTunnel = undefined;
    HD.world.horseServiceRoute = undefined;
    HD.world.horseServiceArea = undefined;

    const ground = mesh(new THREE.CircleGeometry(500, 96), 0x4b8a45, scene, [0, -0.6, 0]);
    ground.rotation.x = -Math.PI / 2;
    createExteriorTerrain(scene);
    const trackShape = new THREE.Shape();
    trackShape.absellipse(0, 0, 72, 43, 0, Math.PI * 2, false);
    const hole = new THREE.Path();
    hole.absellipse(0, 0, 49, 22, 0, Math.PI * 2, true);
    trackShape.holes.push(hole);
    const trackGeo = new THREE.ShapeGeometry(trackShape, 128);
    trackGeo.rotateX(-Math.PI / 2);
    const track = new THREE.Mesh(trackGeo, createDirtTrackMaterial());
    track.position.y = 0.03;
    track.receiveShadow = true;
    scene.add(track);
    createDetailedInfieldGrass(scene);
    refreshTrackLayout(scene);
    addFinishLine(scene);
    addOvalRails(scene, 48.5, 21.5, 0xf5e8c8);
    addOvalRails(scene, 73, 43.5, 0xf5e8c8);
    addOvalRails(scene, 74, 44, ARENA_COLORS.railing, 1.65);
    const infield = mesh(new THREE.CylinderGeometry(1, 1, 0.1, 8), 0x519847, scene);
    infield.visible = false;
    createOvalGrandstands(scene);
    createBackground(scene);
    createInfield(scene);
    createConcourseDetails(scene);
    createPlayerRoutes(scene);
    createArenaLandmarks(scene);
    clearSeatingFromStairs(scene);
    addSeatSupports(scene);
    batchStaticArchitecture(scene);
    createNearbyPlayers(scene);
    createViewModels(scene);
    HD.world.track = track;
    return track;
  }
  function createDirtTrackMaterial() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 512;
    const context = canvas.getContext('2d');
    context.fillStyle = '#a96543';
    context.fillRect(0, 0, 512, 512);
    // Repeatable low-contrast grit adds depth without large noisy patterns.
    for (let index = 0; index < 2200; index++) {
      const x = (index * 73 + (index % 19) * 17) % 512;
      const y = (index * 151 + (index % 13) * 11) % 512;
      context.fillStyle = index % 2 ? 'rgba(64,35,21,0.09)' : 'rgba(235,191,143,0.12)';
      context.fillRect(x, y, 1 + index % 3, 1 + index % 2);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(0.05, 0.05);
    return HD.util.material(0xffffff, { map: texture, roughness: 1, metalness: 0 });
  }

  function batchStaticArchitecture(scene) {
    scene.updateMatrixWorld(true);
    const groups = new Map();
    scene.traverseVisible((object) => {
      if (
        !object.isMesh ||
        object.isInstancedMesh ||
        object.children.length ||
        object.userData.noArenaBatch
      ) return;
      const material = object.material;
      if (!material?.isMeshStandardMaterial || material.map || material.transparent) return;
      if (object.isSkinnedMesh) return;
      const geometryKey = object.geometry.type === 'BoxGeometry' ? 'unit-box' :
        object.geometry.type + ':' + (object.geometry.parameters ? JSON.stringify(object.geometry.parameters) : object.geometry.uuid);
      const key = [material.color.getHex(), material.emissive.getHex(),
        material.emissiveIntensity, material.roughness, material.metalness,
        material.side, material.vertexColors, material.flatShading,
        object.castShadow, object.receiveShadow, geometryKey].join(':');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(object);
    });
    const unitBox = new THREE.BoxGeometry(1, 1, 1);
    let replaced = 0;
    for (const objects of groups.values()) {
      if (objects.length < 3) continue;
      const boxes = objects[0].geometry.type === 'BoxGeometry';
      const batch = new THREE.InstancedMesh(boxes ? unitBox : objects[0].geometry, objects[0].material, objects.length);
      batch.name = 'Batched static arena architecture';
      batch.castShadow = objects[0].castShadow;
      batch.receiveShadow = objects[0].receiveShadow;
      objects.forEach((object, index) => {
        const transform = object.matrixWorld.clone();
        if (boxes) {
          const { width, height, depth } = object.geometry.parameters;
          transform.scale(new THREE.Vector3(width, height, depth));
        }
        batch.setMatrixAt(index, transform);
      });
      batch.computeBoundingSphere();
      scene.add(batch);
      objects.forEach(object => object.removeFromParent());
      replaced += objects.length - 1;
    }
    HD.world.arenaBatchSavings = replaced;
  }

  function oval(rx, rz, t) {
    return new THREE.Vector3(Math.cos(t) * rx, 0, Math.sin(t) * rz);
  }

  function createExteriorTerrain(scene) {
    const roadShape = new THREE.Shape();
    roadShape.absellipse(0, 0, 172, 128, 0, Math.PI * 2, false);
    const roadHole = new THREE.Path();
    roadHole.absellipse(0, 0, 143, 99, 0, Math.PI * 2, true);
    roadShape.holes.push(roadHole);
    const roadGeometry = new THREE.ShapeGeometry(roadShape, 72);
    roadGeometry.rotateX(-Math.PI / 2);
    const road = new THREE.Mesh(roadGeometry, HD.util.material(0x424844));
    road.position.y = -0.48;
    road.receiveShadow = true;
    scene.add(road);

    const pathMaterial = HD.util.material(0xc6b58e);
    const parkingMaterial = HD.util.material(0x66706a);
    const locations = [
      [0, -142, 0],
      [0, 142, 0],
      [-155, 0, Math.PI / 2],
      [155, 0, Math.PI / 2],
    ];
    locations.forEach(([x, z, rotation], index) => {
      const lot = new THREE.Mesh(new THREE.PlaneGeometry(34, 19), parkingMaterial);
      lot.rotation.x = -Math.PI / 2;
      lot.rotation.z = rotation;
      lot.position.set(x, -0.455, z);
      lot.receiveShadow = true;
      scene.add(lot);

      const path = new THREE.Mesh(new THREE.PlaneGeometry(7, 34), pathMaterial);
      path.rotation.x = -Math.PI / 2;
      path.rotation.z = rotation;
      const pathRadius = index < 2 ? 118 : 128;
      path.position.set(
        index < 2 ? 0 : Math.sign(x) * pathRadius,
        -0.44,
        index < 2 ? Math.sign(z) * pathRadius : 0,
      );
      scene.add(path);

      for (let stripe = -3; stripe <= 3; stripe++) {
        const marker = new THREE.Mesh(
          new THREE.PlaneGeometry(0.16, 15),
          new THREE.MeshBasicMaterial({ color: 0xe6dfc6 }),
        );
        marker.rotation.x = -Math.PI / 2;
        marker.rotation.z = rotation;
        marker.position.set(
          x + (index < 2 ? stripe * 4.2 : 0),
          -0.43,
          z + (index >= 2 ? stripe * 4.2 : 0),
        );
        scene.add(marker);
      }
    });
  }
  function refreshTrackLayout(scene = HD.world.scene) {
    if (!scene) return;
    const previous = HD.world.laneMarkings;
    if (previous) {
      previous.removeFromParent();
      previous.traverse((object) => {
        object.geometry?.dispose();
        object.material?.dispose();
      });
    }
    const markings = new THREE.Group();
    markings.name = "Track lane markings";
    scene.add(markings);
    HD.world.laneMarkings = markings;
    const lanes = HD.CONFIG.trackLanes;
    for (let line = 0; line <= HD.CONFIG.raceHorseCount; line++) {
      addTrackLine(
        markings,
        lanes.innerLineX + line * lanes.spacingX,
        lanes.innerLineZ + line * lanes.spacingZ,
      );
    }
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
  function addOvalRails(scene, rx, rz, color, baseHeight = 0) {
    const root = new THREE.Group();
    scene.add(root);
    const lowerRail = [];
    const upperRail = [];
    for (let i = 0; i <= 128; i++) {
      const a = (i / 128) * Math.PI * 2;
      lowerRail.push(oval(rx, rz, a).setY(baseHeight + 1.2));
      upperRail.push(oval(rx, rz, a).setY(baseHeight + 2.4));
      if (i % 4 === 0) {
        const p = oval(rx, rz, a);
        cylinder(0.1, 0.13, 2.4, color, root, [p.x, baseHeight + 1.2, p.z], 7);
      }
    }
    [lowerRail, upperRail].forEach((points) => {
      root.add(new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 256, 0.09, 5, false),
        HD.util.material(color),
      ));
    });
  }
  function addFinishLine(scene) {
    const startX = HD.CONFIG.trackLanes.innerLineX;
    const endX = startX +
      HD.CONFIG.raceHorseCount * HD.CONFIG.trackLanes.spacingX;
    const checkerWidth = (endX - startX) / 12;
    for (let checker = 0; checker < 12; checker++) {
      const color = checker % 2 ? 0x202020 : 0xffffff;
      box(
        [checkerWidth, 0.14, 1.25],
        color,
        scene,
        [startX + checkerWidth * (checker + 0.5), 0.27, 0],
      );
    }

    const arch = new THREE.Group();
    scene.add(arch);
    cylinder(0.3, 0.4, 8, 0xf4df9f, arch, [48.5, 4, 0]);
    cylinder(0.3, 0.4, 8, 0xf4df9f, arch, [74, 4, 0]);
    box([26.5, 1.5, 1], 0xd94f31, arch, [61.25, 8, 0]);

    addDistanceMarkers(scene);
  }

  function refreshStartingGate() {
    const previous = HD.world.startingGate;
    if (previous) {
      previous.removeFromParent();
      previous.traverse(object => {
        object.geometry?.dispose();
        if (object.material?.map) object.material.map.dispose();
        object.material?.dispose();
      });
    }
    if (!HD.world.scene) return;
    const root = new THREE.Group();
    root.name = 'Mobile starting gate';
    const lanes = HD.CONFIG.trackLanes;
    const count = HD.CONFIG.raceHorseCount;
    const startX = lanes.innerLineX;
    const width = lanes.spacingX;
    root.userData.doors = [];
    for (let lane = 0; lane <= count; lane++) {
      const x = startX + lane * width;
      for (const z of [-3.8, 3.8]) {
        box([0.12, 7, 0.12], 0x2c5c4b, root, [x, 3.5, z]);
      }
      box([0.1, 0.12, 7.6], 0xaab7b5, root, [x, 2.4, 0]);
      box([0.1, 0.12, 7.6], 0xaab7b5, root, [x, 4.4, 0]);
      if (lane === count) continue;
      const door = new THREE.Group();
      door.position.set(x, 0, 3.8);
      root.add(door);
      box([width - 0.12, 0.12, 0.12], 0x2c5c4b, door, [width / 2, 2.4, 0]);
      box([width - 0.12, 0.12, 0.12], 0x2c5c4b, door, [width / 2, 4.4, 0]);
      root.userData.doors.push(door);
      const plate = createTextSign(String(lane + 1), 0xffffff);
      plate.position.set(x + width / 2, 6.5, 3.9);
      plate.rotation.y = 0;
      plate.scale.set(width * 0.6, 0.8, 1);
      root.add(plate);
    }
    box([count * width + 0.5, 0.5, 0.4], 0x2c5c4b, root,
      [startX + count * width / 2, 7, 3.8]);
    for (const x of [startX - 0.35, startX + count * width + 0.35]) {
      for (const z of [-3.8, 3.8]) {
        const wheel = cylinder(0.4, 0.4, 0.25, 0x263238, root, [x, 0.4, z], 10);
        wheel.rotation.z = Math.PI / 2;
      }
    }
    HD.world.scene.add(root);
    HD.world.startingGate = root;
  }

  function addDistanceMarkers(scene) {
    const markerAngles = [Math.PI / 2 + 0.3, Math.PI, Math.PI * 1.5];
    const labels = ["800m", "400m", "200m"];

    markerAngles.forEach((angle, index) => {
      const position = oval(74.5, 45.5, angle);
      cylinder(0.12, 0.16, 3.6, 0xf4df9f, scene, [position.x, 1.8, position.z], 8);

      const marker = createTextSign(labels[index], 0xffffff);
      marker.position.set(position.x, 3.8, position.z);
      marker.rotation.y = -angle + Math.PI / 2;
      marker.scale.set(1.8, 1.25, 1);
      scene.add(marker);
    });
  }
  function createOvalGrandstands(scene) {
    const root = new THREE.Group();
    scene.add(root);
    // The experimental stacked green/blue grandstands and their stair towers
    // were removed. Keep one readable lower bowl with the established public
    // stairs and the separate shop concourse behind it.
    HD.world.arenaSurfaces = [];
    HD.world.crowd = [];
    const rows = 7;
    const columns = GRANDSTAND_COLUMNS;
    const count = rows * columns;
    const dummy = new THREE.Object3D();
    const colors = [0xd94f31, 0x447fc1, 0xf0bd3b, 0x7e59a4, 0x3d8951, 0xd97d35];
    const throwerSeats = chooseCrowdThrowerSeats(rows, columns);

    const seatBases = new THREE.InstancedMesh(
      createSeatGeometry(false),
      HD.util.material(ARENA_COLORS.lowerSeats),
      count,
    );
    const seatBacks = new THREE.InstancedMesh(
      createSeatGeometry(true),
      HD.util.material(0xc69623),
      count,
    );
    const crowdBodies = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.42, 0.62, 1.55, 7),
      HD.util.material(0xffffff),
      count,
    );
    const crowdHeads = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.43, 7, 5),
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
        const rx = 82.1 + row * 3.25;
        const rz = 51.85 + row * 2.75;
        const position = oval(rx, rz, angle);
        const yaw = -angle + Math.PI / 2;
        const tierTop = HD.CONFIG.grandstandBaseHeight + row * 1.5;

        setInstance(dummy, seatBases, instance, position.x, tierTop + SEAT.cushionY, position.z, yaw);
        setInstance(
          dummy,
          seatBacks,
          instance,
          position.x + Math.cos(angle) * SEAT.backOffset,
          tierTop + SEAT.backY,
          position.z + Math.sin(angle) * SEAT.backOffset,
          yaw,
        );
        setInstance(
          dummy,
          crowdBodies,
          instance,
          position.x,
          tierTop + 2.5,
          position.z,
          yaw,
        );
        setInstance(
          dummy,
          crowdHeads,
          instance,
          position.x,
          tierTop + 3.68,
          position.z,
          yaw,
        );
        crowdBodies.setColorAt(instance, new THREE.Color(colors[(column + row) % colors.length]));

        const detailedPlayerSeat = DETAILED_SEATS.some(
          (seat) => seat.row === row && seat.column === column,
        );
        const inStairAisle = STAIR_ANGLES.some(
          (stairAngle) =>
            angleDistance(angle, stairAngle) < stairHalfAngle(rx, rz, stairAngle) + 1.2 / Math.min(rx, rz),
        );
        const besideSupport = ELEVATED_SEATING.some(section => {
          const floorTwo = section.floor === 2;
          return [section.start, section.end].some(a => {
            const point = oval(floorTwo ? 91.6 : 97.8, floorTwo ? 60.35 : 65.8, a);
            return point.distanceToSquared(position) < 2.25;
          });
        });
        if (detailedPlayerSeat || inStairAisle || besideSupport || inCameraBay(row, angle)) {
          [seatBases, seatBacks, crowdBodies, crowdHeads].forEach((batch) => {
            hideInstance(dummy, batch, instance);
          });
        }
        instance++;
      }
    }

    crowdBodies.instanceColor.needsUpdate = true;
    [seatBases, seatBacks, crowdBodies, crowdHeads].forEach(batch => {
      splitSeatingBatch(root, batch, rows, columns);
    });
    createCrowdThrowers(scene, throwerSeats, colors);
    createSingleBowlCanopy(root);
  }

  function splitSeatingBatch(root, source, rows, columns) {
    const sectorColumns = columns / 8;
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    for (let sector = 0; sector < 8; sector++) {
      const batch = new THREE.InstancedMesh(source.geometry, source.material, rows * sectorColumns);
      batch.name = 'Lower bowl seating sector ' + sector;
      batch.receiveShadow = source.receiveShadow;
      batch.castShadow = source.castShadow;
      batch.userData.seatingSector = { firstColumn: sector * sectorColumns, sectorColumns, columns, rows };
      batch.userData.stadiumSeating = true;
      for (let row = 0; row < rows; row++) {
        for (let column = 0; column < sectorColumns; column++) {
          const original = row * columns + sector * sectorColumns + column;
          const target = row * sectorColumns + column;
          source.getMatrixAt(original, matrix);
          batch.setMatrixAt(target, matrix);
          if (source.instanceColor) {
            source.getColorAt(original, color);
            batch.setColorAt(target, color);
          }
        }
      }
      batch.computeBoundingSphere();
      root.add(batch);
    }
    source.removeFromParent();
    source.dispose();
  }

  function createElevatedGrandstandSections(root) {
    HD.world.arenaSurfaces = [];
    ELEVATED_SEATING.forEach((section, index) => {
      createElevatedGrandstandSection(root, section, index);
    });
    createConnectedTierStairs(root);
  }

  function createElevatedGrandstandSection(root, section, sectionIndex) {
    const floorTwo = section.floor === 2;
    const rows = floorTwo ? 4 : 3;
    const columns = Math.max(12, Math.floor((section.end - section.start) * 58 / 2.65));
    const count = rows * columns;
    const color = floorTwo ? ARENA_COLORS.middleSeats : ARENA_COLORS.upperSeats;
    const seatBases = new THREE.InstancedMesh(
      createSeatGeometry(false),
      HD.util.material(color),
      count,
    );
    const seatBacks = new THREE.InstancedMesh(
      createSeatGeometry(true),
      HD.util.material(floorTwo ? 0x326b45 : 0x255b94),
      count,
    );
    const dummy = new THREE.Object3D();
    const innerX = floorTwo ? 88.6 : 94.8;
    const innerZ = floorTwo ? 57.35 : 62.8;
    const rowStepX = 2.9;
    const rowStepZ = 2.6;
    const aisleAngle = (section.start + section.end) / 2;
    const aisleHalfAngle = 3.6 / Math.hypot(
      innerX * Math.sin(aisleAngle), innerZ * Math.cos(aisleAngle),
    );

    for (let row = 0; row < rows; row++) {
      const deckY = section.baseY + row * 1.18;
      HD.world.arenaSurfaces.push({
        id: `deck-${sectionIndex}-${row}`,
        start: section.start, end: section.end,
        innerX: innerX + row * rowStepX - 0.32,
        innerZ: innerZ + row * rowStepZ - 0.32,
        outerX: innerX + (row + 1) * rowStepX + 0.32,
        outerZ: innerZ + (row + 1) * rowStepZ + 0.32,
        y: deckY,
      });
      for (const [start, end] of [
        [section.start, aisleAngle - aisleHalfAngle],
        [aisleAngle + aisleHalfAngle, section.end],
      ]) {
      createSolidOvalSegment(
        root,
        innerX + (row + 1) * rowStepX + 0.32,
        innerZ + (row + 1) * rowStepZ + 0.32,
        innerX + row * rowStepX - 0.32,
        innerZ + row * rowStepZ - 0.32,
        deckY,
        ARENA_COLORS.concrete,
        start,
        end,
        10,
        deckY - 1.58,
      );
      }

      for (let column = 0; column < columns; column++) {
        const instance = row * columns + column;
        const angle = THREE.MathUtils.lerp(
          section.start,
          section.end,
          (column + 0.5) / columns,
        );
        const position = oval(
          innerX + row * rowStepX,
          innerZ + row * rowStepZ,
          angle,
        );
        const yaw = -angle + Math.PI / 2;
        // Four blocks per major section leave readable vertical aisle breaks.
        if (Math.abs(angle - aisleAngle) < aisleHalfAngle + 1.2 / innerZ) {
          hideInstance(dummy, seatBases, instance);
          hideInstance(dummy, seatBacks, instance);
          continue;
        }
        setInstance(dummy, seatBases, instance, position.x, deckY + SEAT.cushionY, position.z, yaw);
        setInstance(
          dummy,
          seatBacks,
          instance,
          position.x + Math.cos(angle) * SEAT.backOffset,
          deckY + SEAT.backY,
          position.z + Math.sin(angle) * SEAT.backOffset,
          yaw,
        );
      }
    }

    [seatBases, seatBacks].forEach((batch) => {
      batch.castShadow = false;
      batch.receiveShadow = true;
      batch.instanceMatrix.needsUpdate = true;
      batch.userData.seatingFloor = section.floor;
      batch.userData.stadiumSeating = true;
      batch.userData.seatingSection = sectionIndex;
      root.add(batch);
    });

    const frontX = innerX - 4.2;
    const frontZ = innerZ - 4.2;
    const terraceGap = aisleHalfAngle * 0.9;
    [[section.start, aisleAngle - terraceGap],
      [aisleAngle + terraceGap, section.end]].forEach(
      ([startAngle, endAngle], terraceIndex) => {
        createSolidOvalSegment(
          root, innerX, innerZ, frontX, frontZ,
          section.baseY, ARENA_COLORS.concrete,
          startAngle, endAngle, 14, section.baseY - 0.65,
        );
        HD.world.arenaSurfaces.push({
          id: `terrace-${sectionIndex}-${terraceIndex}`,
          terrace: true,
          floor: section.floor,
          start: startAngle,
          end: endAngle,
          innerX: frontX,
          innerZ: frontZ,
          outerX: innerX,
          outerZ: innerZ,
          y: section.baseY,
        });
      },
    );
    addElevatedDeckFascia(
      root,
      section,
      frontX,
      frontZ,
      innerX + rows * rowStepX,
      innerZ + rows * rowStepZ,
    );
    addSectionRail(root, frontX, frontZ, section.start, section.end, section.baseY);
    addGrandstandSupports(root, section, innerX + 3, innerZ + 3);
    const start = oval(innerX - 0.2, innerZ - 0.2, aisleAngle);
    const end = oval(innerX + rows * rowStepX, innerZ + rows * rowStepZ, aisleAngle);
    start.y = section.baseY;
    end.y = section.baseY + (rows - 1) * 1.18;
    const outward = new THREE.Vector3(Math.cos(aisleAngle), 0, Math.sin(aisleAngle));
    const landingFront = end.clone().addScaledVector(outward, -3.3);
    const landingRear = end.clone().addScaledVector(outward, 3.3);
    createUpperAisle(root, start, landingFront, sectionIndex);
    createUpperAisle(root, landingFront, landingRear, 'rear-landing-' + sectionIndex);
  }

  function addElevatedDeckFascia(root, section, frontX, frontZ, rearX, rearZ) {
    const accent = section.floor === 2
      ? ARENA_COLORS.middleSeats
      : ARENA_COLORS.upperSeats;

    // A substantial front beam stops the balcony from reading as a floating sheet.
    createSolidOvalSegment(
      root,
      frontX + 0.48,
      frontZ + 0.48,
      frontX,
      frontZ,
      section.baseY - 0.08,
      ARENA_COLORS.concreteDark,
      section.start,
      section.end,
      28,
      section.baseY - 1.42,
    );

    addCurvedAccentBand(
      root,
      frontX - 0.04,
      frontZ - 0.04,
      section.start,
      section.end,
      section.baseY - 0.38,
      accent,
    );

    // Finish both exposed ends of each independently constructed grandstand.
    for (const angle of [section.start, section.end]) {
      const front = oval(frontX + 0.2, frontZ + 0.2, angle);
      const rear = oval(rearX + 0.2, rearZ + 0.2, angle);
      const length = front.distanceTo(rear);
      const midpoint = front.clone().lerp(rear, 0.5);
      const wall = box(
        [0.44, 1.55, length],
        ARENA_COLORS.concreteDark,
        root,
        [midpoint.x, section.baseY - 0.72, midpoint.z],
      );
      wall.rotation.y = Math.atan2(rear.x - front.x, rear.z - front.z);
    }
  }

  function addCurvedAccentBand(root, radiusX, radiusZ, start, end, y, color) {
    const points = [];
    for (let index = 0; index <= 32; index++) {
      const angle = THREE.MathUtils.lerp(start, end, index / 32);
      points.push(oval(radiusX, radiusZ, angle).setY(y));
    }
    const geometry = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(points),
      48,
      0.11,
      5,
      false,
    );
    root.add(new THREE.Mesh(geometry, HD.util.material(color)));
  }

  function createConnectedTierStairs(root) {
    const floorTwoY = 18;
    const floorTwoRearY = floorTwoY + 3 * 1.18;
    const floorThreeY = 29;
    const floorThreeAccess = [0, Math.PI, Math.PI * 1.5];

    STAIR_ANGLES.forEach((angle, stairIndex) => {
      const tangent = new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle));
      const stairTangent = tangent.clone()
        .multiplyScalar(stairIndex % 2 === 0 ? -1 : 1);
      const outward = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
      const mainStairTop = oval(
        HD.CONFIG.stairs.endX,
        HD.CONFIG.stairs.endZ,
        angle,
      ).setY(UPPER_CONCOURSE_Y);
      // Keep the tower beside the lower-bowl aisle. The previous tangent-first
      // layout crossed directly over the public stair and read as a collection
      // of floating, unrelated ramps.
      const lowerLanding = mainStairTop.clone()
        .addScaledVector(stairTangent, 6.4);
      const floorTwoFront = oval(86.4, 55.2, angle).setY(floorTwoY);
      const floorTwoRear = oval(100.2, 67.75, angle).setY(floorTwoRearY);
      const firstFlightEnd = lowerLanding.clone()
        .addScaledVector(outward, 14)
        .setY((UPPER_CONCOURSE_Y + floorTwoRearY) / 2);
      const secondFlightStart = firstFlightEnd.clone()
        .addScaledVector(stairTangent, 8);
      const upperLanding = secondFlightStart.clone()
        .addScaledVector(outward, -14)
        .setY(floorTwoRearY);

      createUpperAisle(
        root, mainStairTop, lowerLanding,
        `spine-${stairIndex}-level-two-entry`, HD.CONFIG.stairs.width,
      );
      createUpperAisle(
        root, lowerLanding, firstFlightEnd,
        `spine-${stairIndex}-level-two-lower`, HD.CONFIG.stairs.width,
      );
      createUpperAisle(
        root, firstFlightEnd, secondFlightStart,
        `spine-${stairIndex}-level-two-landing`, HD.CONFIG.stairs.width,
      );
      createUpperAisle(
        root, secondFlightStart, upperLanding,
        `spine-${stairIndex}-level-two-upper`, HD.CONFIG.stairs.width,
      );
      createUpperAisle(
        root, upperLanding, floorTwoRear,
        `spine-${stairIndex}-level-two-top-bridge`, HD.CONFIG.stairs.width,
      );
      createUpperAisle(
        root, floorTwoFront, floorTwoRear,
        `spine-${stairIndex}-middle-aisle`, HD.CONFIG.stairs.width,
      );

      if (!floorThreeAccess.some(value => angleDistance(value, angle) < 0.01)) {
        return;
      }

      const towerTangent = tangent.clone()
        .multiplyScalar(stairIndex % 2 === 0 ? 1 : -1);
      const towerEntry = floorTwoRear.clone()
        .addScaledVector(towerTangent, 6.4);
      const corner = towerEntry.clone()
        .addScaledVector(outward, 18)
        .setY((floorTwoRearY + floorThreeY) / 2);
      const landingEnd = corner.clone().addScaledVector(towerTangent, 8);
      const upperEnd = landingEnd.clone()
        .addScaledVector(outward, -18)
        .setY(floorThreeY);
      const floorThreeFront = oval(91, 59, angle).setY(floorThreeY);

      createUpperAisle(root, floorTwoRear, towerEntry,
        `spine-${stairIndex}-tower-entry`, 7.2);
      createUpperAisle(root, towerEntry, corner,
        `spine-${stairIndex}-tower-lower`, 7.2);
      createUpperAisle(root, corner, landingEnd,
        `spine-${stairIndex}-tower-landing`, 7.2);
      createUpperAisle(root, landingEnd, upperEnd,
        `spine-${stairIndex}-tower-upper`, 7.2);
      createUpperAisle(root, upperEnd, floorThreeFront,
        `spine-${stairIndex}-tower-top-bridge`, 8);
      createTierLanding(
        root, floorThreeFront, tangent,
        `spine-${stairIndex}-level-three-landing`,
      );
    });
  }

  function createTierLanding(root, center, tangent, id) {
    const halfSpan = 11;
    createUpperAisle(
      root,
      center.clone().addScaledVector(tangent, -halfSpan),
      center.clone().addScaledVector(tangent, halfSpan),
      id,
      8,
    );

    for (const side of [-1, 1]) {
      const position = center.clone()
        .addScaledVector(tangent, side * (halfSpan - 1.2));
      const height = Math.max(0.8, center.y - UPPER_CONCOURSE_Y);
      box([0.72, height, 0.72], ARENA_COLORS.concreteDark, root, [
        position.x,
        UPPER_CONCOURSE_Y + height / 2,
        position.z,
      ]);
    }
  }

  function addLandingGuard(root, start, end) {
    const direction = end.clone().sub(start);
    const rail = box([0.2, 0.2, direction.length()], ARENA_COLORS.railing, root,
      start.clone().lerp(end, 0.5).add(new THREE.Vector3(0, 3, 0)).toArray());
    rail.rotation.y = Math.atan2(direction.x, direction.z);
    for (let index = 0; index <= 4; index++) {
      const position = start.clone().lerp(end, index / 4);
      box([0.16, 3, 0.16], ARENA_COLORS.railing, root,
        position.add(new THREE.Vector3(0, 1.5, 0)).toArray());
    }
  }

  function createUpperAisle(root, start, end, sectionIndex, width = 6.4) {
    const horizontal = end.clone().sub(start).setY(0);
    const length = horizontal.length();
    const yaw = Math.atan2(horizontal.x, horizontal.z);
    const rise = end.y - start.y;
    const steps = Math.abs(rise) < 0.01
      ? 1
      : Math.max(4, Math.ceil(Math.abs(rise) / 0.48));
    const group = new THREE.Group();
    group.name = 'Upper seating stair aisle ' + sectionIndex;
    group.position.copy(start);
    group.rotation.y = yaw;
    root.add(group);
    addSolidStairBody(group, width, length, rise, steps);
    if (Math.abs(rise) >= 0.01) {
      for (const offset of [-width * 0.3, width * 0.3]) {
        const stringer = box(
          [0.34, 0.42, Math.hypot(length, rise)],
          ARENA_COLORS.concreteDark,
          group,
          [offset, rise / 2 - 0.34, length / 2],
        );
        stringer.rotation.x = -Math.atan2(rise, length);
      }
    }
    // Perpendicular flights consume the sides of a flat connector at each
    // switchback. Do not put a rail across those walking openings.
    for (const side of Math.abs(rise) < 0.01 ? [] : [-1, 1]) {
      const guardLength = Math.max(0.2, Math.hypot(length, rise) - 2.4);
      const curb = box(
        [0.38, 0.85, guardLength],
        ARENA_COLORS.concrete,
        group,
        [side * (width / 2 - 0.19), rise / 2 + 0.3, length / 2],
      );
      curb.rotation.x = -Math.atan2(rise, length);
      const rail = box([0.22, 0.22, guardLength], ARENA_COLORS.railing, group,
        [side * (width / 2 - 0.19), rise / 2 + 3, length / 2]);
      rail.rotation.x = -Math.atan2(rise, length);
      for (const progress of [0.12, 0.31, 0.5, 0.69, 0.88]) {
        box([0.16, 2.35, 0.16], ARENA_COLORS.railing, group,
          [
            side * (width / 2 - 0.19),
            rise * progress + 1.8,
            length * progress,
          ]);
      }
    }
    HD.world.arenaSurfaces.push({
      id: 'upper-stairs-' + sectionIndex,
      stairs: true,
      startPoint: start.clone(),
      endPoint: end.clone(),
      width,
      visualRoot: group,
    });
  }

  function addSolidStairBody(group, width, length, rise, steps) {
    const profile = new THREE.Shape();
    profile.moveTo(0, -0.65);
    profile.lineTo(0, 0);
    for (let step = 0; step < steps; step++) {
      const y = rise * (step + 1) / steps - STAIR_SURFACE_INSET;
      profile.lineTo(-length * step / steps, y);
      profile.lineTo(-length * (step + 1) / steps, y);
      if (steps > 1) {
        box([width - 0.8, 0.045, 0.1], 0xe5e8e5, group,
          [0, y + 0.02, length * step / steps + 0.055]);
      }
    }
    // A solid triangular base ties an elevated flight into the concrete floor
    // below instead of leaving a thin ramp floating in open space.
    profile.lineTo(-length, -0.65);
    profile.closePath();
    const geometry = new THREE.ExtrudeGeometry(profile, {
      depth: width, bevelEnabled: false, steps: 1,
    });
    geometry.rotateY(Math.PI / 2);
    geometry.translate(-width / 2, 0, 0);
    const body = new THREE.Mesh(geometry, HD.util.material(0xa7adae));
    body.name = 'Continuous concrete stair body';
    group.add(body);
  }

  function upperWalkSurfaceAt(x, z, previousY, preferredDirection) {
    let closest = null;
    for (const surface of HD.world.arenaSurfaces || []) {
      let y;
      let priority = 0;
      let alignment = 0;
      if (surface.stairs) {
        const start = surface.startPoint;
        const end = surface.endPoint;
        const dx = end.x - start.x;
        const dz = end.z - start.z;
        const lengthSquared = dx * dx + dz * dz;
        const t = ((x - start.x) * dx + (z - start.z) * dz) / lengthSquared;
        const lateral = Math.abs(dx * (z - start.z) - dz * (x - start.x)) / Math.sqrt(lengthSquared);
        if (t < -0.08 || t > 1.08 || lateral > surface.width / 2 + 0.35) continue;
        y = THREE.MathUtils.lerp(start.y, end.y, THREE.MathUtils.clamp(t, 0, 1));
        // Extended entry tolerance helps the player step onto a staircase,
        // but the physically contained flight must beat a neighboring
        // landing whose tolerance overlaps the same point.
        priority = 1 + (t >= 0 && t <= 1 ? 0.25 : 0);
        if (preferredDirection?.lengthSq?.() > 0.000001) {
          alignment = Math.abs(
            new THREE.Vector2(dx, dz).normalize().dot(
              new THREE.Vector2(preferredDirection.x, preferredDirection.z).normalize(),
            ),
          );
        }
      } else if (surface.bounds) {
        if (x < surface.bounds[0] || x > surface.bounds[1] ||
            z < surface.bounds[2] || z > surface.bounds[3]) continue;
        y = surface.y;
      } else {
        const angle = (Math.atan2(z / surface.outerZ, x / surface.outerX) + Math.PI * 2) % (Math.PI * 2);
        if (angle < surface.start || angle > surface.end) continue;
        if ((x / surface.innerX) ** 2 + (z / surface.innerZ) ** 2 < 1) continue;
        if ((x / surface.outerX) ** 2 + (z / surface.outerZ) ** 2 > 1) continue;
        y = surface.y;
      }
      const difference = Math.abs(y - previousY);
      if (difference > 0.85) continue;
      if (!closest || priority > closest.priority ||
          (priority === closest.priority && alignment > closest.alignment + 0.02) ||
          (priority === closest.priority && Math.abs(alignment - closest.alignment) <= 0.02 &&
            difference < closest.difference)) {
        closest = {
          y,
          zone: surface.stairs ? 'stairs' : surface.id,
          stairs: !!surface.stairs,
          difference,
          priority,
          alignment,
        };
      }
    }
    return closest;
  }

  function addSectionRail(root, radiusX, radiusZ, start, end, y) {
    const points = [];
    const postCount = 8;
    for (let index = 0; index <= postCount; index++) {
      const angle = THREE.MathUtils.lerp(start, end, index / postCount);
      const position = oval(radiusX, radiusZ, angle);
      points.push(position.setY(y + 2.4));
      cylinder(0.07, 0.085, 2.4, ARENA_COLORS.railing, root, [
        position.x,
        y + 1.2,
        position.z,
      ], 7);
    }
    root.add(new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 48, 0.075, 5, false),
      HD.util.material(ARENA_COLORS.railing),
    ));
  }

  function addGrandstandSupports(root, section, radiusX, radiusZ) {
    const supportCount = 1;
    for (let index = 0; index <= supportCount; index++) {
      const angle = THREE.MathUtils.lerp(section.start, section.end, index / supportCount);
      const blocksPublicStair = STAIR_ANGLES.some(stairAngle => {
        return angleDistance(angle, stairAngle) < 0.22;
      });
      if (blocksPublicStair) continue;
      const position = oval(radiusX, radiusZ, angle);
      const height = section.baseY - 0.1;
      cylinder(0.42, 0.52, height, ARENA_COLORS.concreteDark, root, [
        position.x,
        height / 2 - 0.55,
        position.z,
      ], 8);
      HD.world.structuralBarriers.push({
        x: position.x, z: position.z, radius: 0.9,
        minY: -0.55, maxY: section.baseY - 0.65,
      });
      const beam = box([1.2, 0.46, 1.2], ARENA_COLORS.concrete, root, [
        position.x,
        section.baseY - 0.22,
        position.z,
      ]);
      beam.rotation.y = -angle;
    }
  }

  function chooseCrowdThrowerSeats(rows, columns) {
    const candidates = [];
    for (let row = 1; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const angle = column / columns * Math.PI * 2;
        const rx = 82.1 + row * 3.25;
        const rz = 51.85 + row * 2.75;
        const blockedByStairs = STAIR_ANGLES.some((stairAngle) => {
          return angleDistance(angle, stairAngle) <
            stairHalfAngle(rx, rz, stairAngle) + 0.025;
        });
        const playerSeat = DETAILED_SEATS.some((seat) => {
          return seat.row === row && seat.column === column;
        });
        const placement = grandstandSeat(row, column);
        if (!blockedByStairs && !playerSeat && !inCameraBay(row, angle) &&
            !seatingIntersectsStairs(placement.avatar)) {
          candidates.push({ row, column });
        }
      }
    }

    for (let index = candidates.length - 1; index > 0; index--) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [candidates[index], candidates[swapIndex]] = [
        candidates[swapIndex],
        candidates[index],
      ];
    }

    const selected = [];
    for (const candidate of candidates) {
      const angle = candidate.column / columns * Math.PI * 2;
      const separated = selected.every((seat) => {
        const otherAngle = seat.column / columns * Math.PI * 2;
        return angleDistance(angle, otherAngle) > 0.65;
      });
      if (!separated) continue;
      selected.push(candidate);
      if (selected.length === 3) break;
    }
    return selected;
  }

  function createCrowdThrowers(scene, seats, colors) {
    HD.world.crowdThrowers = [];
    seats.forEach((seat, index) => {
      const placement = grandstandSeat(seat.row, seat.column);
      const launchPoint = new THREE.Group();

      launchPoint.position.set(
        placement.avatar.x,
        placement.avatar.y,
        placement.avatar.z,
      );
      launchPoint.rotation.y = placement.yaw;
      launchPoint.userData.ambientThrower = true;
      launchPoint.userData.throwerIndex = index;
      launchPoint.userData.crowdColor =
        colors[(seat.column + seat.row) % colors.length];

      scene.add(launchPoint);
      HD.world.crowdThrowers.push(launchPoint);
    });
  }

  function createCommentatorBooth(root) {
    const halfAngle = COMMENTATOR_HALF_ANGLE;
    const floorY = 7.75;
    const frontRoofY = 14.8;
    const rearRoofY = 13.1;
    const supportBottomY = 5.55;
    const innerLeft = oval(93, 60, COMMENTATOR_ANGLE - halfAngle);
    const innerRight = oval(93, 60, COMMENTATOR_ANGLE + halfAngle);
    const outerLeft = oval(109, 74, COMMENTATOR_ANGLE - halfAngle);
    const outerRight = oval(109, 74, COMMENTATOR_ANGLE + halfAngle);
    const footprint = [innerLeft, outerLeft, outerRight, innerRight];
    const wallColor = 0x29483f;
    const trimColor = 0xd6ae45;
    const floorColor = 0xcab98d;

    createBoothSurface(root, footprint, floorY, floorColor);
    createBoothSurface(root, footprint, supportBottomY, wallColor);
    addCommentatorFoundation(
      root,
      innerLeft,
      innerRight,
      outerLeft,
      outerRight,
      supportBottomY,
      floorY,
    );
    createBoothWall(root, innerLeft, innerRight, floorY - 0.34, floorY, wallColor);
    createBoothWall(root, innerLeft, outerLeft, floorY - 0.34, floorY, wallColor);
    createBoothWall(root, innerRight, outerRight, floorY - 0.34, floorY, wallColor);
    createBoothWall(root, outerLeft, outerRight, floorY - 0.34, floorY, wallColor);

    addCommentatorSideClosures(
      root,
      innerLeft,
      innerRight,
      outerLeft,
      outerRight,
      supportBottomY,
      floorY,
      wallColor,
    );

    const backLeftEnd = outerLeft.clone().lerp(outerRight, 0.3);
    const backRightStart = outerLeft.clone().lerp(outerRight, 0.7);
    createBoothWall(
      root,
      outerLeft,
      backLeftEnd,
      floorY,
      rearRoofY - 0.35,
      wallColor,
    );
    createBoothWall(
      root,
      backRightStart,
      outerRight,
      floorY,
      rearRoofY - 0.35,
      wallColor,
    );
    [backLeftEnd, backRightStart].forEach((doorJamb) => {
      cylinder(
        0.1,
        0.1,
        rearRoofY - floorY - 0.35,
        trimColor,
        root,
        [doorJamb.x, (floorY + rearRoofY - 0.35) / 2, doorJamb.z],
        8,
      );
    });

    const glassMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xa8dce6,
      transparent: true,
      opacity: 0.3,
      roughness: 0.12,
      metalness: 0.03,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    addBoothWindowRun(
      root,
      innerLeft,
      innerRight,
      floorY + 0.92,
      frontRoofY - 0.62,
      5,
      glassMaterial,
    );
    addBoothWindowRun(
      root,
      innerLeft,
      outerLeft,
      floorY + 1.08,
      rearRoofY - 0.62,
      3,
      glassMaterial,
    );
    addBoothWindowRun(
      root,
      innerRight,
      outerRight,
      floorY + 1.08,
      rearRoofY - 0.62,
      3,
      glassMaterial,
    );

    createBoothWall(
      root,
      innerLeft,
      innerRight,
      floorY,
      floorY + 0.92,
      wallColor,
    );
    createBoothWall(
      root,
      innerLeft,
      outerLeft,
      floorY,
      floorY + 1.08,
      wallColor,
    );
    createBoothWall(
      root,
      innerRight,
      outerRight,
      floorY,
      floorY + 1.08,
      wallColor,
    );
    createBoothWall(
      root,
      innerLeft,
      innerRight,
      frontRoofY - 0.62,
      frontRoofY,
      wallColor,
    );
    createBoothWall(
      root,
      innerLeft,
      outerLeft,
      rearRoofY - 0.62,
      rearRoofY,
      wallColor,
    );
    createBoothWall(
      root,
      innerRight,
      outerRight,
      rearRoofY - 0.62,
      rearRoofY,
      wallColor,
    );

    createBoothSideTriangle(
      root,
      innerLeft,
      outerLeft,
      rearRoofY,
      frontRoofY,
      wallColor,
    );
    createBoothSideTriangle(
      root,
      innerRight,
      outerRight,
      rearRoofY,
      frontRoofY,
      wallColor,
    );

    const counterLeft = innerLeft.clone().lerp(outerLeft, 0.23);
    const counterRight = innerRight.clone().lerp(outerRight, 0.23);
    createBoothWall(
      root,
      counterLeft,
      counterRight,
      floorY,
      floorY + 0.94,
      0x60432d,
      0.78,
    );
    createBoothWall(
      root,
      counterLeft,
      counterRight,
      floorY + 0.94,
      floorY + 1.12,
      0xb5854d,
      1.18,
    );
    createBoothWall(
      root,
      counterLeft,
      counterRight,
      floorY + 0.55,
      floorY + 0.68,
      trimColor,
      0.82,
    );

    addCommentatorDeskDetails(root, counterLeft, counterRight, floorY);
    addCommentators(root, innerLeft, innerRight, outerLeft, outerRight, floorY);

    const roofHalfAngle = COMMENTATOR_HALF_ANGLE;
    const roofInnerLeft = oval(91.4, 58.4, COMMENTATOR_ANGLE - roofHalfAngle);
    const roofInnerRight = oval(91.4, 58.4, COMMENTATOR_ANGLE + roofHalfAngle);
    const roofOuterLeft = oval(110.6, 75.6, COMMENTATOR_ANGLE - roofHalfAngle);
    const roofOuterRight = oval(110.6, 75.6, COMMENTATOR_ANGLE + roofHalfAngle);
    const roofFootprint = [
      roofInnerLeft,
      roofOuterLeft,
      roofOuterRight,
      roofInnerRight,
    ];
    const roofOpening = createBoothRoof(
      root,
      roofFootprint,
      frontRoofY,
      rearRoofY,
      0x203c36,
    );
    createBoothWall(
      root,
      roofInnerLeft,
      roofInnerRight,
      frontRoofY - 0.34,
      frontRoofY + 0.12,
      trimColor,
    );
    createSlopedRoofEdge(
      root,
      roofInnerLeft,
      roofOuterLeft,
      frontRoofY,
      rearRoofY,
      wallColor,
    );
    createSlopedRoofEdge(
      root,
      roofInnerRight,
      roofOuterRight,
      frontRoofY,
      rearRoofY,
      wallColor,
    );
    createBoothWall(
      root,
      roofOuterLeft,
      roofOpening.outerLeft,
      rearRoofY - 0.34,
      rearRoofY + 0.12,
      wallColor,
    );
    createBoothWall(
      root,
      roofOpening.outerRight,
      roofOuterRight,
      rearRoofY - 0.34,
      rearRoofY + 0.12,
      wallColor,
    );

    const boothSign = createTextSign("HOTDOG DOWNS BROADCAST", 0xffdc69);
    const signCenter = roofInnerLeft.clone().lerp(roofInnerRight, 0.5);
    const signOffset = signCenter.clone().multiplyScalar(-0.0022);
    boothSign.position.set(
      signCenter.x + signOffset.x,
      frontRoofY - 0.18,
      signCenter.z + signOffset.z,
    );
    boothSign.rotation.y = -Math.atan2(
      roofInnerRight.z - roofInnerLeft.z,
      roofInnerRight.x - roofInnerLeft.x,
    );
    boothSign.scale.set(6.6, 0.68, 1);
    root.add(boothSign);

    const entrance = addCommentatorEntrance(root, floorY);

    HD.world.commentatorBox = {
      polygon: footprint.map((point) => [point.x, point.z]),
      floorY,
      roofY: frontRoofY,
      rearRoofY,
      supportBottomY,
      angle: COMMENTATOR_ANGLE,
      stairHalfAngle: COMMENTATOR_STAIR_HALF_ANGLE,
      entrance,
      desk: {
        start: [counterLeft.x, counterLeft.z],
        end: [counterRight.x, counterRight.z],
      },
    };
  }

  function addCommentatorFoundation(
    root,
    innerLeft,
    innerRight,
    outerLeft,
    outerRight,
    bottomY,
    topY,
  ) {
    const foundationColor = 0x29483f;
    const insetColor = 0x203b35;
    const trimColor = 0xb58b3a;

    createBoothWall(
      root,
      innerLeft,
      innerRight,
      bottomY,
      topY,
      foundationColor,
      0.55,
    );
    createBoothWall(
      root,
      innerLeft,
      outerLeft,
      bottomY,
      topY,
      foundationColor,
      0.55,
    );
    createBoothWall(
      root,
      innerRight,
      outerRight,
      bottomY,
      topY,
      foundationColor,
      0.55,
    );
    createBoothWall(
      root,
      outerLeft,
      outerRight,
      bottomY,
      topY,
      foundationColor,
      0.55,
    );

    const panelBottom = bottomY + 0.42;
    const panelTop = topY - 0.48;
    for (let panel = 0; panel < 4; panel++) {
      const panelStart = innerLeft.clone().lerp(innerRight, panel / 4 + 0.025);
      const panelEnd = innerLeft.clone().lerp(innerRight, (panel + 1) / 4 - 0.025);
      createBoothWall(
        root,
        panelStart,
        panelEnd,
        panelBottom,
        panelTop,
        insetColor,
        0.59,
      );
    }

    for (let divider = 0; divider <= 4; divider++) {
      const point = innerLeft.clone().lerp(innerRight, divider / 4);
      cylinder(
        0.055,
        0.055,
        topY - bottomY,
        trimColor,
        root,
        [point.x, (bottomY + topY) / 2, point.z],
        8,
      );
    }

    createBoothWall(
      root,
      innerLeft,
      innerRight,
      bottomY,
      bottomY + 0.18,
      trimColor,
      0.62,
    );

    const boardCenter = innerLeft.clone().lerp(innerRight, 0.5);
    const boardOffset = boardCenter.clone().multiplyScalar(-0.003);
    const broadcastBoard = createTextSign("LIVE COMMENTARY", 0xffdc69);
    broadcastBoard.position.set(
      boardCenter.x + boardOffset.x,
      (bottomY + topY) / 2,
      boardCenter.z + boardOffset.z,
    );
    broadcastBoard.rotation.y = -Math.atan2(
      innerRight.z - innerLeft.z,
      innerRight.x - innerLeft.x,
    );
    broadcastBoard.scale.set(4.8, 0.62, 1);
    root.add(broadcastBoard);
  }

  function addCommentatorSideClosures(
    root,
    innerLeft,
    innerRight,
    outerLeft,
    outerRight,
    bottomY,
    floorY,
    color,
  ) {
    const outerConcourseLeft = oval(
      110.85,
      75.85,
      COMMENTATOR_ANGLE - COMMENTATOR_HALF_ANGLE,
    );
    const outerConcourseRight = oval(
      110.85,
      75.85,
      COMMENTATOR_ANGLE + COMMENTATOR_HALF_ANGLE,
    );

    createBoothWall(
      root,
      outerLeft,
      outerConcourseLeft,
      bottomY,
      UPPER_CONCOURSE_Y - 0.08,
      color,
      0.42,
    );
    createBoothWall(
      root,
      outerRight,
      outerConcourseRight,
      bottomY,
      UPPER_CONCOURSE_Y - 0.08,
      color,
      0.42,
    );

    const innerApronLeft = innerLeft.clone().lerp(outerLeft, 0.82);
    const innerApronRight = innerRight.clone().lerp(outerRight, 0.82);
    createBoothWall(
      root,
      innerApronLeft,
      outerLeft,
      bottomY,
      floorY - 0.05,
      color,
      0.48,
    );
    createBoothWall(
      root,
      innerApronRight,
      outerRight,
      bottomY,
      floorY - 0.05,
      color,
      0.48,
    );
  }

  function addCommentatorDeskDetails(root, left, right, floorY) {
    const tangent = right.clone().sub(left).normalize();
    const center = left.clone().lerp(right, 0.5);
    const inward = center.clone().multiplyScalar(-1).normalize();
    const deskRotation = -Math.atan2(right.z - left.z, right.x - left.x);

    for (const offset of [-2.15, 2.15]) {
      const monitorPosition = center.clone().addScaledVector(tangent, offset);
      monitorPosition.addScaledVector(inward, -0.12);
      const monitor = box(
        [1.65, 0.95, 0.13],
        0x173643,
        root,
        [monitorPosition.x, floorY + 1.7, monitorPosition.z],
      );
      monitor.rotation.y = deskRotation;
      monitor.material.emissive.setHex(0x2e8eaa);
      monitor.material.emissiveIntensity = 0.85;
      cylinder(
        0.06,
        0.08,
        0.6,
        0x2e3332,
        root,
        [monitorPosition.x, floorY + 1.32, monitorPosition.z],
        8,
      );
    }

    for (const offset of [-1.15, 1.15]) {
      const microphoneBase = center.clone().addScaledVector(tangent, offset);
      const microphoneTop = microphoneBase.clone().addScaledVector(inward, -0.34);
      microphoneBase.y = floorY + 1.13;
      microphoneTop.y = floorY + 1.78;
      createBoothRail(root, microphoneBase, microphoneTop, 0x202625, 0.045);
      sphere(0.12, 0x202625, root, [
        microphoneTop.x,
        microphoneTop.y,
        microphoneTop.z,
      ]);
    }

    const onAirPosition = center.clone().addScaledVector(tangent, 0);
    onAirPosition.addScaledVector(inward, 0.44);
    const onAir = box(
      [2.05, 0.46, 0.09],
      0x831d20,
      root,
      [onAirPosition.x, floorY + 0.59, onAirPosition.z],
    );
    onAir.rotation.y = deskRotation;
    onAir.material.emissive.setHex(0xdd2026);
    onAir.material.emissiveIntensity = 0.95;
  }

  function addBoothWindowRun(
    parent,
    start,
    end,
    bottom,
    top,
    panelCount,
    glassMaterial,
  ) {
    const frameColor = 0x53696d;

    registerProjectileBarrier(start, end, bottom, top, 0.13);

    for (let panel = 0; panel < panelCount; panel++) {
      const startProgress = panel / panelCount + 0.006;
      const endProgress = (panel + 1) / panelCount - 0.006;
      const panelStart = start.clone().lerp(end, startProgress);
      const panelEnd = start.clone().lerp(end, endProgress);
      createBoothWall(parent, panelStart, panelEnd, bottom, top, glassMaterial, 0.09);
    }

    for (let frame = 0; frame <= panelCount; frame++) {
      const point = start.clone().lerp(end, frame / panelCount);
      cylinder(
        0.065,
        0.065,
        top - bottom + 0.2,
        frameColor,
        parent,
        [point.x, (bottom + top) / 2, point.z],
        8,
      );
    }
  }

  function registerProjectileBarrier(start, end, bottom, top, thickness = 0.12) {
    if (!HD.world.projectileBarriers) {
      HD.world.projectileBarriers = [];
    }

    HD.world.projectileBarriers.push({
      start: [start.x, start.z],
      end: [end.x, end.z],
      bottom,
      top,
      thickness,
      material: "glass",
    });
  }

  function createBoothSideTriangle(
    parent,
    inner,
    outer,
    baseY,
    peakY,
    color,
  ) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([
        inner.x, baseY, inner.z,
        inner.x, peakY, inner.z,
        outer.x, baseY, outer.z,
      ], 3),
    );
    geometry.setIndex([0, 1, 2]);
    geometry.computeVertexNormals();

    const triangle = new THREE.Mesh(
      geometry,
      HD.util.material(color, { side: THREE.DoubleSide }),
    );
    triangle.castShadow = true;
    triangle.receiveShadow = true;
    parent.add(triangle);
  }

  function createSlopedRoofEdge(
    parent,
    inner,
    outer,
    innerY,
    outerY,
    color,
  ) {
    const start = new THREE.Vector3(inner.x, innerY, inner.z);
    const end = new THREE.Vector3(outer.x, outerY, outer.z);
    createBoothRail(parent, start, end, color, 0.16);
  }

  function createBoothRoof(parent, footprint, frontRoofY, rearRoofY, color) {
    const [innerLeft, outerLeft, outerRight, innerRight] = footprint;
    const innerCenter = innerLeft.clone().lerp(innerRight, 0.5);
    const outerCenter = outerLeft.clone().lerp(outerRight, 0.5);
    const tangent = innerRight.clone().sub(innerLeft).normalize();
    const openingHalfWidth = 3;
    const openingOuterCenter = outerCenter.clone().lerp(innerCenter, 0.025);
    const openingInnerCenter = outerCenter.clone().lerp(innerCenter, 0.58);
    const openingOuterLeft = openingOuterCenter
      .clone()
      .addScaledVector(tangent, -openingHalfWidth);
    const openingOuterRight = openingOuterCenter
      .clone()
      .addScaledVector(tangent, openingHalfWidth);
    const openingInnerLeft = openingInnerCenter
      .clone()
      .addScaledVector(tangent, -openingHalfWidth);
    const openingInnerRight = openingInnerCenter
      .clone()
      .addScaledVector(tangent, openingHalfWidth);

    [
      [innerLeft, outerLeft, openingOuterLeft, openingInnerLeft],
      [openingInnerRight, openingOuterRight, outerRight, innerRight],
      [innerLeft, openingInnerLeft, openingInnerRight, innerRight],
    ].forEach((panel) => {
      createSlopedBoothSurface(
        parent,
        panel,
        innerCenter,
        outerCenter,
        frontRoofY,
        rearRoofY,
        color,
      );
    });

    const roofHeightAt = (point) => slopedRoofHeight(
      point,
      innerCenter,
      outerCenter,
      frontRoofY,
      rearRoofY,
    );
    createBoothRail(
      parent,
      new THREE.Vector3(
        openingOuterLeft.x,
        roofHeightAt(openingOuterLeft),
        openingOuterLeft.z,
      ),
      new THREE.Vector3(
        openingInnerLeft.x,
        roofHeightAt(openingInnerLeft),
        openingInnerLeft.z,
      ),
      0xd6ae45,
      0.09,
    );
    createBoothRail(
      parent,
      new THREE.Vector3(
        openingInnerRight.x,
        roofHeightAt(openingInnerRight),
        openingInnerRight.z,
      ),
      new THREE.Vector3(
        openingOuterRight.x,
        roofHeightAt(openingOuterRight),
        openingOuterRight.z,
      ),
      0xd6ae45,
      0.09,
    );

    return {
      outerLeft: openingOuterLeft,
      outerRight: openingOuterRight,
      innerLeft: openingInnerLeft,
      innerRight: openingInnerRight,
    };
  }

  function createSlopedBoothSurface(
    parent,
    points,
    innerCenter,
    outerCenter,
    frontRoofY,
    rearRoofY,
    color,
  ) {
    const positions = [];
    points.forEach((point) => {
      positions.push(
        point.x,
        slopedRoofHeight(
          point,
          innerCenter,
          outerCenter,
          frontRoofY,
          rearRoofY,
        ),
        point.z,
      );
    });

    const indices = [];
    for (let index = 1; index < points.length - 1; index++) {
      indices.push(0, index, index + 1);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const surface = new THREE.Mesh(
      geometry,
      HD.util.material(color, { side: THREE.DoubleSide }),
    );
    surface.castShadow = true;
    surface.receiveShadow = true;
    parent.add(surface);
  }

  function slopedRoofHeight(
    point,
    innerCenter,
    outerCenter,
    frontRoofY,
    rearRoofY,
  ) {
    const axis = outerCenter.clone().sub(innerCenter);
    const distanceSquared = axis.lengthSq();
    const offset = point.clone().sub(innerCenter);
    const progress = THREE.MathUtils.clamp(
      offset.dot(axis) / Math.max(0.001, distanceSquared),
      0,
      1,
    );
    return THREE.MathUtils.lerp(frontRoofY, rearRoofY, progress);
  }

  function addCommentators(
    root,
    innerLeft,
    innerRight,
    outerLeft,
    outerRight,
    floorY,
  ) {
    HD.world.commentators = [];

    const innerCenter = innerLeft.clone().lerp(innerRight, 0.5);
    const outerCenter = outerLeft.clone().lerp(outerRight, 0.5);
    const tangent = innerRight.clone().sub(innerLeft).normalize();
    const seatLine = innerCenter.clone().lerp(outerCenter, 0.43);
    const seatRotation = -Math.atan2(
      innerRight.z - innerLeft.z,
      innerRight.x - innerLeft.x,
    );
    const commentatorOptions = [
      {
        color: 0x7a3046,
        skin: 0x8d593d,
        hat: "cap",
        accessory: "headphones",
        expression: "smile",
        variant: 6,
      },
      {
        color: 0x315f82,
        skin: 0xe0aa7d,
        hat: "beanie",
        expression: "neutral",
        variant: 3,
      },
    ];

    commentatorOptions.forEach((options, index) => {
      const offset = index === 0 ? -1.65 : 1.65;
      const seatPosition = seatLine.clone().addScaledVector(tangent, offset);
      const chairBackPosition = seatPosition.clone().addScaledVector(
        outerCenter.clone().sub(innerCenter).normalize(),
        0.42,
      );
      const seat = box(
        [1.15, 0.18, 1.05],
        0x273836,
        root,
        [seatPosition.x, floorY + 0.72, seatPosition.z],
      );
      seat.rotation.y = seatRotation;
      const chairBack = box(
        [1.15, 1.18, 0.18],
        0x273836,
        root,
        [chairBackPosition.x, floorY + 1.25, chairBackPosition.z],
      );
      chairBack.rotation.y = seatRotation;
      cylinder(0.09, 0.11, 0.7, 0x273836, root, [
        seatPosition.x,
        floorY + 0.35,
        seatPosition.z,
      ], 8);

      const commentator = HD.Models.playerCharacter(options.color, options);
      HD.Models.setPlayerStanding(commentator, false);
      commentator.position.set(seatPosition.x, floorY + 0.45, seatPosition.z);
      commentator.rotation.y = -COMMENTATOR_ANGLE + Math.PI / 2;
      commentator.scale.setScalar(0.68);
      commentator.userData.activity = "watch";
      root.add(commentator);
      HD.world.commentators.push(commentator);
    });
  }

  function addCommentatorEntrance(root, floorY) {
    const stepCount = 16;
    const stairWidth = 5.4;
    const upperCenter = oval(114.15, 78.05, COMMENTATOR_ANGLE);
    const lowerCenter = oval(102.2, 67.8, COMMENTATOR_ANGLE);
    const pathLength = upperCenter.distanceTo(lowerCenter);
    const stepDepth = pathLength / (stepCount - 1) + 0.16;
    const tangent = new THREE.Vector3(
      -Math.sin(COMMENTATOR_ANGLE),
      0,
      Math.cos(COMMENTATOR_ANGLE),
    ).normalize();

    for (let step = 0; step < stepCount; step++) {
      const progress = step / (stepCount - 1);
      const center = upperCenter.clone().lerp(lowerCenter, progress);
      const surfaceY = THREE.MathUtils.lerp(
        UPPER_CONCOURSE_Y - STAIR_SURFACE_INSET,
        floorY + 0.1,
        progress,
      );
      const height = Math.max(0.2, surfaceY - floorY);
      const accessStep = box(
        [stairWidth, height, stepDepth],
        step % 2 ? 0xb9a67e : 0xcab98d,
        root,
        [center.x, floorY + height / 2, center.z],
      );
      accessStep.rotation.y = -COMMENTATOR_ANGLE + Math.PI / 2;
    }

    for (const side of [-1, 1]) {
      const upperRail = upperCenter
        .clone()
        .addScaledVector(tangent, side * stairWidth / 2);
      const lowerRail = lowerCenter
        .clone()
        .addScaledVector(tangent, side * stairWidth / 2);
      upperRail.y = 14.45;
      lowerRail.y = floorY + 1.05;
      createBoothRail(root, upperRail, lowerRail, 0x526970, 0.075);

      for (const progress of [0, 0.33, 0.66, 1]) {
        const post = upperCenter.clone().lerp(lowerCenter, progress);
        post.addScaledVector(tangent, side * stairWidth / 2);
        const surfaceY = THREE.MathUtils.lerp(
          UPPER_CONCOURSE_Y - STAIR_SURFACE_INSET,
          floorY + 0.1,
          progress,
        );
        cylinder(
          0.065,
          0.075,
          1.8,
          0x526970,
          root,
          [post.x, surfaceY + 0.9, post.z],
          8,
        );
      }
    }

    addCommentatorStairSkirts(
      root,
      upperCenter,
      lowerCenter,
      tangent,
      stairWidth,
      floorY,
    );

    return {
      top: [upperCenter.x, upperCenter.z],
      bottom: [lowerCenter.x, lowerCenter.z],
      width: stairWidth,
      topY: UPPER_CONCOURSE_Y - STAIR_SURFACE_INSET,
      bottomY: floorY + 0.1,
    };
  }

  function addCommentatorStairSkirts(
    root,
    upperCenter,
    lowerCenter,
    tangent,
    width,
    floorY,
  ) {
    const material = HD.util.material(0x29483f, {
      side: THREE.DoubleSide,
    });

    for (const side of [-1, 1]) {
      const upper = upperCenter
        .clone()
        .addScaledVector(tangent, side * width / 2);
      const lower = lowerCenter
        .clone()
        .addScaledVector(tangent, side * width / 2);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute([
          upper.x, floorY, upper.z,
          upper.x, UPPER_CONCOURSE_Y - STAIR_SURFACE_INSET, upper.z,
          lower.x, floorY + 0.1, lower.z,
          lower.x, floorY, lower.z,
        ], 3),
      );
      geometry.setIndex([0, 1, 2, 0, 2, 3]);
      geometry.computeVertexNormals();

      const skirt = new THREE.Mesh(geometry, material);
      skirt.castShadow = true;
      skirt.receiveShadow = true;
      root.add(skirt);
    }

    const upperLeft = upperCenter
      .clone()
      .addScaledVector(tangent, -width / 2);
    const upperRight = upperCenter
      .clone()
      .addScaledVector(tangent, width / 2);
    createBoothWall(
      root,
      upperLeft,
      upperRight,
      floorY,
      UPPER_CONCOURSE_Y - STAIR_SURFACE_INSET,
      material,
      0.18,
    );
  }

  function createBoothRail(parent, start, end, color, radius) {
    const direction = end.clone().sub(start);
    const length = direction.length();
    const rail = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, length, 8),
      HD.util.material(color),
    );
    rail.position.copy(start).add(end).multiplyScalar(0.5);
    rail.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.normalize(),
    );
    rail.castShadow = true;
    parent.add(rail);
  }

  function createBoothSurface(parent, points, y, color) {
    const shape = new THREE.Shape();
    points.forEach((point, index) => {
      if (index === 0) shape.moveTo(point.x, point.z);
      else shape.lineTo(point.x, point.z);
    });
    shape.closePath();
    const surface = new THREE.Mesh(
      new THREE.ShapeGeometry(shape),
      HD.util.material(color, { side: THREE.DoubleSide }),
    );
    surface.geometry.rotateX(Math.PI / 2);
    surface.position.y = y;
    surface.receiveShadow = true;
    parent.add(surface);
  }

  function createBoothWall(parent, start, end, bottom, top, material, thickness = 0.35) {
    const length = start.distanceTo(end);
    const wallMaterial = material?.isMaterial ? material : HD.util.material(material);
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(length, top - bottom, thickness),
      wallMaterial,
    );
    wall.position.copy(start).add(end).multiplyScalar(0.5);
    wall.position.y = (bottom + top) / 2;
    wall.rotation.y = -Math.atan2(end.z - start.z, end.x - start.x);
    wall.castShadow = true;
    wall.receiveShadow = true;
    parent.add(wall);
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

  function angleDistance(first, second) {
    const difference = Math.abs(first - second) % (Math.PI * 2);
    return Math.min(difference, Math.PI * 2 - difference);
  }

  function upperPropPositionIsClear(angle) {
    const clearsStairs = STAIR_ANGLES.every((stairAngle) => {
      return angleDistance(angle, stairAngle) > 0.14;
    });
    const clearsFacilities = CONCOURSE_FACILITIES.every((facility) => {
      return angleDistance(angle, facility.angle) > 0.09;
    });
    const clearsFixer = angleDistance(angle, FIXER_ANGLE) > 0.18;
    return clearsStairs && clearsFacilities && clearsFixer;
  }

  function addTierRing(root, row) {
    const innerX = 80.5 + row * 3.25;
    const innerZ = 50.5 + row * 2.75;
    const outerX = innerX + 3.25;
    const outerZ = innerZ + 2.75;
    const tierTop = HD.CONFIG.grandstandBaseHeight + row * 1.5;
    const color = row % 2 ? 0xb7bcbb : ARENA_COLORS.concrete;

    createTierSegments(root, outerX, outerZ, innerX, innerZ, tierTop, color, row);
  }

  function createTierSegments(root, outerX, outerZ, innerX, innerZ, height, color, row) {
    const sortedAngles = [...STAIR_ANGLES].sort((first, second) => first - second);
    const middleX = (outerX + innerX) / 2;
    const middleZ = (outerZ + innerZ) / 2;

    for (let index = 0; index < sortedAngles.length; index++) {
      const current = sortedAngles[index];
      const next = sortedAngles[(index + 1) % sortedAngles.length];
      const start = current + stairHalfAngle(middleX, middleZ, current);
      const nextAngle = index === sortedAngles.length - 1 ? next + Math.PI * 2 : next;
      const end = nextAngle - stairHalfAngle(middleX, middleZ, next);
      createSolidOvalSegment(
        root,
        outerX,
        outerZ,
        innerX,
        innerZ,
        height,
        color,
        start,
        end,
      );
      addTierFasciaSegment(root, outerX, outerZ, height, row, start, end);
    }
  }

  function stairHalfAngle(rx, rz, angle) {
    const tangentX = rx * Math.sin(angle);
    const tangentZ = rz * Math.cos(angle);
    const distancePerRadian = Math.sqrt(tangentX * tangentX + tangentZ * tangentZ);
    const aisleHalfWidth = HD.CONFIG.stairs.width / 2 + 0.04;
    return aisleHalfWidth / distancePerRadian;
  }

  function createSolidOvalSegment(
    root,
    outerX,
    outerZ,
    innerX,
    innerZ,
    height,
    color,
    start,
    end,
    segmentCount = 48,
    foundationBottom = -0.55,
  ) {
    const shape = new THREE.Shape();

    for (let index = 0; index <= segmentCount; index++) {
      const angle = THREE.MathUtils.lerp(start, end, index / segmentCount);
      const x = Math.cos(angle) * outerX;
      const z = -Math.sin(angle) * outerZ;
      if (index === 0) shape.moveTo(x, z);
      else shape.lineTo(x, z);
    }

    for (let index = segmentCount; index >= 0; index--) {
      const angle = THREE.MathUtils.lerp(start, end, index / segmentCount);
      shape.lineTo(Math.cos(angle) * innerX, -Math.sin(angle) * innerZ);
    }
    shape.closePath();

    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: height - foundationBottom,
      bevelEnabled: false,
      steps: 1,
    });
    geometry.rotateX(-Math.PI / 2);

    const section = new THREE.Mesh(geometry, HD.util.material(color));
    section.position.y = foundationBottom;
    section.castShadow = false;
    section.receiveShadow = true;
    root.add(section);
    return section;
  }

  function addTierFasciaSegment(root, rx, rz, height, row, start, end) {
    const points = [];

    for (let index = 0; index <= 18; index++) {
      const angle = THREE.MathUtils.lerp(start, end, index / 18);
      points.push(oval(rx - 0.08, rz - 0.08, angle).setY(height + 0.04));
    }

    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color: row % 2 ? 0xd2c29d : 0xb9aa89 }),
    );
    root.add(line);
  }

  function createSingleBowlCanopy(root) {
    const canopy = new THREE.Group();
    canopy.name = 'Single-bowl stadium canopy';
    root.add(canopy);

    const screenClearance = 0.19;
    const spans = [
      [0, REPLAY_ANGLE - screenClearance],
      [REPLAY_ANGLE + screenClearance, Math.PI * 2],
    ];

    spans.forEach(([start, end], spanIndex) => {
      const segmentCount = Math.max(10, Math.ceil((end - start) * 18));
      const positions = [];
      const indices = [];

      for (let index = 0; index <= segmentCount; index++) {
        const angle = THREE.MathUtils.lerp(start, end, index / segmentCount);
        const outer = oval(121, 84, angle);
        const inner = oval(91.5, 59.5, angle);
        positions.push(
          outer.x, 24.8, outer.z,
          inner.x, 27.4, inner.z,
        );
        if (index < segmentCount) {
          const vertex = index * 2;
          indices.push(
            vertex, vertex + 2, vertex + 1,
            vertex + 2, vertex + 3, vertex + 1,
          );
        }
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(positions, 3),
      );
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      const panel = new THREE.Mesh(
        geometry,
        HD.util.material(0x2d4e63, {
          metalness: 0.16,
          roughness: 0.44,
          side: THREE.DoubleSide,
        }),
      );
      panel.name = `Single-bowl roof span ${spanIndex + 1}`;
      panel.receiveShadow = true;
      canopy.add(panel);
    });

    for (let index = 0; index < 16; index++) {
      const angle = index / 16 * Math.PI * 2 + Math.PI / 16;
      const blocksStair = STAIR_ANGLES.some(stairAngle => {
        return angleDistance(angle, stairAngle) < 0.16;
      });
      if (blocksStair || angleDistance(angle, REPLAY_ANGLE) < 0.24) continue;
      const position = oval(117.5, 80.5, angle);
      cylinder(0.32, 0.44, 11.3, 0x4c5a5d, canopy, [
        position.x,
        19.15,
        position.z,
      ], 10);
    }

    const lightMaterial = new THREE.MeshStandardMaterial({
      color: 0xffe8a8,
      emissive: 0xffc84d,
      emissiveIntensity: 1.5,
      roughness: 0.35,
    });
    const lights = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      lightMaterial,
      24,
    );
    const dummy = new THREE.Object3D();
    for (let index = 0; index < 24; index++) {
      const angle = (index + 0.5) / 24 * Math.PI * 2;
      const position = oval(99, 66, angle);
      dummy.position.set(position.x, 26.75, position.z);
      dummy.rotation.set(0, -angle, 0);
      dummy.scale.set(3.1, 0.12, 0.48);
      dummy.updateMatrix();
      lights.setMatrixAt(index, dummy.matrix);
    }
    lights.instanceMatrix.needsUpdate = true;
    canopy.add(lights);
  }

  function createOvalCanopy(root) {
    const roofSections = ELEVATED_SEATING.filter((section) => section.floor === 3);
    roofSections.forEach((section, index) => {
      createGrandstandRoofPanel(root, section, index);
    });
    createCanopyLighting(root, roofSections);
    createRoofSpeakers(root, roofSections);
  }

  function createGrandstandRoofPanel(root, section, sectionIndex) {
    const outerX = 119;
    const outerZ = 83;
    const innerX = 90;
    const innerZ = 58.6;
    // Highest deck is 21.56; preserve standing-player clearance underneath.
    const outerHeight = 42.4;
    const innerHeight = 44.4;
    const segments = 48;
    const positions = [];
    const indices = [];

    for (let index = 0; index <= segments; index++) {
      const angle = THREE.MathUtils.lerp(section.start - 0.08, section.end + 0.08, index / segments);
      positions.push(
        Math.cos(angle) * outerX,
        outerHeight,
        Math.sin(angle) * outerZ,
        Math.cos(angle) * innerX,
        innerHeight,
        Math.sin(angle) * innerZ,
      );

      if (index < segments) {
        const outer = index * 2;
        indices.push(outer, outer + 2, outer + 1, outer + 2, outer + 3, outer + 1);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const material = HD.util.material(0x2d4e63, {
      metalness: 0.16,
      roughness: 0.42,
      side: THREE.DoubleSide,
    });
    const canopy = new THREE.Mesh(geometry, material);
    canopy.name = `Covered third-floor grandstand ${sectionIndex + 1}`;
    canopy.receiveShadow = true;
    root.add(canopy);

    const trim = [];
    for (let index = 0; index <= segments; index++) {
      const angle = THREE.MathUtils.lerp(section.start - 0.08, section.end + 0.08, index / segments);
      trim.push(oval(innerX, innerZ, angle).setY(innerHeight + 0.04));
    }
    root.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(trim),
      new THREE.LineBasicMaterial({ color: 0xf0c95d }),
    ));

    const supportBaseY = 13.5;
    for (let index = 0; index <= 4; index++) {
      const angle = THREE.MathUtils.lerp(section.start, section.end, index / 4);
      const blocksPublicStair = STAIR_ANGLES.some(stairAngle => {
        return angleDistance(angle, stairAngle) < 0.22;
      });
      if (blocksPublicStair) continue;
      const outer = oval(outerX - 0.9, outerZ - 0.9, angle);
      const supportHeight = outerHeight - supportBaseY;
      cylinder(0.3, 0.42, supportHeight, 0x4c5a5d, root, [
        outer.x,
        supportBaseY + supportHeight / 2,
        outer.z,
      ], 10);
      const brace = cylinder(0.11, 0.11, 7.5, 0x4c5a5d, root, [outer.x, 38, outer.z], 8);
      brace.rotation.z = Math.sin(angle) * 0.34;
    }
  }

  function createRoofGlassWall(root, radiusX, radiusZ, baseY, roofHeight) {
    createCurvedGlassRail(
      root,
      radiusX - 0.25,
      radiusZ - 0.25,
      baseY,
      roofHeight - baseY,
      96,
    );
  }

  function createCanopyLighting(root, sections) {
    const lightCount = sections.length * 9;
    const material = new THREE.MeshStandardMaterial({
      color: 0xffe7a0,
      emissive: 0xffc84d,
      emissiveIntensity: 1.8,
      roughness: 0.35,
    });
    const lights = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      material,
      lightCount,
    );
    const dummy = new THREE.Object3D();

    for (let index = 0; index < lightCount; index++) {
      const section = sections[Math.floor(index / 9)];
      const angle = THREE.MathUtils.lerp(section.start, section.end, (index % 9 + 0.5) / 9);
      const position = oval(98, 65, angle);
      dummy.position.set(position.x, 43.7, position.z);
      dummy.rotation.set(0, -angle, 0);
      dummy.scale.set(3.4, 0.12, 0.5);
      dummy.updateMatrix();
      lights.setMatrixAt(index, dummy.matrix);
    }

    lights.instanceMatrix.needsUpdate = true;
    lights.castShadow = false;
    root.add(lights);

    sections.forEach((section) => {
      for (let index = 0; index < 4; index++) {
      const angle = THREE.MathUtils.lerp(section.start, section.end, (index + 0.5) / 4);
      const position = oval(92, 60, angle);
      const fixture = new THREE.Group();
      fixture.position.set(position.x, 44, position.z);
      fixture.lookAt(0, 2, 0);
      root.add(fixture);
      cylinder(0.16, 0.2, 1.4, 0x30383a, fixture, [0, 0, 0], 10)
        .rotation.x = Math.PI / 2;
      const lamp = mesh(
        new THREE.ConeGeometry(0.48, 0.8, 12, 1, true),
        0xf7df91,
        fixture,
        [0, 0, -0.78],
        { emissive: 0xffc94f, emissiveIntensity: 1.2, side: THREE.DoubleSide },
      );
      lamp.rotation.x = -Math.PI / 2;
      }
    });
  }

  function createRoofSpeakers(root, sections) {
    const angles = sections.map((section) => (section.start + section.end) / 2);
    angles.forEach((angle) => {
      const position = oval(106, 71, angle);
      const tower = new THREE.Group();
      tower.position.set(position.x, 13.5, position.z);
      tower.rotation.y = -angle + Math.PI / 2;
      root.add(tower);
      cylinder(0.14, 0.2, 8.2, 0x4a5558, tower, [0, 4.1, 0], 10);
      [-0.7, 0.7].forEach((x) => {
        const speaker = box([1.05, 1.45, 0.85], 0x252b2d, tower, [x, 7.65, -0.22]);
        speaker.rotation.x = -0.2;
        cylinder(0.32, 0.38, 0.08, 0x111516, speaker, [0, 0, -0.45], 16)
          .rotation.x = Math.PI / 2;
      });
    });
  }
  function createInfield(scene) {
    createRaceBoard(scene);
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2,
        p = oval(30, 10, angle);
      cylinder(0.18, 0.28, 2, 0x765034, scene, [p.x, 1, p.z]);
      cylinder(0.12, 1.55, 3.8, 0x2f7d3e, scene, [p.x, 3.1, p.z], 10);
    }
  }

  function createDetailedInfieldGrass(scene) {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext("2d");
    context.fillStyle = "#4f9147";
    context.fillRect(0, 0, 256, 256);

    for (let stripe = 0; stripe < 16; stripe++) {
      context.fillStyle = stripe % 2 ? "#579c4e" : "#478942";
      context.fillRect(stripe * 16, 0, 16, 256);
    }
    for (let speck = 0; speck < 560; speck++) {
      const x = (speck * 73) % 256;
      const y = (speck * 151) % 256;
      context.fillStyle = speck % 3 ? "#6bab58" : "#39783a";
      context.fillRect(x, y, 1, 3);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(3.5, 1.8);
    const field = new THREE.Mesh(
      new THREE.CircleGeometry(1, 72),
      new THREE.MeshStandardMaterial({ map: texture, roughness: 0.92 }),
    );
    field.rotation.x = -Math.PI / 2;
    field.scale.set(48.8, 21.8, 1);
    field.position.y = 0.08;
    field.receiveShadow = true;
    scene.add(field);

    const tufts = new THREE.InstancedMesh(
      new THREE.ConeGeometry(0.09, 0.34, 4),
      HD.util.material(0x73ad55),
      120,
    );
    const dummy = new THREE.Object3D();
    for (let index = 0; index < 120; index++) {
      const angle = index * 2.399963;
      const radius = 0.2 + ((index * 37) % 79) / 100;
      const x = Math.cos(angle) * 44 * radius;
      const z = Math.sin(angle) * 18 * radius;
      dummy.position.set(x, 0.25, z);
      dummy.rotation.y = angle;
      dummy.scale.setScalar(0.7 + (index % 5) * 0.08);
      dummy.updateMatrix();
      tufts.setMatrixAt(index, dummy.matrix);
    }
    tufts.instanceMatrix.needsUpdate = true;
    tufts.castShadow = false;
    scene.add(tufts);
  }

  function createRaceBoard(scene) {
    const root = new THREE.Group();
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 512;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;

    scene.add(root);
    box([22.5, 11.5, 0.9], 0x15271f, root, [0, 10.2, 0]);
    box([23.5, 0.65, 1.35], 0xf0bd3b, root, [0, 16.1, 0]);
    box([23.5, 0.65, 1.35], 0xf0bd3b, root, [0, 4.3, 0]);
    cylinder(0.45, 0.62, 4.8, 0xd5c49b, root, [-9.5, 1.85, 0], 10);
    cylinder(0.45, 0.62, 4.8, 0xd5c49b, root, [9.5, 1.85, 0], 10);

    const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
    const front = new THREE.Mesh(new THREE.PlaneGeometry(21.2, 10.2), material);
    front.position.set(0, 10.2, 0.48);
    root.add(front);

    const back = new THREE.Mesh(new THREE.PlaneGeometry(21.2, 10.2), material.clone());
    back.position.set(0, 10.2, -0.48);
    back.rotation.y = Math.PI;
    root.add(back);

    for (const x of [-10.2, -6.8, 6.8, 10.2]) {
      sphere(0.28, 0xffefb0, root, [x, 16.85, 0.15]);
    }

    HD.world.raceBoard = {
      canvas,
      context: canvas.getContext("2d"),
      texture,
      lastUpdate: -1,
    };
    drawRaceBoard();
  }

  function drawRaceBoard() {
    const board = HD.world.raceBoard;
    if (!board) return;

    const { canvas, context } = board;
    const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, "#10271e");
    gradient.addColorStop(1, "#07130f");
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#f0bd3b";
    context.fillRect(0, 0, canvas.width, 72);
    context.fillStyle = "#10271e";
    context.font = "900 34px sans-serif";
    context.textAlign = "left";
    context.fillText("HOTDOG DOWNS - LIVE RUNNING ORDER", 34, 48);

    if (!HD.state.horses.length) {
      context.fillStyle = "#e8e1ca";
      context.font = "700 44px sans-serif";
      context.fillText("FIELD LOADING...", 34, 145);
      board.texture.needsUpdate = true;
      return;
    }

    const order = [...HD.state.horses].sort(compareRacePosition);
    const leaderProgress = order[0].userData.data.progress;
    order.forEach((horse, index) => {
      const data = horse.userData.data;
      const y = 105 + index * 49;
      const color = `#${data.color.toString(16).padStart(6, "0")}`;
      const lap = Math.min(HD.CONFIG.raceLaps, Math.floor(Math.max(0, data.progress)) + 1);
      const lengthsBehind = Math.max(0, Math.round((leaderProgress - data.progress) * 65));
      const interval = index === 0 ? "LEADER" : `+${lengthsBehind} LENGTHS`;

      context.fillStyle = index % 2 ? "#173328" : "#1d3d30";
      context.fillRect(22, y - 30, 980, 42);
      context.fillStyle = color;
      context.fillRect(22, y - 30, 12, 42);
      context.fillStyle = "#ffffff";
      context.font = "900 26px sans-serif";
      context.fillText(`${index + 1}`, 52, y);
      context.font = "800 22px sans-serif";
      context.fillText(`#${HD.horseNumber(data)}  ${data.name}`, 105, y);
      context.fillStyle = "#bdd1c2";
      context.font = "700 19px sans-serif";
      context.fillText(`LAP ${lap}/${HD.CONFIG.raceLaps}`, 610, y);
      context.textAlign = "right";
      context.fillStyle = index === 0 ? "#f0bd3b" : "#e8e1ca";
      context.fillText(interval, 972, y);
      context.textAlign = "left";
    });

    board.texture.needsUpdate = true;
  }

  function compareRacePosition(first, second) {
    const firstData = first.userData.data;
    const secondData = second.userData.data;
    if (firstData.finished && secondData.finished) return firstData.place - secondData.place;
    if (firstData.finished) return -1;
    if (secondData.finished) return 1;
    return secondData.progress - firstData.progress;
  }
  function createNearbyPlayers(scene) {
    HD.world.players = [];
    const nearbySeats = DETAILED_SEATS
      .filter((seat) => !seat.local);

    nearbySeats.forEach((seat, index) => {
      const placement = grandstandSeat(seat.row, seat.column);
      const colorIndex = (index + 1) % HD.CONFIG.playerColors.length;
      const playerColor = HD.CONFIG.playerColors[colorIndex];
      // Reserved human seats stay empty until a real network player joins.
      createChair(scene, placement, ARENA_COLORS.lowerSeats);
    });

    createLocalPlayer(scene);
  }

  function createSimplePlayer(scene, placement, color, variant) {
    const root = new THREE.Group();
    root.position.copy(placement.avatar);
    root.rotation.y = placement.yaw;
    root.userData.staticPlaceholder = true;
    root.userData.name = `Player ${variant + 1}`;
    scene.add(root);

    const torso = cylinder(0.3, 0.46, 1.2, color, root, [0, 1.25, 0], 6);
    const skinColors = [0xf1c7a5, 0xc88962, 0x8d593d, 0xe0aa82, 0x6e432f];
    sphere(0.36, skinColors[variant % skinColors.length], root, [0, 2.15, 0]);
    for (const side of [-1, 1]) {
      const arm = cylinder(0.1, 0.13, 0.95, color, root, [side * 0.48, 1.2, -0.25], 6);
      arm.rotation.x = 0.7;
      arm.rotation.z = side * -0.12;
    }
    root.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = false;
      object.receiveShadow = true;
    });
    root.userData.torso = torso;
    HD.world.players.push(root);
  }

  // ---------------------------------------------------------------------------
  // Player seating, walkways, stairs, and physical shops
  // ---------------------------------------------------------------------------


  function createLocalPlayer(scene) {
    const seat = DETAILED_SEATS.find((candidate) => candidate.local);
    const placement = grandstandSeat(seat.row, seat.column);
    applyLocalSeatPlacement(placement);

    const player = HD.Models.playerCharacter(HD.CONFIG.playerColors[0], {
      variant: 7,
      activity: "watch",
      ...HD.Settings.avatarOptions(),
    });
    player.position.copy(HD.CONFIG.playerSeatRoot);
    player.rotation.y = placement.yaw;
    player.userData.name = "Player 1";
    player.userData.isLocalPlayer = true;
    player.userData.networkId = "local-player";
    HD.Models.setPlayerStanding(player, true);
    player.traverse((object) => object.layers.set(2));
    scene.add(player);

    createChair(scene, placement, ARENA_COLORS.lowerSeats);
    HD.world.localPlayer = player;
    HD.world.playerEntities = [player, ...HD.world.players];
  }

  function assignLocalSeat(seatIndex) {
    const placement = playerSeatPlacement(seatIndex);
    applyLocalSeatPlacement(placement);

    if (HD.world.localPlayer) {
      HD.world.localPlayer.position.copy(placement.avatar);
      HD.world.localPlayer.rotation.y = placement.yaw;
      HD.world.localPlayer.userData.seatIndex = seatIndex;
      HD.Models.setPlayerColor(
        HD.world.localPlayer,
        HD.CONFIG.playerColors[seatIndex % HD.CONFIG.playerColors.length],
      );
      const preview = document.querySelector("#lobby-avatar");
      if (preview) {
        const color = HD.CONFIG.playerColors[seatIndex % HD.CONFIG.playerColors.length]
          .toString(16)
          .padStart(6, "0");
        preview.style.setProperty("--avatar-color", `#${color}`);
      }
    }
    if (HD.world.camera) HD.world.camera.position.copy(HD.CONFIG.seat);
    return placement;
  }

  function refreshLocalPlayer() {
    const previous = HD.world.localPlayer;
    if (!previous || !HD.world.scene) return;
    const seatIndex = previous.userData.seatIndex || 0;
    const replacement = HD.Models.playerCharacter(
      HD.CONFIG.playerColors[seatIndex % HD.CONFIG.playerColors.length],
      {
        variant: seatIndex,
        activity: previous.userData.activity || "watch",
        ...HD.Settings.avatarOptions(),
      },
    );
    replacement.position.copy(previous.position);
    replacement.rotation.copy(previous.rotation);
    replacement.userData.name = previous.userData.name;
    replacement.userData.isLocalPlayer = true;
    replacement.userData.networkId = previous.userData.networkId;
    replacement.userData.seatIndex = seatIndex;
    HD.Models.setPlayerStanding(replacement, HD.state.standing);
    replacement.traverse((object) => object.layers.set(2));
    HD.world.scene.remove(previous);
    HD.world.scene.add(replacement);
    HD.world.localPlayer = replacement;
    HD.world.playerEntities = [replacement, ...(HD.world.players || [])];
  }

  function playerSeatPlacement(seatIndex) {
    const seat = DETAILED_SEATS[seatIndex % DETAILED_SEATS.length];
    return grandstandSeat(seat.row, seat.column);
  }

  function applyLocalSeatPlacement(placement) {
    HD.CONFIG.playerSeatRoot.copy(placement.avatar);
    HD.CONFIG.playerSeatYaw = placement.yaw;
    HD.CONFIG.seat
      .copy(placement.avatar)
      .setY(placement.avatar.y + HD.CONFIG.characterEyeOffset);
    HD.state.playerPosition.copy(HD.CONFIG.seat);
    HD.state.yaw = placement.yaw;
  }

  function grandstandSeat(row, column) {
    const angle = (column / GRANDSTAND_COLUMNS) * Math.PI * 2;
    const position = oval(82.1 + row * 3.25, 51.85 + row * 2.75, angle);
    const tierTop = HD.CONFIG.grandstandBaseHeight + row * 1.5;
    return {
      angle,
      yaw: -angle + Math.PI / 2,
      tierTop,
      position,
      avatar: new THREE.Vector3(position.x, tierTop + 1.25, position.z),
    };
  }

  function createSeatGeometry(back) {
    const outline = new THREE.Shape();
    const height = back ? SEAT.backHeight : SEAT.depth;
    roundedRectangle(outline, -SEAT.width / 2, -height / 2, SEAT.width, height, 0.16);
    const geometry = new THREE.ExtrudeGeometry(outline, {
      depth: 0.18, bevelEnabled: true, bevelSize: 0.035,
      bevelThickness: 0.035, bevelSegments: 1, curveSegments: 3, steps: 1,
    });
    geometry.translate(0, 0, -0.09);
    if (!back) geometry.rotateX(-Math.PI / 2);
    geometry.userData.seatCushion = !back;
    return geometry;
  }

  function seatingIntersectsStairs(position) {
    return (HD.world.arenaSurfaces || []).some(route => {
      if (!route.stairs) return false;
      const dx = route.endPoint.x - route.startPoint.x;
      const dz = route.endPoint.z - route.startPoint.z;
      const lengthSquared = dx * dx + dz * dz;
      const t = ((position.x - route.startPoint.x) * dx +
        (position.z - route.startPoint.z) * dz) / lengthSquared;
      if (t < -0.08 || t > 1.08) return false;
      const lateral = Math.abs(dx * (position.z - route.startPoint.z) -
        dz * (position.x - route.startPoint.x)) / Math.sqrt(lengthSquared);
      const stairY = THREE.MathUtils.lerp(route.startPoint.y, route.endPoint.y,
        THREE.MathUtils.clamp(t, 0, 1));
      return lateral < route.width / 2 + 1.3 &&
        position.y > stairY - 4.8 && position.y < stairY + 4.8;
    });
  }

  function clearSeatingFromStairs(scene) {
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
    scene.traverse(batch => {
      if (!batch.isInstancedMesh || !batch.userData.stadiumSeating) return;
      for (let index = 0; index < batch.count; index++) {
        batch.getMatrixAt(index, matrix);
        position.setFromMatrixPosition(matrix);
        const nearSupport = (HD.world.structuralBarriers || []).some(barrier => {
          if (!barrier.radius) return false;
          if (position.y < barrier.minY - 4 || position.y > barrier.maxY + 4) return false;
          return Math.hypot(position.x - barrier.x, position.z - barrier.z) < barrier.radius + 1.2;
        });
        if (nearSupport || seatingIntersectsStairs(position)) batch.setMatrixAt(index, hidden);
      }
      batch.instanceMatrix.needsUpdate = true;
      batch.computeBoundingSphere();
    });
    HD.world.crowdThrowers.forEach(thrower => thrower.removeFromParent());
    const colors = [0xd94f31, 0x447fc1, 0xf0bd3b, 0x7e59a4, 0x3d8951, 0xd97d35];
    createCrowdThrowers(scene, chooseCrowdThrowerSeats(7, GRANDSTAND_COLUMNS)
      .filter(seat => !seatingIntersectsStairs(grandstandSeat(seat.row, seat.column).avatar)), colors);
  }

  function addSeatSupports(scene) {
    const cushions = [];
    scene.traverse(batch => {
      if (batch.isInstancedMesh && batch.geometry.userData.seatCushion) cushions.push(batch);
    });
    const geometry = new THREE.BoxGeometry(0.42, 1.42, 1.05);
    const material = HD.util.material(0x435963);
    const matrix = new THREE.Matrix4();
    const offset = new THREE.Matrix4().makeTranslation(0, -0.81, 0);
    cushions.forEach(cushion => {
      const supports = new THREE.InstancedMesh(geometry, material, cushion.count);
      supports.name = 'Stadium seat supports';
      for (let index = 0; index < cushion.count; index++) {
        cushion.getMatrixAt(index, matrix);
        supports.setMatrixAt(index, matrix.multiply(offset));
      }
      supports.computeBoundingSphere();
      cushion.parent.add(supports);
    });
  }

  function createChair(scene, placement, color) {
    const root = new THREE.Group();
    root.position.set(placement.position.x, placement.tierTop, placement.position.z);
    root.rotation.y = placement.yaw;
    scene.add(root);

    mesh(createSeatGeometry(false), color, root, [0, SEAT.cushionY, 0]);
    mesh(createSeatGeometry(true), color, root, [0, SEAT.backY, SEAT.backOffset]);
    box([0.42, 1.42, 1.05], 0x435963, root, [0, 0.71, 0]);
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
    sky.rotation.z = 0;
    scene.add(sky);

    createMountainBackdrop(scene);

    createTreeLine(scene);
  }

  function createMountainBackdrop(scene) {
    const vertices = [];
    const indices = [];
    const segments = 128;
    for (let ring = 0; ring < 3; ring++) {
      for (let index = 0; index <= segments; index++) {
        const angle = index / segments * Math.PI * 2;
        const peak = 26 + Math.sin(angle * 5) * 10 + Math.sin(angle * 11 + 1) * 6;
        const radius = [190, 265, 400][ring] + Math.sin(angle * 7) * ring * 5;
        vertices.push(Math.cos(angle) * radius, ring === 1 ? peak : -0.5, Math.sin(angle) * radius);
        if (ring < 2 && index < segments) {
          const a = ring * (segments + 1) + index;
          const b = a + segments + 1;
          indices.push(a, a + 1, b, a + 1, b + 1, b);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const mountains = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({
      color: 0x6c8893, side: THREE.DoubleSide,
    }));
    mountains.name = 'Continuous distant mountain ridge';
    scene.add(mountains);
  }

  function createTreeLine(scene) {
    const modelDetail = HD.Settings.modelDetail();
    const treeCount = modelDetail === "low" ? 72 : modelDetail === "standard" ? 120 : 180;
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
      let landscapedAngle = angle;
      const entranceAngle = SECONDARY_ENTRANCE_ANGLES.find((candidate) => {
        return angleDistance(angle, candidate) < 0.11;
      });
      if (entranceAngle !== undefined) {
        const offset = Math.atan2(
          Math.sin(angle - entranceAngle),
          Math.cos(angle - entranceAngle),
        );
        landscapedAngle = entranceAngle + Math.sign(offset || 1) * 0.14;
      }
      const variation = Math.sin(i * 12.9898);
      const landscapeRow = i % 4;
      const radiusX = 127 + landscapeRow * 3.7 + variation * 0.9;
      const radiusZ = 88 + landscapeRow * 2.5 + variation * 0.65;
      const x = Math.cos(landscapedAngle) * radiusX;
      const z = Math.sin(landscapedAngle) * radiusZ;
      const scale = 0.75 + (i % 7) * 0.07;

      dummy.position.set(x, 2.4 * scale, z);
      dummy.scale.set(scale, scale, scale);
      dummy.rotation.y = landscapedAngle;
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);

      dummy.position.y = 6.2 * scale;
      dummy.rotation.y = landscapedAngle * 1.7;
      dummy.updateMatrix();
      crowns.setMatrixAt(i, dummy.matrix);
      crowns.setColorAt(
        i,
        new THREE.Color([0x2f7541, 0x3f8750, 0x28663a][i % 3]),
      );
    }

    [trunks, crowns].forEach((batch) => {
      batch.castShadow = false;
      batch.receiveShadow = false;
      if (batch.instanceColor) batch.instanceColor.needsUpdate = true;
      scene.add(batch);
    });

    createClouds(scene);
  }

  function createClouds(scene) {
    const modelDetail = HD.Settings.modelDetail();
    const cloudCount = modelDetail === "low" ? 10 : modelDetail === "standard" ? 18 : 28;
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
    for (let index = 0; index < 8; index++) {
      const angle = ((index + 0.5) / 8) * Math.PI * 2;
      if (!upperPropPositionIsClear(angle)) continue;
      const position = oval(109.5, 74.5, angle);
      const bench = new THREE.Group();
      bench.position.set(position.x, 13.5, position.z);
      bench.rotation.y = -angle + Math.PI / 2;
      scene.add(bench);

      box([4.8, 0.24, 1.1], 0x8a613c, bench, [0, 0.72, 0]);
      box([4.8, 1.25, 0.2], 0x735033, bench, [0, 1.35, 0.5]);
      box([0.28, 0.8, 0.8], 0x30473a, bench, [-1.9, 0.35, 0]);
      box([0.28, 0.8, 0.8], 0x30473a, bench, [1.9, 0.35, 0]);
    }
  }

  function createPlayerRoutes(scene) {
    createRaisedRing(scene, 80.5, 50.5, 74, 44, 1.65, 0xd8c499);
    createUpperConcourse(scene);
    createConcourseFloorFinish(scene);
    createConcourseGlassRails(scene);

    HD.world.staircases = [];
    STAIR_ANGLES.forEach((angle) => createStaircase(scene, angle));
    HD.world.stairArrivalMarkers = [];

    HD.world.shopPositions = [];
    HD.world.betCounterPositions = [];
    HD.world.bettingDisplays = [];
    HD.world.lastBettingDisplayUpdate = -Infinity;
    HD.world.sabotageCounterPositions = [];
    HD.world.barriers = [];
    const shopAngles = [Math.PI / 4, (Math.PI * 3) / 4, (Math.PI * 5) / 4, (Math.PI * 7) / 4]
      .map(angle => angle + 0.2);
    shopAngles.forEach((angle, index) => createUpperShop(scene, angle, index));
    createSabotageCounter(scene, FIXER_ANGLE);
    createUpperConcourseProps(scene);
  }

  function createUpperConcourse(scene) {
    const color = 0xb7a47f;

    createSolidOvalSegment(
      scene,
      120,
      83,
      103.25,
      69.75,
      12.75,
      ARENA_COLORS.concreteDark,
      0,
      Math.PI * 2,
      96,
      1.15,
    ).name = 'Solid upper-concourse foundation';

    const shellSegmentCount = 8;
    for (let segment = 0; segment < shellSegmentCount; segment++) {
      const segmentStart = segment / shellSegmentCount * Math.PI * 2;
      const segmentEnd = (segment + 1) / shellSegmentCount * Math.PI * 2;
      createSolidOvalSegment(
        scene,
        120,
        83,
        103.25,
        69.75,
        13.5,
        color,
        segmentStart,
        segmentEnd,
        14,
        12.75,
      );
    }
    // A supported slab keeps the public concourse open, rather than making
    // the entire stadium perimeter one solid concrete drum.
    for (let index = 0; index < 24; index++) {
      const angle = (index + 0.5) / 24 * Math.PI * 2;
      for (const [rx, rz] of [[105, 71], [118.7, 81.7]]) {
        const point = oval(rx, rz, angle);
        box([1.1, 13.3, 1.1], ARENA_COLORS.concreteDark, scene, [point.x, 6.1, point.z]);
      }
    }
  }

  function createCommentatorVoidFascia(scene, startAngle, endAngle, color) {
    const segments = 4;

    for (let index = 0; index < segments; index++) {
      const angleA = THREE.MathUtils.lerp(
        startAngle,
        endAngle,
        index / segments,
      );
      const angleB = THREE.MathUtils.lerp(
        startAngle,
        endAngle,
        (index + 1) / segments,
      );
      const start = oval(110.55, 75.55, angleA);
      const end = oval(110.55, 75.55, angleB);

      createBoothWall(
        scene,
        start,
        end,
        7.72,
        UPPER_CONCOURSE_Y,
        color,
        0.32,
      );
    }
  }

  function createCommentatorBarriers() {
    const halfAngle = COMMENTATOR_HALF_ANGLE;
    const innerLeft = oval(93, 60, COMMENTATOR_ANGLE - halfAngle);
    const innerRight = oval(93, 60, COMMENTATOR_ANGLE + halfAngle);
    const outerLeft = oval(109, 74, COMMENTATOR_ANGLE - halfAngle);
    const outerRight = oval(109, 74, COMMENTATOR_ANGLE + halfAngle);
    const backLeftEnd = outerLeft.clone().lerp(outerRight, 0.3);
    const backRightStart = outerLeft.clone().lerp(outerRight, 0.7);

    [
      [innerLeft, innerRight],
      [innerLeft, outerLeft],
      [innerRight, outerRight],
      [outerLeft, backLeftEnd],
      [backRightStart, outerRight],
    ].forEach(([start, end]) => addSegmentBarrier(start, end));

    const counterLeft = innerLeft.clone().lerp(outerLeft, 0.23);
    const counterRight = innerRight.clone().lerp(outerRight, 0.23);
    addSegmentBarrier(counterLeft, counterRight, 0.58);

    for (const side of [-1, 1]) {
      const angle = COMMENTATOR_ANGLE +
        side * COMMENTATOR_STAIR_HALF_ANGLE;
      const glassInner = oval(103.25, 69.75, angle);
      const glassOuter = oval(114.15, 78.05, angle);
      addSegmentBarrier(glassInner, glassOuter, 0.12);
    }
  }

  function addSegmentBarrier(start, end, halfDepth = 0.24) {
    const delta = end.clone().sub(start);
    const center = start.clone().add(end).multiplyScalar(0.5);
    HD.world.barriers.push({
      type: "box",
      x: center.x,
      z: center.z,
      angle: -Math.atan2(delta.z, delta.x),
      halfWidth: delta.length() / 2,
      halfDepth,
    });
  }

  function createUpperConcourseProps(scene) {
    const colors = [0x496b3f, 0xa95e3f, 0x3c6578];
    for (let index = 0; index < 12; index++) {
      const angle = (index / 12) * Math.PI * 2 + 0.18;
      if (!upperPropPositionIsClear(angle)) continue;
      const position = oval(110, 74.5, angle);
      const prop = new THREE.Group();
      prop.position.set(position.x, 13.5, position.z);
      scene.add(prop);
      cylinder(1.05, 1.2, 1.05, 0x76563c, prop, [0, 0.52, 0], 12);
      sphere(1.35, colors[index % colors.length], prop, [0, 1.65, 0]);
      HD.world.barriers.push({ x: position.x, z: position.z, radius: 1.45 });
    }

    for (let index = 0; index < 8; index++) {
      const angle = (index / 8) * Math.PI * 2 + 0.42;
      if (!upperPropPositionIsClear(angle)) continue;
      const position = oval(116, 78.5, angle);
      const table = new THREE.Group();
      table.position.set(position.x, 13.5, position.z);
      scene.add(table);
      cylinder(1.35, 1.35, 0.2, 0xe0c38b, table, [0, 1.2, 0], 16);
      cylinder(0.18, 0.24, 1.2, 0x465456, table, [0, 0.6, 0], 10);
      HD.world.barriers.push({ x: position.x, z: position.z, radius: 1.5 });
    }

    for (let index = 0; index < 8; index++) {
      const angle = (index / 8) * Math.PI * 2 + 0.2;
      if (!upperPropPositionIsClear(angle)) continue;
      const position = oval(106.5, 72, angle);
      const kiosk = new THREE.Group();
      kiosk.position.set(position.x, 13.5, position.z);
      kiosk.rotation.y = -angle + Math.PI / 2;
      scene.add(kiosk);
      cylinder(0.45, 0.62, 2.8, 0x3d5455, kiosk, [0, 1.4, 0], 10);
      box([2.3, 1.25, 0.3], index % 2 ? 0xd76b38 : 0x3f83a4, kiosk, [0, 3.1, 0]);
      const plaque = createTextSign(index % 2 ? "FOOD" : "TRACK", 0xffdf75);
      plaque.position.set(0, 3.1, -0.18);
      plaque.scale.set(1.85, 0.8, 1);
      kiosk.add(plaque);
      HD.world.barriers.push({ x: position.x, z: position.z, radius: 1.25 });
    }

    for (let index = 0; index < 6; index++) {
      const angle = (index / 6) * Math.PI * 2 + 0.58;
      if (!upperPropPositionIsClear(angle)) continue;
      const position = oval(113, 76.5, angle);
      const arcade = new THREE.Group();
      arcade.position.set(position.x, 13.5, position.z);
      arcade.rotation.y = -angle + Math.PI / 2;
      scene.add(arcade);
      box([2.1, 3.5, 1.45], index % 2 ? 0x78459a : 0xc74e38, arcade, [0, 1.75, 0]);
      const screen = box([1.55, 1.25, 0.08], 0x163a4a, arcade, [0, 2.3, -0.76]);
      screen.material.emissive.setHex(index % 2 ? 0x8a44be : 0x2fa4c5);
      screen.material.emissiveIntensity = 0.7;
      box([1.6, 0.18, 0.75], 0xe1bd58, arcade, [0, 1.35, -0.82]);
      HD.world.barriers.push({ x: position.x, z: position.z, radius: 1.45 });
    }

    const pennantColors = [0xe65c3d, 0xf0c84d, 0x4784b8, 0x56a66e];
    for (let index = 0; index < 24; index++) {
      const angle = (index / 24) * Math.PI * 2;
      const position = oval(98, 65, angle);
      const pennant = mesh(
        new THREE.ConeGeometry(0.7, 2.2, 3),
        pennantColors[index % pennantColors.length],
        scene,
        [position.x, 20.7, position.z],
      );
      pennant.rotation.set(Math.PI, -angle, 0);
      pennant.castShadow = false;
    }
  }

  function createSabotageCounter(scene, angle) {
    // Keep the entire counter centered on the walkable concourse. The old
    // world-space Z offset pushed it through the exterior glass on one side.
    const position = oval(112, 76, angle);
    const counter = new THREE.Group();
    counter.position.set(position.x, 13.5, position.z);
    counter.rotation.y = -angle + Math.PI / 2;
    scene.add(counter);

    box([6.4, 2.3, 2.6], 0x242728, counter, [0, 1.15, 0]);
    box([7, 0.3, 3], 0xa87d38, counter, [0, 2.45, 0]);
    box([5.8, 1.1, 0.18], 0x151819, counter, [0, 3.55, 0]);
    const sign = createTextSign("PADDOCK FIXER", 0xe9bd51);
    sign.position.set(0, 3.55, -0.18);
    sign.scale.set(5.4, 0.95, 1);
    counter.add(sign);

    const worker = HD.Models.playerCharacter(0x202326, {
      hat: "fedora",
      skin: 0xb97852,
    });
    HD.Models.setPlayerStanding(worker, true);
    worker.position.set(0, 2.55, 0.35);
    worker.scale.setScalar(0.58);
    counter.add(worker);

    HD.world.sabotageCounterPositions.push(
      new THREE.Vector3(position.x, 18.3, position.z),
    );
    HD.world.barriers.push({ x: position.x, z: position.z, radius: 3.7 });
  }

  function createStaircase(scene, angle) {
    const stairs = HD.CONFIG.stairs;
    const root = new THREE.Group();
    const start = oval(stairs.startX, stairs.startZ, angle);
    const end = oval(stairs.endX, stairs.endZ, angle);
    const path = end.clone().sub(start);
    const pathLength = path.length();
    const segments = mainStairSegments(angle, start, path);
    const stepCount = segments.length;
    const connectorShare = 0.42;
    root.position.copy(start);
    root.rotation.y = Math.atan2(path.x, path.z);
    root.userData.staircase = {
      angle,
      start: start.toArray(),
      end: end.toArray(),
      treadCount: stepCount,
      treadsPerSeatRow: 3,
      connectorShare,
      rowLandingCount: segments.filter(segment => segment.kind === 'landing').length,
      surfaceProfile: segments.map(segment => ({ ...segment })),
      visualTopY: stairs.topHeight - STAIR_SURFACE_INSET,
      concourseY: UPPER_CONCOURSE_Y,
    };
    scene.add(root);
    HD.world.staircases.push(root);

    const lightSteps = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      HD.util.material(0xa7adae),
      Math.ceil(stepCount / 2),
    );
    const darkSteps = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      HD.util.material(0xa7adae),
      Math.floor(stepCount / 2),
    );
    const dummy = new THREE.Object3D();
    let lightIndex = 0;
    let darkIndex = 0;

    for (let step = 0; step < stepCount; step++) {
      const segment = segments[step];
      const startProgress = segment.start;
      const progress = segment.end;
      const distance = (startProgress + progress) * 0.5 * pathLength;
      const stepDepth = (progress - startProgress) * pathLength + 0.12;
      const topInset = STAIR_SURFACE_INSET * THREE.MathUtils.smoothstep(
        progress,
        0.62,
        1,
      );
      const top = segment.height - topInset;
      const foundation = 1.25;
      const height = top - foundation;
      const centerY = foundation + height / 2;
      const batch = step % 2 ? darkSteps : lightSteps;
      const index = step % 2 ? darkIndex++ : lightIndex++;
      dummy.position.set(0, centerY, distance);
      dummy.scale.set(stairs.width, height, stepDepth);
      dummy.updateMatrix();
      batch.setMatrixAt(index, dummy.matrix);
    }

    [lightSteps, darkSteps].forEach((batch) => {
      batch.castShadow = false;
      batch.receiveShadow = true;
      batch.instanceMatrix.needsUpdate = true;
      root.add(batch);
    });

    box(
      [stairs.width, 0.28, 0.72],
      ARENA_COLORS.concrete,
      root,
      [0, stairs.bottomHeight - 0.14, 0],
    );
    addStairRails(root, pathLength, segments);
  }

  function addStairRails(root, span, segments) {
    const railHeight = 2.8;
    const points = [{ progress: 0, height: HD.CONFIG.stairs.bottomHeight }];
    segments.forEach(segment => {
      points.push({ progress: segment.end, height: segment.height });
    });

    points.forEach((point, index) => {
      const distance = span * point.progress;
      const post = cylinder(
        0.1,
        0.1,
        railHeight,
        ARENA_COLORS.railing,
        root,
        [0, point.height + railHeight / 2, distance],
        7,
      );
      post.name = 'Visual-only center stair handrail post';
      post.userData.noArenaBatch = true;
      post.userData.collision = false;
      if (index === points.length - 1) return;
      const next = points[index + 1];
      const run = (next.progress - point.progress) * span;
      const rise = next.height - point.height;
      const rail = box(
        [0.22, 0.22, Math.sqrt(run * run + rise * rise) + 0.12],
        ARENA_COLORS.railing,
        root,
        [0, (point.height + next.height) / 2 + railHeight,
          (point.progress + next.progress) * span / 2],
      );
      rail.name = index === 0
        ? 'Visual-only center stair handrail'
        : 'Visual-only center stair handrail segment';
      rail.userData.noArenaBatch = true;
      rail.userData.collision = false;
      rail.rotation.x = -Math.atan2(rise, run);
    });
  }

  function mainStairSegments(angle, start, path) {
    const stairs = HD.CONFIG.stairs;
    const lengthSquared = path.lengthSq();
    const segments = [];
    let cursor = 0;
    let previousHeight = stairs.bottomHeight;

    for (let row = 0; row < 7; row++) {
      const inner = oval(80.5 + row * 3.25, 50.5 + row * 2.75, angle);
      const outer = oval(83.75 + row * 3.25, 53.25 + row * 2.75, angle);
      const innerProgress = inner.clone().sub(start).dot(path) / lengthSquared;
      const outerProgress = outer.clone().sub(start).dot(path) / lengthSquared;
      const center = (innerProgress + outerProgress) / 2;
      const landingHalfWidth = (outerProgress - innerProgress) * 0.29;
      const landingStart = THREE.MathUtils.clamp(center - landingHalfWidth, cursor, 1);
      const landingEnd = THREE.MathUtils.clamp(center + landingHalfWidth, landingStart, 1);
      const height = HD.CONFIG.grandstandBaseHeight + row * 1.5;
      if (landingStart > cursor + 0.001) {
        const middle = (cursor + landingStart) / 2;
        segments.push({
          kind: 'connector', start: cursor, end: middle,
          height: THREE.MathUtils.lerp(previousHeight, height, 0.5),
        });
        segments.push({ kind: 'connector', start: middle, end: landingStart, height });
      }
      segments.push({ kind: 'landing', start: landingStart, end: landingEnd, height });
      cursor = landingEnd;
      previousHeight = height;
    }
    const finalSplit = (cursor + 1) / 2;
    segments.push({
      kind: 'connector', start: cursor, end: finalSplit,
      height: THREE.MathUtils.lerp(previousHeight, stairs.topHeight, 0.5),
    });
    segments.push({ kind: 'connector', start: finalSplit, end: 1, height: stairs.topHeight });
    return segments;
  }

  function createUpperShop(scene, angle, index) {
    const position = oval(115, 79, angle);
    const colors = [0xe85d3b, 0x3f8cc9, 0xe7a83e, 0x52a66b];
    const shop = new THREE.Group();
    shop.position.set(position.x, 13.5, position.z);
    shop.rotation.y = -angle + Math.PI / 2;
    scene.add(shop);

    const shopNames = ["TRACK SNACKS", "FAN GEAR", "THROW DEPOT", "QUICK BITES"];
    box([12, 0.35, 5.2], 0x76593b, shop, [0, 0.18, 0]);
    box([12, 5.1, 0.35], colors[index], shop, [0, 2.55, 2.45]);
    box([0.35, 5.1, 5.2], colors[index], shop, [-5.82, 2.55, 0]);
    box([0.35, 5.1, 5.2], colors[index], shop, [5.82, 2.55, 0]);
    box([12.8, 0.45, 5.8], 0xf0c95d, shop, [0, 5.3, 0]);
    box([10.2, 1.15, 1.1], 0xf3e4bd, shop, [0, 1.18, -2.2]);
    createConcessionCounterFinish(shop, colors[index]);
    box([9.6, 0.18, 0.65], 0x5d402c, shop, [0, 2.7, 2.05]);
    box([9.6, 0.18, 0.65], 0x5d402c, shop, [0, 3.8, 2.05]);

    for (let display = 0; display < 7; display++) {
      const x = -4.2 + display * 1.4;
      cylinder(
        0.24,
        0.3,
        0.72,
        HD.CONFIG.playerColors[display],
        shop,
        [x, 3.22, 1.82],
        10,
      );
      box(
        [0.75, 0.55, 0.32],
        HD.CONFIG.playerColors[(display + 3) % 8],
        shop,
        [x, 4.22, 1.82],
      );
    }

    for (let stripe = 0; stripe < 8; stripe++) {
      box(
        [1.5, 0.18, 1.3],
        stripe % 2 ? 0xf8e6b0 : colors[index],
        shop,
        [-5.25 + stripe * 1.5, 5.08, -2.8],
      );
    }

    const sign = createTextSign(shopNames[index], 0xffda62);
    sign.position.set(0, 4.7, -2.64);
    sign.scale.set(7.8, 0.78, 1);
    shop.add(sign);
    createConcessionMenus(shop);
    addShopWorker(shop, colors[index], [0, 0.78, 0.75], 0.58);

    HD.world.shopPositions.push(new THREE.Vector3(position.x, 18.3, position.z));
    HD.world.barriers.push({
      type: "box",
      x: position.x,
      z: position.z,
      angle: shop.rotation.y,
      halfWidth: 6.2,
      halfDepth: 2.7,
    });
    createBettingCounter(scene, position, angle, index);
  }

  function createConcessionCounterFinish(shop, accent) {
    const outline = new THREE.Shape();
    roundedRectangle(outline, -5.3, -0.67, 10.6, 1.34, 0.16);
    const geometry = new THREE.ExtrudeGeometry(outline, {
      depth: 0.13,
      bevelEnabled: true,
      bevelSize: 0.025,
      bevelThickness: 0.025,
      bevelSegments: 2,
      steps: 1,
      curveSegments: 5,
    });
    geometry.rotateX(-Math.PI / 2);
    const worktop = new THREE.Mesh(geometry, HD.util.material(0x45595b));
    worktop.position.set(0, 1.76, -2.2);
    worktop.name = 'Rounded concession worktop';
    shop.add(worktop);

    for (let panel = 0; panel < 5; panel++) {
      box([1.85, 0.8, 0.055], accent, shop, [-3.94 + panel * 1.97, 1.18, -2.78]);
    }
    box([9.9, 0.09, 0.07], 0x45595b, shop, [0, 0.65, -2.79]);

    const terminal = new THREE.Group();
    terminal.position.set(-3.8, 1.92, -2.2);
    terminal.name = 'Concession payment terminal';
    shop.add(terminal);
    box([0.66, 0.12, 0.55], 0x273b42, terminal, [0, 0, 0]);
    const display = box([0.55, 0.4, 0.07], 0x6ca4ad, terminal, [0, 0.24, 0.1]);
    display.rotation.x = -0.25;

    // A preparation surface stays behind the worker and service opening.
    box([3, 0.12, 0.8], 0xa6b1af, shop, [3.1, 1.95, 1.2]);
    for (const x of [2.1, 4.1]) {
      box([0.1, 1.55, 0.1], 0x45595b, shop, [x, 1.12, 1.2]);
    }
  }

  function createConcessionMenus(shop) {
    const menus = [
      { title: "TRACK SNACKS", items: ["hotdog", "soda", "carrot"] },
      { title: "FAN FAVORITES", items: ["horseshoe", "pillow", "chair"] },
    ];

    menus.forEach((menu, index) => {
      const x = index === 0 ? -3.65 : 3.65;
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 384;
      const context = canvas.getContext("2d");
      context.fillStyle = "#17382a";
      context.fillRect(0, 0, 512, 384);
      context.fillStyle = "#f4d259";
      context.fillRect(28, 83, 456, 4);
      context.font = "900 32px sans-serif";
      context.textAlign = "left";
      context.fillText(menu.title, 28, 57);
      context.font = "600 29px sans-serif";
      context.fillStyle = "#f3eee0";
      menu.items.forEach((item, row) => {
        context.fillText(HD.CONFIG.items[item].name, 28, 142 + row * 65);
      });
      context.font = "600 19px sans-serif";
      context.fillStyle = "#b6cdbb";
      context.fillText("ORDER AT COUNTER  /  INSTANT PICKUP", 28, 352);

      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const board = new THREE.Mesh(
        new THREE.PlaneGeometry(2.75, 1.8),
        new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }),
      );
      board.name = "Concession menu board";
      board.rotation.y = Math.PI;
      board.position.set(x, 3.05, -0.56);
      shop.add(board);
      box([2.89, 1.94, 0.14], 0x45595b, shop, [x, 3.05, -0.46]);
      for (const offset of [-0.95, 0.95]) {
        box([0.055, 1.1, 0.055], 0x45595b, shop, [x + offset, 4.55, -0.46]);
      }
    });

    // Recessed waste stations remain within the stall's existing solid footprint.
    for (const side of [-1, 1]) {
      const bin = new THREE.Group();
      bin.name = "Concession waste station";
      bin.position.set(side * 5.25, 0.36, -1.25);
      shop.add(bin);
      box([0.76, 1.2, 0.76], 0x45595b, bin, [0, 0.6, 0]);
      box([0.82, 0.1, 0.82], 0x83918a, bin, [0, 1.23, 0]);
      box([0.5, 0.22, 0.015], 0x172c31, bin, [0, 0.96, -0.389]);
      const label = createTextSign(side < 0 ? "WASTE" : "RECYCLE", 0xf3e4bd);
      label.position.set(0, 0.52, -0.393);
      label.scale.set(0.63, 0.2, 1);
      bin.add(label);
    }
  }

  function createBettingCounter(scene, shopPosition, angle, index) {
    const tangent = new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle));
    const position = shopPosition.clone().addScaledVector(tangent, 12.5);
    const counter = new THREE.Group();
    const colors = [0x315f43, 0x315b77, 0x704858, 0x6d542f];
    counter.position.set(position.x, 13.5, position.z);
    counter.rotation.y = -angle + Math.PI / 2;
    scene.add(counter);

    box([8.2, 2.6, 2.4], colors[index], counter, [0, 1.3, 0]);
    box([8.8, 0.3, 2.9], 0xe8cf87, counter, [0, 2.75, 0]);
    box([8.35, 3.1, 0.28], 0xbfc4c1, counter, [0, 4.25, 1.05]);
    box([7.8, 1.25, 0.16], 0x17382a, counter, [0, 5.25, 0.88]);
    const header = createTextSign("PLACE BETS", 0xf4d259);
    header.position.set(0, 5.25, 0.72);
    header.scale.set(7.2, 0.82, 1);
    counter.add(header);
    const frontPlaque = createTextSign("NO ONLINE FEE", 0xf4d259);
    frontPlaque.position.set(0, 1.35, -1.23);
    frontPlaque.scale.set(5.6, 0.68, 1);
    counter.add(frontPlaque);

    for (let station = 0; station < 3; station++) {
      const x = -2.55 + station * 2.55;
      const display = createTextSign(`WINDOW ${station + 1}`, 0xe9f1eb);
      display.position.set(x, 4.15, -1.16);
      display.scale.set(2.05, 0.42, 1);
      counter.add(display);
      box([2.22, 1.02, 0.12], 0x183b4d, counter, [x, 3.45, -1.28]);
      addBettingDisplay(counter, station, x);
      cylinder(0.12, 0.12, 0.18, station === 1 ? 0x65d97b : 0xf0c95d,
        counter, [x, 4.5, -1.28], 10).rotation.x = Math.PI / 2;
      if (station < 2) {
        box([0.16, 2.45, 0.35], 0x596363, counter, [x + 1.28, 3.55, -0.02]);
      }
    }
    addShopWorker(counter, colors[index], [0, 1.72, 0.45], 0.5);

    // Low queue rails define approach space without closing the promenade.
    for (const x of [-3.55, 3.55]) {
      cylinder(0.07, 0.1, 1.25, 0x315f78, counter, [x, 0.62, -3.25], 8);
      cylinder(0.07, 0.1, 1.25, 0x315f78, counter, [x, 0.62, -5.15], 8);
      box([0.1, 0.12, 1.9], 0x315f78, counter, [x, 1.08, -4.2]);
    }

    HD.world.betCounterPositions.push(new THREE.Vector3(position.x, 18.3, position.z));
    HD.world.barriers.push({
      type: 'box', x: position.x, z: position.z, angle: counter.rotation.y,
      halfWidth: 4.4, halfDepth: 1.6,
    });
  }

  function addBettingDisplay(counter, station, x) {
    let display = HD.world.bettingDisplays[station];
    if (!display) {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 224;
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      display = { canvas, texture, signature: null, rows: [], status: '' };
      HD.world.bettingDisplays[station] = display;
    }
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(2.1, 0.9),
      new THREE.MeshBasicMaterial({ map: display.texture, toneMapped: false }),
    );
    screen.name = `Live counter odds screen ${station + 1}`;
    screen.position.set(x, 3.45, -1.345);
    screen.rotation.y = Math.PI;
    counter.add(screen);
    drawBettingDisplays();
  }

  function drawBettingDisplays() {
    const horses = HD.state.horses.map(horse => horse.userData.data);
    const open = HD.Race?.liveBettingOpen() ?? false;
    const status = !horses.length ? 'AWAITING FIELD' :
      open ? (HD.state.phase === 'racing' ? 'LIVE BETTING' : 'BETTING OPEN') : 'BETTING CLOSED';
    // Distribute the entire 4–8 horse field across three fixed window screens.
    (HD.world.bettingDisplays || []).forEach((display, station) => {
      const rows = horses.filter((horse, index) => index % 3 === station).map(horse => ({
        number: HD.horseNumber(horse),
        odds: horse.odds,
      }));
      const signature = JSON.stringify([status, HD.state.round, rows]);
      if (signature === display.signature) return;
      display.signature = signature;
      display.rows = rows;
      display.status = status;
      const context = display.canvas.getContext('2d');
      context.fillStyle = '#102c35';
      context.fillRect(0, 0, 512, 224);
      context.textAlign = 'left';
      context.fillStyle = open ? '#a9e1b2' : '#efd394';
      context.font = '800 25px sans-serif';
      context.fillText(status, 18, 31);
      context.textAlign = 'right';
      context.fillText(`R${HD.state.round}`, 494, 31);
      context.fillStyle = '#8aa6ae';
      context.fillRect(18, 44, 476, 2);
      rows.forEach((row, index) => {
        const y = 86 + index * 46;
        context.textAlign = 'left';
        context.fillStyle = '#f1e8d2';
        context.font = '800 35px sans-serif';
        context.fillText(`#${row.number}`, 20, y);
        context.textAlign = 'right';
        context.fillStyle = '#ffdb72';
        context.fillText(`${row.odds}:1`, 490, y);
      });
      context.textAlign = 'left';
      context.font = '600 19px sans-serif';
      context.fillStyle = '#b3c3be';
      context.fillText('WIN ODDS  /  NO COUNTER FEE', 18, 212);
      display.texture.needsUpdate = true;
    });
  }

  function createConcourseGlassRails(scene) {
    createCurvedGlassRail(scene, 103.25, 69.75, 13.5, 2.2, 72, true);
    createCurvedGlassRail(scene, 120, 83, 13.5, 11.3, 96, false);
  }

  // Major orientation landmarks remain intentionally simple and high contrast:
  // players can identify the infield, horse route, and stadium entry at a glance.
  function createArenaLandmarks(scene) {
    createInfieldPond(scene);
    createFloodlightTowers(scene);
    createExteriorFacade(scene);
    createExteriorEntrance(scene);
    createSecondaryEntrances(scene);
    createConcourseAmenities(scene);
    createBroadcastCrews(scene);
    createReplayBillboard(scene);
  }

  function createExteriorFacade(scene) {
    const root = new THREE.Group();
    root.name = 'Segmented exterior stadium facade';
    scene.add(root);
    HD.world.exteriorFacadeBays = [];

    const openings = [
      ...STAIR_ANGLES,
      ...SECONDARY_ENTRANCE_ANGLES,
    ];
    const bayCount = 32;
    for (let index = 0; index < bayCount; index++) {
      const angle = (index + 0.5) / bayCount * Math.PI * 2;
      if (openings.some((opening) => angleDistance(angle, opening) < 0.17)) continue;

      const position = oval(117.7, 80.5, angle);
      const bay = new THREE.Group();
      bay.name = `Exterior facade bay ${index + 1}`;
      bay.position.copy(position);
      bay.rotation.y = -angle + Math.PI / 2;
      root.add(bay);

      box([8.6, 0.75, 1.1], ARENA_COLORS.concreteDark, bay, [0, 10.75, 0]);
      for (const side of [-1, 1]) {
        box([0.78, 10.7, 1.05], ARENA_COLORS.concrete, bay, [side * 4.05, 5.35, 0]);
      }
      box([7.3, 1.05, 0.62], 0x687371, bay, [0, 0.53, 0]);

      if (index % 3 === 0) {
        for (const doorX of [-1.75, 1.75]) {
          box([2.8, 5.4, 0.18], 0x28536d, bay, [doorX, 3.2, 0.58]);
          box([0.08, 0.44, 0.1], 0xe3ca76, bay, [doorX + 0.85, 3.05, 0.72]);
        }
        const plaque = createTextSign('SERVICE', 0xffdf75);
        plaque.position.set(0, 8.35, 0.6);
        plaque.rotation.y = 0;
        plaque.scale.set(4.8, 0.62, 1);
        bay.add(plaque);
      } else {
        for (const panelX of [-2.35, 0, 2.35]) {
          box([1.85, 4.6, 0.16], 0x4f8294, bay, [panelX, 4.5, 0.58]);
          box([1.85, 0.18, 0.2], 0xd1b85f, bay, [panelX, 6.86, 0.66]);
        }
        box([7.15, 0.35, 0.42], 0x315f78, bay, [0, 7.45, 0.54]);
      }

      bay.updateMatrixWorld(true);
      const worldPosition = bay.localToWorld(new THREE.Vector3(0, 0, 0));
      HD.world.structuralBarriers.push({
        type: 'box',
        x: worldPosition.x,
        z: worldPosition.z,
        angle: bay.rotation.y,
        halfWidth: 4.45,
        halfDepth: 0.7,
        minY: -0.2,
        maxY: 11.2,
      });
      HD.world.exteriorFacadeBays.push(bay);
    }
  }

  function createReplayBillboard(scene) {
    // Across from the entrance and slightly east of the north staircase, the
    // screen is visible as soon as players enter without covering an aisle.
    const angle = REPLAY_ANGLE;
    const root = new THREE.Group();
    root.name = 'Entrance-facing instant replay billboard';
    root.position.copy(oval(117, 80, angle)).setY(13.5);
    root.rotation.y = -angle + Math.PI / 2;
    scene.add(root);

    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 576;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;

    const frameY = 14;
    box([25.5, 14.2, 1.05], 0x18272d, root, [0, frameY, 0]);
    box([26.5, 0.72, 1.65], 0xe2b63f, root, [0, frameY + 7.35, 0]);
    box([26.5, 0.72, 1.65], 0xe2b63f, root, [0, frameY - 7.35, 0]);
    for (const x of [-12.65, 12.65]) {
      box([0.7, 14.2, 1.55], 0x315f78, root, [x, frameY, 0]);
    }

    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(23.8, 12.5),
      new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }),
    );
    screen.position.set(0, frameY, -0.56);
    screen.rotation.y = Math.PI;
    screen.name = 'Instant replay video surface';
    root.add(screen);

    const rearBrand = createTextSign('HOTDOG DOWNS', 0xffdf75);
    rearBrand.position.set(0, frameY + 0.4, 0.56);
    rearBrand.rotation.y = 0;
    rearBrand.scale.set(15.5, 2.6, 1);
    root.add(rearBrand);
    for (const y of [frameY - 4.7, frameY + 5.4]) {
      box([21.5, 0.32, 0.16], 0x315f78, root, [0, y, 0.62]);
    }
    for (const side of [-1, 1]) {
      const brace = box([0.34, 12.2, 0.22], 0x657174, root, [side * 5.8, frameY, 0.68]);
      brace.rotation.z = side * 0.7;
    }

    const supportHeight = 7.1;
    for (const x of [-8.8, 8.8]) {
      box([0.85, supportHeight, 0.85], ARENA_COLORS.concreteDark, root, [
        x,
        supportHeight / 2,
        0,
      ]);
      box([3.2, 0.55, 3.2], ARENA_COLORS.concrete, root, [x, 0.2, 0]);
    }

    box([25.2, 0.32, 3.1], 0x6d7778, root, [0, 6.75, 0.78]);
    for (const z of [-0.72, 2.25]) {
      box([25.2, 0.12, 0.12], ARENA_COLORS.railing, root, [0, 8.65, z]);
      for (let post = -5; post <= 5; post++) {
        cylinder(0.055, 0.07, 1.9, ARENA_COLORS.railing, root, [
          post * 2.35,
          7.7,
          z,
        ], 7);
      }
    }

    // Rear service ladder and camera pod make the structure usable, not decorative.
    for (let rung = 0; rung < 8; rung++) {
      box([1.5, 0.1, 0.12], 0xb9c1c0, root, [10.5, 0.7 + rung * 0.78, 1.7]);
    }
    box([0.12, 6.6, 0.12], 0xb9c1c0, root, [9.75, 3.4, 1.7]);
    box([0.12, 6.6, 0.12], 0xb9c1c0, root, [11.25, 3.4, 1.7]);
    box([2.1, 1.2, 1.7], 0x26383e, root, [-10, 8.15, 1.2]);
    cylinder(0.28, 0.34, 0.72, 0x11191d, root, [-10, 8.18, -0.08], 12)
      .rotation.x = Math.PI / 2;

    root.updateMatrixWorld(true);
    for (const x of [-8.8, 8.8]) {
      const position = root.localToWorld(new THREE.Vector3(x, 0, 0));
      HD.world.structuralBarriers.push({
        x: position.x,
        z: position.z,
        radius: 1.65,
        minY: 13.5,
        maxY: 21,
      });
    }

    HD.world.replayBillboard = {
      root,
      screen,
      canvas,
      context: canvas.getContext('2d'),
      texture,
      lastUpdate: -1,
      angle,
      replayReady: true,
    };
    drawReplayBillboard();
  }

  function drawReplayBillboard() {
    if (HD.Broadcast?.active) return;
    const board = HD.world.replayBillboard;
    if (!board) return;
    const { canvas, context } = board;
    const racing = HD.state.phase === 'racing';
    const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#071d2b');
    gradient.addColorStop(1, '#123c35');
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.fillStyle = '#e6b833';
    context.fillRect(0, 0, canvas.width, 78);
    for (let index = 0; index < 16; index++) {
      context.fillStyle = index % 2 ? '#f4efe2' : '#1b292c';
      context.fillRect(index * 64, 516, 64, 60);
    }

    context.textAlign = 'center';
    context.fillStyle = '#10262a';
    context.font = '900 38px sans-serif';
    context.fillText('HOTDOG DOWNS • STADIUM VISION', 512, 52);
    context.fillStyle = '#ffffff';
    context.font = '900 72px sans-serif';
    context.fillText(racing ? 'LIVE RACE' : 'INSTANT REPLAY', 512, 170);

    const leaders = [...(HD.state.horses || [])].sort(compareRacePosition).slice(0, 3);
    if (racing && leaders.length) {
      context.textAlign = 'left';
      leaders.forEach((horse, index) => {
        const data = horse.userData.data;
        const y = 250 + index * 72;
        context.fillStyle = `#${data.color.toString(16).padStart(6, '0')}`;
        context.fillRect(120, y - 40, 18, 52);
        context.fillStyle = '#f6f1df';
        context.font = '800 32px sans-serif';
        context.fillText(`${index + 1}.  #${HD.horseNumber(data)}  ${data.name}`, 165, y);
      });
    } else {
      context.textAlign = 'center';
      context.fillStyle = '#bcd6d0';
      context.font = '700 38px sans-serif';
      context.fillText('REPLAY FEED READY', 512, 295);
      context.font = '600 25px sans-serif';
      context.fillText('Track cameras connected', 512, 350);
    }
    board.texture.needsUpdate = true;
  }

  // Saved viewpoints for future replays; these do not render extra frames.
  function createConcourseAmenities(scene) {
    CONCOURSE_FACILITIES.forEach(({ angle, label, accent }) => {
      const root = new THREE.Group();
      root.name = label + ' concourse building';
      root.position.copy(oval(115, 78.5, angle)).setY(13.5);
      root.rotation.y = -angle + Math.PI / 2;
      scene.add(root);
      box([7.8, 5.7, 4.6], ARENA_COLORS.concrete, root, [0, 2.85, 0]);
      box([8.4, 0.4, 5.2], accent, root, [0, 5.9, 0]);
      createAmenityFront(root, label, accent);
      const sign = createTextSign(label, 0xffffff);
      sign.position.set(0, 4.7, -2.36);
      sign.scale.set(6.8, 0.9, 1);
      root.add(sign);
      HD.world.barriers.push({
        type: 'box', x: root.position.x, z: root.position.z, angle: root.rotation.y,
        halfWidth: 4.1, halfDepth: 2.6, minY: 13.5, maxY: 19.6,
      });
    });
  }

  function createAmenityFront(root, label, accent) {
    // All facade details stay within the building's existing collision footprint.
    box([7.6, 0.22, 0.15], 0x64736f, root, [0, 0.11, -2.35]);
    box([8.1, 0.18, 0.65], 0x455b60, root, [0, 5.35, -2.25]);
    const lamp = box([5.6, 0.06, 0.18], 0xffedc0, root, [0, 5.23, -2.42]);
    lamp.material.emissive.setHex(0xffe2a0);
    lamp.material.emissiveIntensity = 0.55;

    const addDoor = (x, width, text) => {
      const door = new THREE.Group();
      door.name = `Facility door: ${text}`;
      door.position.set(x, 0, -2.36);
      root.add(door);
      box([width + 0.16, 3.9, 0.12], 0x455b60, door, [0, 1.95, 0]);
      box([width, 3.7, 0.08], 0x294c63, door, [0, 1.91, -0.09]);
      box([width - 0.16, 0.38, 0.03], 0x9caeac, door, [0, 0.3, -0.15]);
      box([0.055, 0.48, 0.08], 0xdce8e9, door, [width * 0.35, 1.6, -0.17]);
      const plaque = createTextSign(text, 0xffffff);
      plaque.name = `Facility label: ${text}`;
      plaque.position.set(0, 3.15, -0.151);
      plaque.scale.set(width - 0.18, 0.43, 1);
      door.add(plaque);
    };

    if (label === 'RESTROOMS') {
      addDoor(-2.48, 1.85, 'MEN');
      addDoor(-0.12, 1.85, 'WOMEN');
      addDoor(2.38, 2.12, 'ACCESSIBLE');
      return;
    }

    addDoor(-2.25, 1.95, label === 'FIRST AID' ? 'MEDICAL' : 'STAFF');
    if (label === 'FIRST AID') {
      box([3.4, 2.95, 0.08], accent, root, [1.35, 2.15, -2.37]);
      box([0.5, 1.65, 0.08], 0xffffff, root, [1.35, 2.35, -2.45]);
      box([1.65, 0.5, 0.08], 0xffffff, root, [1.35, 2.35, -2.46]);
      const sign = createTextSign('FIRST AID POINT', 0xffffff);
      sign.position.set(1.35, 1.1, -2.43);
      sign.scale.set(2.8, 0.4, 1);
      root.add(sign);
    } else {
      box([3.75, 2.4, 0.12], 0x455b60, root, [1.3, 2.5, -2.35]);
      box([3.5, 2.15, 0.05], 0x315a65, root, [1.3, 2.5, -2.44]);
      box([0.07, 2.15, 0.06], 0xa5b5b1, root, [1.3, 2.5, -2.49]);
      box([3.9, 0.12, 0.45], 0x91a29c, root, [1.3, 1.32, -2.33]);
      const sign = createTextSign('STADIUM INFORMATION', 0xffdf75);
      sign.position.set(1.3, 2.8, -2.5);
      sign.scale.set(3.1, 0.44, 1);
      root.add(sign);
    }
  }

  function createBroadcastCrews(scene) {
    const stations = [
      ['finish', 35, 0.15, 9, 61, 0],
      ['back-turn', -31, 0.15, -9, -58, -13],
      ['infield', 7, 0.15, 15, 0, 34],
      ['north-balcony', 39, 13.5, 71, 0, 31],
      ['south-balcony', -39, 13.5, -71, 0, -31],
      ['east-balcony', 105, 13.5, 29, 60, 8],
      ['west-balcony', -105, 13.5, -29, -60, -8],
      ['infield-west', -20, 0.15, 10, -50, 20],
    ];
    CAMERA_BAY_ANGLES.forEach((angle, index) => {
      const position = oval(85.35, 54.6, angle);
      const floor = HD.CONFIG.grandstandBaseHeight + 1.5;
      const target = oval(62, 34, angle);
      stations.push(['seating-bay-' + index, position.x, floor, position.z,
        target.x, target.z]);
      const bay = new THREE.Group();
      bay.name = 'Reserved seating camera bay ' + index;
      bay.position.set(position.x, floor, position.z);
      bay.rotation.y = Math.atan2(target.x - position.x, target.z - position.z);
      scene.add(bay);
      box([8, 0.22, 4.8], ARENA_COLORS.concrete, bay, [0, -0.11, 0]);
      for (const side of [-1, 1]) {
        box([0.12, 1.25, 4.8], ARENA_COLORS.railing, bay, [side * 3.9, 0.625, 0]);
      }
      box([8, 1.25, 0.12], ARENA_COLORS.railing, bay, [0, 0.625, -2.35]);
      const sign = createTextSign('CAMERA CREW', 0xffdf75);
      sign.position.set(0, 0.6, 2.42);
      sign.rotation.y = 0;
      sign.scale.set(3.6, 0.65, 1);
      bay.add(sign);
      HD.world.barriers.push({
        type: 'box', x: position.x, z: position.z, angle: bay.rotation.y,
        halfWidth: 4, halfDepth: 2.4, minY: floor - 0.3, maxY: floor + 5,
      });
    });
    HD.world.broadcastCameras = stations.map(([id, x, y, z, tx, tz]) => {
      const root = new THREE.Group();
      root.name = 'Broadcast crew: ' + id;
      root.position.set(x, y, z);
      const crewScale = 1.45;
      root.scale.setScalar(crewScale);
      root.rotation.y = Math.atan2(tx - x, tz - z);
      scene.add(root);
      const dark = 0x27333e;
      box([2.7, 0.1, 2.8], 0x747e83, root, [0, 0.05, -0.25]);
      for (let leg = 0; leg < 3; leg++) {
        const angle = leg / 3 * Math.PI * 2;
        const bottom = new THREE.Vector3(Math.cos(angle) * 0.8, 0.12, Math.sin(angle) * 0.8);
        const top = new THREE.Vector3(0, 2.75, 0);
        const direction = top.clone().sub(bottom);
        const support = cylinder(0.055, 0.085, direction.length(), dark, root);
        support.position.copy(bottom).add(top).multiplyScalar(0.5);
        support.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
      }
      box([0.85, 0.7, 1.3], dark, root, [0, 3.02, 0.15]);
      const lens = cylinder(0.24, 0.29, 0.5, 0x111b24, root, [0, 3.02, 1]);
      lens.rotation.x = Math.PI / 2;
      box([0.5, 0.35, 0.08], 0x76b9c6, root, [-0.56, 3.09, -0.23]);
      for (const side of [-1, 1]) {
        cylinder(0.15, 0.17, 1.3, dark, root, [side * 0.24, 0.88, -1.05], 8);
        box([0.37, 0.2, 0.6], dark, root, [side * 0.24, 0.2, -0.94]);
        const arm = cylinder(0.12, 0.14, 0.92, 0x266990, root, [side * 0.48, 2.15, -0.66], 8);
        arm.rotation.x = -0.7;
      }
      cylinder(0.4, 0.33, 1.1, 0x266990, root, [0, 2.05, -1.05], 10);
      sphere(0.34, 0xd7a67e, root, [0, 2.97, -1.05]);
      sphere(0.13, dark, root, [-0.33, 2.98, -1.05]);
      const target = new THREE.Vector3(tx, 2, tz);
      const camera = new THREE.PerspectiveCamera(48, 16 / 9, 0.1, 450);
      camera.name = 'Replay viewpoint: ' + id;
      camera.position.set(x, y + 3.02 * crewScale, z);
      camera.lookAt(target);
      scene.add(camera);
      if (y > 1) HD.world.barriers.push({ x, z, radius: 2.6 });
      return { id, root, camera, target };
    });
  }

  function createInfieldPond(scene) {
    const root = new THREE.Group();
    root.name = "Landscaped infield pond and fountain";
    root.position.set(-10, 0, -10);
    scene.add(root);

    const rim = mesh(new THREE.TorusGeometry(1, 0.11, 8, 48), 0xc5c9c4, root, [0, 0.19, 0]);
    rim.scale.set(9.8, 4.8, 1);
    rim.rotation.x = Math.PI / 2;
    const water = mesh(
      new THREE.CircleGeometry(1, 48),
      0x3e9fc3,
      root,
      [0, 0.18, 0],
      { transparent: true, opacity: 0.82, roughness: 0.22, metalness: 0.08 },
    );
    water.rotation.x = -Math.PI / 2;
    water.scale.set(9.5, 4.5, 1);

    cylinder(0.7, 1.05, 0.44, 0xc5c9c4, root, [0, 0.3, 0], 16);
    cylinder(0.16, 0.24, 2.4, 0xe7f6fb, root, [0, 1.68, 0], 12);
    const spray = mesh(
      new THREE.ConeGeometry(0.72, 1.65, 10, 1, true),
      0xa5e2ef,
      root,
      [0, 2.72, 0],
      { transparent: true, opacity: 0.48, side: THREE.DoubleSide },
    );
    spray.rotation.x = Math.PI;

    for (let index = 0; index < 12; index++) {
      const angle = index / 12 * Math.PI * 2;
      const x = Math.cos(angle) * 10.8;
      const z = Math.sin(angle) * 5.7;
      sphere(0.68, index % 3 ? 0x3b7d41 : 0x6ca952, root, [x, 0.62, z]);
      if (index % 2 === 0) {
        sphere(0.24, 0xf1c65b, root, [x * 0.98, 1.1, z * 0.98]);
      }
    }
  }

  function createConcourseFloorFinish(scene) {
    const zones = [
      [109.2, 74.9, 103.45, 69.95, 0x9da7a3],
      [119.78, 82.78, 116.1, 79.15, 0x899794],
    ];

    for (const [outerX, outerZ, innerX, innerZ, color] of zones) {
      for (let segment = 0; segment < 8; segment++) {
        createSolidOvalSegment(
          scene,
          outerX,
          outerZ,
          innerX,
          innerZ,
          13.54,
          color,
          segment / 8 * Math.PI * 2,
          (segment + 1) / 8 * Math.PI * 2,
          14,
          13.5,
        );
      }
    }

    for (const [radiusX, radiusZ, color] of [
      [109.3, 75, 0x315f91],
      [116, 79.05, 0xc89b39],
    ]) {
      const points = [];
      const indices = [];
      const segments = 256;
      for (let index = 0; index <= segments; index++) {
        const angle = index / segments * Math.PI * 2;
        for (const offset of [-0.12, 0.12]) {
          points.push(
            Math.cos(angle) * (radiusX + offset),
            13.555,
            Math.sin(angle) * (radiusZ + offset),
          );
        }
        if (index < segments) {
          const vertex = index * 2;
          indices.push(vertex, vertex + 2, vertex + 1, vertex + 1, vertex + 2, vertex + 3);
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      const stripe = new THREE.Mesh(geometry, HD.util.material(color));
      stripe.name = 'Flush concourse wayfinding stripe';
      stripe.receiveShadow = true;
      scene.add(stripe);
    }
  }

  function createStairArrivalMarkers(scene) {
    HD.world.stairArrivalMarkers = [];
    STAIR_ANGLES.forEach((angle, index) => {
      const start = oval(HD.CONFIG.stairs.startX, HD.CONFIG.stairs.startZ, angle);
      const end = oval(HD.CONFIG.stairs.endX, HD.CONFIG.stairs.endZ, angle);
      const direction = end.clone().sub(start);
      const marker = new THREE.Group();
      marker.name = `Concourse stair arrival ${index + 1}`;
      marker.position.copy(end).setY(13.5);
      marker.rotation.y = Math.atan2(direction.x, direction.z);
      scene.add(marker);
      HD.world.stairArrivalMarkers.push(marker);

      const postOffset = HD.CONFIG.stairs.width / 2 + 0.46;
      for (const side of [-1, 1]) {
        box(
          [0.3, 4.9, 0.3],
          ARENA_COLORS.railing,
          marker,
          [side * postOffset, 2.45, 0.55],
        );
        const postPosition = new THREE.Vector3(side * postOffset, 0, 0.55)
          .applyAxisAngle(new THREE.Vector3(0, 1, 0), marker.rotation.y)
          .add(marker.position);
        HD.world.structuralBarriers.push({
          x: postPosition.x,
          z: postPosition.z,
          radius: 0.36,
          minY: 13.5,
          maxY: 18.4,
        });
      }
      box(
        [HD.CONFIG.stairs.width + 1.2, 0.58, 0.42],
        0x274f72,
        marker,
        [0, 4.72, 0.55],
      );
      const sign = createTextSign(`SECTION ${String.fromCharCode(65 + index)}`, 0xffdf75);
      sign.position.set(0, 4.72, 0.32);
      sign.scale.set(5.2, 0.66, 1);
      marker.add(sign);

      for (const offset of [-1.6, 0, 1.6]) {
        box([1.05, 0.035, 0.34], 0x315f91, marker, [offset, 0.055, -0.65]);
      }
    });
  }

 function createFloodlightTowers(scene) {
    // Keep every mast centered between public stair axes. A previous tower at
    // 4.55 radians pierced the west upper flight at 1.5 PI.
    const angles = [0.42, 1.13, 2.08, 3.56, 4.24, 5.36];
    const root = new THREE.Group();
    root.name = "Stadium floodlight towers";
    scene.add(root);
    angles.forEach((angle) => {
      const position = oval(133, 91, angle);
      const tower = new THREE.Group();
      tower.position.set(position.x, 0, position.z);
      tower.rotation.y = -angle + Math.PI / 2;
      root.add(tower);
      cylinder(0.42, 0.76, 27, 0x48565a, tower, [0, 13.5, 0], 10);
      box([7.2, 2.5, 0.75], 0x364348, tower, [0, 27.5, 0]);
      for (let lamp = -2; lamp <= 2; lamp++) {
        const panel = box([1.05, 1.5, 0.15], 0xf5e6a4, tower, [lamp * 1.28, 27.5, -0.48]);
        panel.material.emissive.setHex(0xffc95b);
        panel.material.emissiveIntensity = 1.45;
      }
      for (const side of [-1, 1]) {
        const brace = cylinder(0.11, 0.11, 9.2, 0x48565a, tower, [side * 2.8, 4.4, 0], 8);
        brace.rotation.z = side * -0.55;
      }
    });
  }

  function createExteriorEntrance(scene) {
    const root = new THREE.Group();
    root.name = "Main public entrance plaza";
    root.position.set(0, 0, -112);
    scene.add(root);
    for (const side of [-1, 1]) {
      box([15, 8.5, 3.2], ARENA_COLORS.concrete, root, [side * 12.5, 4.25, 0]);
      HD.world.barriers.push({
        type: 'box', x: side * 12.5, z: -112, angle: 0,
        halfWidth: 7.7, halfDepth: 1.8, minY: -0.5, maxY: 8.5,
      });
    }
    box([10, 2, 3.2], ARENA_COLORS.concrete, root, [0, 7.5, 0]);
    box([44, 1.1, 7.2], 0x304c60, root, [0, 9.1, 1.8]);
    box([50, 0.5, 26], 0xc6c0ac, root, [0, -0.35, -11]);
    createUpperAisle(scene, new THREE.Vector3(0, -0.1, -112),
      new THREE.Vector3(0, 13.5, -82.8), 'main-entrance', 8);
    HD.world.arenaSurfaces.push({
      id: 'main-entrance-plaza', bounds: [-24, 24, -135, -111], y: -0.1,
    });
    for (let index = -3; index <= 3; index++) {
      if (index === 0) continue;
      box([3.5, 4.8, 0.18], 0x1f4b6d, root, [index * 4.7, 3.1, -1.7]);
      cylinder(0.12, 0.14, 4.3, 0xeff3ee, root, [index * 4.7 - 1.35, 2.55, -2.05], 8);
    }
    const sign = createTextSign("HOTDOG DOWNS • MAIN ENTRANCE", 0xffdf75);
    sign.position.set(0, 6.9, -1.82);
    sign.scale.set(14.5, 1.1, 1);
    root.add(sign);
    for (const side of [-1, 1]) {
      const light = box([1.2, 3.1, 1.2], 0x40545b, root, [side * 23, 3.6, -5.5]);
      const lamp = sphere(0.38, 0xffe39a, light, [0, 1.75, 0]);
      lamp.material.emissive.setHex(0xffb948);
      lamp.material.emissiveIntensity = 1.3;
    }
  }

  function createSecondaryEntrances(scene) {
    HD.world.publicEntrances = [];
    SECONDARY_ENTRANCE_ANGLES.forEach((angle, index) => {
      const root = new THREE.Group();
      root.name = `Secondary public entrance ${index + 1}`;
      root.position.copy(oval(126, 86, angle));
      root.rotation.y = -angle + Math.PI / 2;
      scene.add(root);

      box([19, 0.24, 13], 0xbfc1b8, root, [0, -0.05, 4]);
      for (const side of [-1, 1]) {
        box([4.1, 6.6, 2.3], ARENA_COLORS.concrete, root, [side * 6.1, 3.3, 0]);
        box([0.26, 3.9, 0.18], 0x294f62, root, [side * 4.08, 2.05, 1.23]);
      }
      box([8.3, 1.15, 2.3], ARENA_COLORS.concrete, root, [0, 6.03, 0]);
      box([15.5, 0.55, 5.8], 0x315f78, root, [0, 7.05, 1.55]);

      for (let door = 0; door < 3; door++) {
        const x = -2.8 + door * 2.8;
        box([2.25, 4.4, 0.16], 0x316c89, root, [x, 2.2, 1.25]);
        box([0.08, 0.42, 0.1], 0xe7d58c, root, [x + 0.7, 2.05, 1.36]);
      }

      const sign = createTextSign(`PUBLIC ENTRY ${String.fromCharCode(65 + index)}`, 0xffdf75);
      sign.position.set(0, 6.08, 1.28);
      sign.rotation.y = 0;
      sign.scale.set(7.8, 0.78, 1);
      root.add(sign);

      for (const side of [-1, 1]) {
        cylinder(0.1, 0.14, 4.5, 0x3f5053, root, [side * 8.1, 2.25, 4.7], 8);
        const lamp = box([0.8, 0.42, 0.22], 0xffe3a0, root, [side * 8.1, 4.62, 4.55]);
        lamp.material.emissive.setHex(0xffbd4a);
        lamp.material.emissiveIntensity = 1.1;
      }

      root.updateMatrixWorld(true);
      for (const side of [-1, 1]) {
        const position = root.localToWorld(new THREE.Vector3(side * 6.1, 0, 0));
        HD.world.barriers.push({
          type: 'box',
          x: position.x,
          z: position.z,
          angle: root.rotation.y,
          halfWidth: 2.2,
          halfDepth: 1.35,
          minY: -0.2,
          maxY: 7.5,
        });
      }
      HD.world.publicEntrances.push(root);
    });
  }

  function createCommentatorStairGlassReturns(scene) {
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0xb6ebef,
      transparent: true,
      opacity: 0.24,
      roughness: 0.1,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const bottomY = 13.5;
    const topY = 15.7;
    const addGuardRun = (start, end, panelCount) => {
      addBoothWindowRun(
        scene,
        start,
        end,
        bottomY,
        topY,
        panelCount,
        glass,
      );
      createBoothWall(
        scene,
        start,
        end,
        bottomY,
        bottomY + 0.1,
        0x526970,
        0.14,
      );
      createBoothWall(
        scene,
        start,
        end,
        topY - 0.1,
        topY,
        0x526970,
        0.14,
      );
    };

    for (const side of [-1, 1]) {
      const angle = COMMENTATOR_ANGLE +
        side * COMMENTATOR_STAIR_HALF_ANGLE;
      const inner = oval(103.25, 69.75, angle);
      const outer = oval(114.15, 78.05, angle);
      addGuardRun(inner, outer, 4);
    }

    for (const side of [-1, 1]) {
      const angle = COMMENTATOR_ANGLE + side * COMMENTATOR_HALF_ANGLE;
      const inner = oval(103.25, 69.75, angle);
      const outer = oval(110.55, 75.55, angle);
      addGuardRun(inner, outer, 3);
    }

    addGuardRun(
      oval(
        110.55,
        75.55,
        COMMENTATOR_ANGLE - COMMENTATOR_HALF_ANGLE,
      ),
      oval(
        110.55,
        75.55,
        COMMENTATOR_ANGLE - COMMENTATOR_STAIR_HALF_ANGLE,
      ),
      2,
    );
    addGuardRun(
      oval(
        110.55,
        75.55,
        COMMENTATOR_ANGLE + COMMENTATOR_STAIR_HALF_ANGLE,
      ),
      oval(
        110.55,
        75.55,
        COMMENTATOR_ANGLE + COMMENTATOR_HALF_ANGLE,
      ),
      2,
    );
  }

  function createCurvedGlassRail(
    scene,
    radiusX,
    radiusZ,
    baseY,
    height,
    segments,
    allowStairOpenings,
  ) {
    const panels = [];
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0xb6ebef,
      transparent: true,
      opacity: height > 3 ? 0.32 : 0.24,
      roughness: 0.1,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    for (let index = 0; index < segments; index++) {
      const angleA = (index / segments) * Math.PI * 2;
      const angleB = ((index + 1) / segments) * Math.PI * 2;
      let visibleSpans = [[angleA, angleB]];

      if (allowStairOpenings) {
        const openings = glassRailOpenings(radiusX, radiusZ);
        openings.forEach(([openingStart, openingEnd]) => {
          visibleSpans = subtractAngleOpening(
            visibleSpans,
            openingStart,
            openingEnd,
          );
        });
      }

      visibleSpans.forEach(([spanStart, spanEnd]) => {
        if (spanEnd - spanStart < 0.002) return;
        const start = oval(radiusX, radiusZ, spanStart);
        const end = oval(radiusX, radiusZ, spanEnd);
        panels.push({ start, end });
      });
    }

    const glassBatch = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      glass,
      panels.length,
    );
    const frameBatch = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      HD.util.material(0x526970),
      panels.length * 2,
    );
    const railBatch = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      HD.util.material(0x526970),
      panels.length * 2,
    );
    const dummy = new THREE.Object3D();

    panels.forEach(({ start, end }, index) => {
      const length = start.distanceTo(end);
      dummy.position.copy(start).add(end).multiplyScalar(0.5);
      dummy.position.y = baseY + height / 2;
      dummy.rotation.set(0, -Math.atan2(end.z - start.z, end.x - start.x), 0);
      // Overlap behind each mullion so oblique views cannot reveal a seam.
      dummy.scale.set(length + 0.04, height, 0.09);
      dummy.updateMatrix();
      glassBatch.setMatrixAt(index, dummy.matrix);

      [start, end].forEach((edge, edgeIndex) => {
        dummy.position.set(edge.x, baseY + height / 2, edge.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(0.08, height + 0.12, 0.12);
        dummy.updateMatrix();
        frameBatch.setMatrixAt(index * 2 + edgeIndex, dummy.matrix);
      });

      for (let edge = 0; edge < 2; edge++) {
        dummy.position.copy(start).add(end).multiplyScalar(0.5);
        dummy.position.y = baseY + edge * height;
        dummy.rotation.set(0, -Math.atan2(end.z - start.z, end.x - start.x), 0);
        dummy.scale.set(length, 0.1, 0.14);
        dummy.updateMatrix();
        railBatch.setMatrixAt(index * 2 + edge, dummy.matrix);
      }
    });

    glassBatch.renderOrder = 2;
    glassBatch.userData.concourseGlass = true;
    glassBatch.userData.panelCount = panels.length;
    glassBatch.userData.completeOuterRing = !allowStairOpenings;
    glassBatch.instanceMatrix.needsUpdate = true;
    frameBatch.instanceMatrix.needsUpdate = true;
    railBatch.instanceMatrix.needsUpdate = true;
    scene.add(glassBatch, frameBatch, railBatch);
  }

  function glassRailOpenings(radiusX, radiusZ) {
    const fullTurn = Math.PI * 2;
    const openings = [];

    STAIR_ANGLES.forEach((angle) => {
      const halfAngle = stairHalfAngle(radiusX, radiusZ, angle);
      let start = angle - halfAngle;
      let end = angle + halfAngle;

      if (start < 0) {
        openings.push([0, end], [fullTurn + start, fullTurn]);
        return;
      }
      if (end > fullTurn) {
        openings.push([start, fullTurn], [0, end - fullTurn]);
        return;
      }
      openings.push([start, end]);
    });

    return openings;
  }

  function subtractAngleOpening(spans, openingStart, openingEnd) {
    const result = [];
    spans.forEach(([spanStart, spanEnd]) => {
      if (spanEnd <= openingStart || spanStart >= openingEnd) {
        result.push([spanStart, spanEnd]);
        return;
      }
      if (spanStart < openingStart) {
        result.push([spanStart, openingStart]);
      }
      if (spanEnd > openingEnd) {
        result.push([openingEnd, spanEnd]);
      }
    });
    return result;
  }

  function addShopWorker(parent, color, position, scale) {
    const worker = HD.Models.playerCharacter(color, {
      hat: "cap",
      skin: 0xc88962,
    });
    HD.Models.setPlayerStanding(worker, true);
    worker.position.set(...position);
    worker.scale.setScalar(scale);
    parent.add(worker);
  }

  function createTextSign(text, color) {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const context = canvas.getContext("2d");
    context.fillStyle = "#17382a";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
    context.font = "900 54px sans-serif";
    const width = context.measureText(text).width;
    if (width > 472) context.font = `900 ${Math.max(16, Math.floor(54 * 472 / width))}px sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, canvas.width / 2, canvas.height / 2 + 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }),
    );
    sign.rotation.y = Math.PI;
    return sign;
  }

  function createRaisedRing(scene, outerX, outerZ, innerX, innerZ, height, color) {
    createSolidOvalSegment(
      scene,
      outerX,
      outerZ,
      innerX,
      innerZ,
      height,
      color,
      0,
      Math.PI * 2,
      96,
    );
  }

  function createSolidOvalRing(
    parent,
    outerX,
    outerZ,
    innerX,
    innerZ,
    height,
    color,
    segments,
  ) {
    const shape = new THREE.Shape();
    shape.absellipse(0, 0, outerX, outerZ, 0, Math.PI * 2, false);
    const hole = new THREE.Path();
    hole.absellipse(0, 0, innerX, innerZ, 0, Math.PI * 2, true);
    shape.holes.push(hole);

    const foundationBottom = -0.55;
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: height - foundationBottom,
      bevelEnabled: false,
      curveSegments: segments,
      steps: 1,
    });
    geometry.rotateX(-Math.PI / 2);

    const structure = new THREE.Mesh(geometry, HD.util.material(color));
    structure.position.y = foundationBottom;
    structure.castShadow = false;
    structure.receiveShadow = true;
    parent.add(structure);
    return structure;
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
      const config = HD.CONFIG.items[type];
      const fallbackScale = type === "horseshoe" ? 0.85 : type === "chair" ? 0.48 : 0.7;
      const heldScale = config.heldScale || fallbackScale;
      item.scale.setScalar(heldScale);
      item.position.set(-0.06, 0.24, -0.03);
      if (type === "hotdog" || type === "goldenHotdog") {
        // Present the sausage and toppings toward the seated camera.
        item.rotation.set(1.12, -0.1, 0.08);
        item.position.set(-0.12, 0.3, -0.02);
      }
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
    const aimMaterial = new THREE.LineBasicMaterial({
      color: 0xffe25d,
      transparent: true,
      opacity: 0.9,
    });
    HD.world.trajectory = new THREE.Line(new THREE.BufferGeometry(), aimMaterial);
    HD.world.trajectory.frustumCulled = false;
    scene.add(HD.world.trajectory);
    HD.world.trajectory.visible = false;
    HD.world.trajectoryGlow = new THREE.Points(
      HD.world.trajectory.geometry,
      new THREE.PointsMaterial({
        color: 0xfff1a0,
        size: 0.16,
        transparent: true,
        opacity: 0.7,
        sizeAttenuation: true,
      }),
    );
    HD.world.trajectoryGlow.frustumCulled = false;
    HD.world.trajectoryGlow.visible = false;
    scene.add(HD.world.trajectoryGlow);
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

    const iconColors = [
      0xff5b5b,
      0x4bc879,
      0x4aa4ff,
      0xffc84b,
      0x9d6cff,
      0x55d6d0,
      0xe55777,
      0x5a8fdb,
      0xf28b3c,
    ];
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
    if (time - HD.world.lastBettingDisplayUpdate >= 0.25) {
      HD.world.lastBettingDisplayUpdate = time;
      drawBettingDisplays();
    }
    const gate = HD.world.startingGate;
    if (gate) {
      const racing = HD.state.phase === 'racing';
      const opened = racing || HD.state.phase === 'finished';
      gate.userData.doors.forEach(door => { door.rotation.y = opened ? -Math.PI / 2 : 0; });
      gate.position.x = racing ? -30 * THREE.MathUtils.smoothstep(HD.state.raceTime, 1.5, 5) :
        HD.state.phase === 'finished' ? -30 : 0;
    }
    HD.world.crowd.forEach((p, i) => {
      if (i % 3 === 0) HD.Models.animateCharacter(p, time, true);
    });
    HD.world.players.forEach((player) => {
      if (!player.userData.staticPlaceholder) {
        HD.Models.animateCharacter(player, time, true);
      }
    });
    if (HD.world.localPlayer) HD.Models.animateCharacter(HD.world.localPlayer, time, true);
    if (HD.world.raceBoard && time - HD.world.raceBoard.lastUpdate >= 1) {
      HD.world.raceBoard.lastUpdate = time;
      drawRaceBoard();
    }
    if (HD.world.replayBillboard && time - HD.world.replayBillboard.lastUpdate >= 1) {
      HD.world.replayBillboard.lastUpdate = time;
      drawReplayBillboard();
    }
  }
  return {
    build,
    refreshTrackLayout,
    update,
    oval,
    assignLocalSeat,
    playerSeatPlacement,
    refreshLocalPlayer,
    refreshScoreboard: drawRaceBoard,
    refreshReplayBillboard: drawReplayBillboard,
    refreshBettingDisplays: drawBettingDisplays,
    refreshStartingGate,
    upperWalkSurfaceAt,
  };
})();
