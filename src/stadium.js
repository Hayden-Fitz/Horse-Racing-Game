"use strict";
HD.Stadium = (() => {
  const { mesh, box, sphere, cylinder } = HD.util;
  const STAIR_ANGLES = [
    0,
    Math.PI / 2,
    Math.PI,
    (Math.PI * 3) / 2,
  ];
  const GRANDSTAND_COLUMNS = 256;
  const UPPER_CONCOURSE_Y = 13.5;
  const STAIR_SURFACE_INSET = 0.055;
  const HORSE_TUNNEL_ANGLE = Math.PI - 0.52;
  const HORSE_TUNNEL_HALF_ANGLE = 0.095;
  const ARENA_COLORS = Object.freeze({
    concrete: 0xc6c8c6,
    concreteDark: 0x7b8281,
    railing: 0x205b8f,
    lowerSeats: 0xe5b833,
    middleSeats: 0x438557,
    upperSeats: 0x2e6eb3,
  });
  const ELEVATED_SEATING = Object.freeze([
    // Deliberately uneven: these are additions to a stadium that has grown in
    // phases, rather than a perfectly mirrored generated bowl.
    { floor: 2, start: 0.12, end: 0.72, baseY: 13.7 },
    { floor: 2, start: 1.08, end: 2.08, baseY: 13.7 },
    { floor: 2, start: 3.18, end: 4.08, baseY: 13.7 },
    { floor: 2, start: 4.62, end: 5.42, baseY: 13.7 },
    { floor: 3, start: 1.18, end: 1.98, baseY: 19.2 },
    { floor: 3, start: 4.77, end: 5.27, baseY: 19.2 },
  ]);
  const DETAILED_SEATS = [
    { row: 1, column: 60, local: true, activity: "watch" },
    { row: 1, column: 59, activity: "phone" },
    { row: 1, column: 58, activity: "watch" },
    { row: 3, column: 60, activity: "throw" },
    { row: 3, column: 59, activity: "watch" },
    { row: 5, column: 60, activity: "phone" },
    { row: 5, column: 59, activity: "watch" },
    { row: 5, column: 58, activity: "throw" },
  ];

  // ---------------------------------------------------------------------------
  // Track and stadium shell
  // ---------------------------------------------------------------------------

  function build(scene) {
    HD.world.projectileBarriers = [];
    HD.world.commentatorBox = undefined;
    HD.world.commentators = [];

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
    const track = new THREE.Mesh(trackGeo, HD.util.material(0xa96543));
    track.position.y = 0.03;
    track.receiveShadow = true;
    scene.add(track);
    createDetailedInfieldGrass(scene);
    refreshTrackLayout(scene);
    addFinishLine(scene);
    addOvalRails(scene, 48.5, 21.5, 0xf5e8c8);
    addOvalRails(scene, 74, 44, ARENA_COLORS.railing);
    const infield = mesh(new THREE.CylinderGeometry(1, 1, 0.1, 8), 0x519847, scene);
    infield.visible = false;
    createOvalGrandstands(scene);
    createBackground(scene);
    createInfield(scene);
    createConcourseDetails(scene);
    createPlayerRoutes(scene);
    createArenaLandmarks(scene);
    batchStaticArchitecture(scene);
    createNearbyPlayers(scene);
    createViewModels(scene);
    HD.world.track = track;
    return track;
  }
  function batchStaticArchitecture(scene) {
    scene.updateMatrixWorld(true);
    const groups = new Map();
    scene.traverseVisible((object) => {
      if (!object.isMesh || object.isInstancedMesh || object.children.length) return;
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
  function addOvalRails(scene, rx, rz, color) {
    const root = new THREE.Group();
    scene.add(root);
    const lowerRail = [];
    const upperRail = [];
    for (let i = 0; i <= 128; i++) {
      const a = (i / 128) * Math.PI * 2;
      lowerRail.push(oval(rx, rz, a).setY(2.15));
      upperRail.push(oval(rx, rz, a).setY(3.55));
      if (i % 4 === 0) {
        const p = oval(rx, rz, a);
        cylinder(0.1, 0.13, 3.75, color, root, [p.x, 1.875, p.z], 7);
      }
    }
    [lowerRail, upperRail].forEach((points) => {
      root.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({ color }),
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

  function addDistanceMarkers(scene) {
    const markerAngles = [Math.PI / 2, Math.PI, Math.PI * 1.5];

    markerAngles.forEach((angle, index) => {
      const position = oval(74.5, 45.5, angle);
      cylinder(0.12, 0.16, 3.6, 0xf4df9f, scene, [position.x, 1.8, position.z], 8);

      const marker = box([1.8, 1.25, 0.16], 0xffffff, scene, [position.x, 3.8, position.z]);
      marker.rotation.y = -angle + Math.PI / 2;
      marker.material.emissive.setHex(index % 2 ? 0x12261d : 0x2b160c);
      marker.material.emissiveIntensity = 0.08;
    });
  }
  function createOvalGrandstands(scene) {
    const root = new THREE.Group();
    scene.add(root);
    HD.world.crowd = [];
    const rows = 7;
    const columns = GRANDSTAND_COLUMNS;
    const count = rows * columns;
    const dummy = new THREE.Object3D();
    const colors = [0xd94f31, 0x447fc1, 0xf0bd3b, 0x7e59a4, 0x3d8951, 0xd97d35];
    const throwerSeats = chooseCrowdThrowerSeats(rows, columns);

    const seatBases = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1.35, 0.22, 1.25),
      HD.util.material(ARENA_COLORS.lowerSeats),
      count,
    );
    const seatBacks = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1.35, 1.25, 0.18),
      HD.util.material(0xc69623),
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
        const rx = 82.1 + row * 3.25;
        const rz = 51.85 + row * 2.75;
        const position = oval(rx, rz, angle);
        const yaw = -angle + Math.PI / 2;
        const tierTop = HD.CONFIG.grandstandBaseHeight + row * 1.5;

        setInstance(dummy, seatBases, instance, position.x, tierTop + 0.11, position.z, yaw);
        setInstance(
          dummy,
          seatBacks,
          instance,
          position.x + Math.cos(angle) * 0.6,
          tierTop + 0.72,
          position.z + Math.sin(angle) * 0.6,
          yaw,
        );
        setInstance(
          dummy,
          crowdBodies,
          instance,
          position.x,
          tierTop + 1.25,
          position.z,
          yaw,
        );
        setInstance(
          dummy,
          crowdHeads,
          instance,
          position.x,
          tierTop + 2.18,
          position.z,
          yaw,
        );
        crowdBodies.setColorAt(instance, new THREE.Color(colors[(column + row) % colors.length]));

        const detailedPlayerSeat = DETAILED_SEATS.some(
          (seat) => seat.row === row && seat.column === column,
        );
        const inStairAisle = STAIR_ANGLES.some(
          (stairAngle) =>
            angleDistance(angle, stairAngle) < stairHalfAngle(rx, rz, stairAngle),
        );
        const overHorsePassage = row < 5 && angleDistance(angle, HORSE_TUNNEL_ANGLE) < HORSE_TUNNEL_HALF_ANGLE + 0.02;
        if (detailedPlayerSeat || inStairAisle || overHorsePassage) {
          [seatBases, seatBacks, crowdBodies, crowdHeads].forEach((batch) => {
            hideInstance(dummy, batch, instance);
          });
        }
        instance++;
      }
    }

    crowdBodies.instanceColor.needsUpdate = true;
    createCrowdThrowers(scene, throwerSeats, colors);
    createElevatedGrandstandSections(root);
    createOvalCanopy(root);
  }

  function createElevatedGrandstandSections(root) {
    HD.world.arenaSurfaces = [];
    ELEVATED_SEATING.forEach((section, index) => {
      createElevatedGrandstandSection(root, section, index);
    });
  }

  function createElevatedGrandstandSection(root, section, sectionIndex) {
    const floorTwo = section.floor === 2;
    const rows = floorTwo ? 4 : 3;
    const columns = Math.max(12, Math.round((section.end - section.start) * 85 / 1.65));
    const count = rows * columns;
    const color = floorTwo ? ARENA_COLORS.middleSeats : ARENA_COLORS.upperSeats;
    const seatBases = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1.28, 0.24, 1.18),
      HD.util.material(color),
      count,
    );
    const seatBacks = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1.28, 1.12, 0.19),
      HD.util.material(floorTwo ? 0x326b45 : 0x255b94),
      count,
    );
    const dummy = new THREE.Object3D();
    const innerX = floorTwo ? 104.5 : 116;
    const innerZ = floorTwo ? 70.8 : 80.4;
    const rowStepX = floorTwo ? 2.05 : 1.82;
    const rowStepZ = floorTwo ? 1.72 : 1.48;
    const aisleAngle = (section.start + section.end) / 2;
    const aisleHalfAngle = 2.5 / Math.hypot(
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
        if (Math.abs(angle - aisleAngle) < aisleHalfAngle + 0.014) {
          hideInstance(dummy, seatBases, instance);
          hideInstance(dummy, seatBacks, instance);
          continue;
        }
        setInstance(dummy, seatBases, instance, position.x, deckY + 0.14, position.z, yaw);
        setInstance(
          dummy,
          seatBacks,
          instance,
          position.x + Math.cos(angle) * 0.55,
          deckY + 0.67,
          position.z + Math.sin(angle) * 0.55,
          yaw,
        );
      }
    }

    [seatBases, seatBacks].forEach((batch) => {
      batch.castShadow = false;
      batch.receiveShadow = true;
      batch.instanceMatrix.needsUpdate = true;
      batch.userData.seatingFloor = section.floor;
      batch.userData.seatingSection = sectionIndex;
      root.add(batch);
    });

    const frontX = innerX - 0.54;
    const frontZ = innerZ - 0.54;
    addSectionRail(root, frontX, frontZ, section.start, aisleAngle - aisleHalfAngle, section.baseY);
    addSectionRail(root, frontX, frontZ, aisleAngle + aisleHalfAngle, section.end, section.baseY);
    addGrandstandSupports(root, section, frontX + 1.45, frontZ + 1.25);
    const start = oval(floorTwo ? 103.25 : 112.7, floorTwo ? 69.75 : 77.68, aisleAngle);
    const end = oval(innerX + rows * rowStepX, innerZ + rows * rowStepZ, aisleAngle);
    start.y = floorTwo ? 13.5 : 17.24;
    end.y = section.baseY + (rows - 1) * 1.18;
    createUpperAisle(root, start, end, sectionIndex);
  }

  function createUpperAisle(root, start, end, sectionIndex, width = 4.8) {
    const horizontal = end.clone().sub(start).setY(0);
    const length = horizontal.length();
    const yaw = Math.atan2(horizontal.x, horizontal.z);
    const steps = Math.max(8, Math.ceil((end.y - start.y) / 0.24));
    const group = new THREE.Group();
    group.name = 'Upper seating stair aisle ' + sectionIndex;
    group.position.copy(start);
    group.rotation.y = yaw;
    root.add(group);
    for (let step = 0; step < steps; step++) {
      const height = (end.y - start.y) * (step + 1) / steps;
      box([width, height + 0.25, length / steps + 0.02], ARENA_COLORS.concrete, group,
        [0, (height - 0.25) / 2, (step + 0.5) * length / steps]);
    }
    for (const side of [-1, 1]) {
      const rise = end.y - start.y;
      const rail = box([0.12, 0.12, Math.hypot(length, rise)], ARENA_COLORS.railing, group,
        [side * width / 2, rise / 2 + 2.4, length / 2]);
      rail.rotation.x = -Math.atan2(rise, length);
      for (let post = 0; post <= 4; post++) {
        cylinder(0.07, 0.09, 2.4, ARENA_COLORS.railing, group,
          [side * width / 2, rise * post / 4 + 1.2, length * post / 4], 7);
      }
    }
    HD.world.arenaSurfaces.push({
      id: 'upper-stairs-' + sectionIndex, stairs: true,
      startPoint: start.clone(), endPoint: end.clone(), width,
    });
  }

  function upperWalkSurfaceAt(x, z, previousY) {
    let closest = null;
    for (const surface of HD.world.arenaSurfaces || []) {
      let y;
      if (surface.stairs) {
        const start = surface.startPoint;
        const end = surface.endPoint;
        const dx = end.x - start.x;
        const dz = end.z - start.z;
        const lengthSquared = dx * dx + dz * dz;
        const t = ((x - start.x) * dx + (z - start.z) * dz) / lengthSquared;
        const lateral = Math.abs(dx * (z - start.z) - dz * (x - start.x)) / Math.sqrt(lengthSquared);
        if (t < -0.025 || t > 1.025 || lateral > surface.width / 2) continue;
        y = THREE.MathUtils.lerp(start.y, end.y, THREE.MathUtils.clamp(t, 0, 1));
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
      if (!closest || (surface.stairs && !closest.stairs) ||
          (surface.stairs === closest.stairs && difference < closest.difference)) {
        closest = { y, zone: surface.stairs ? 'stairs' : surface.id, stairs: !!surface.stairs, difference };
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
      points.push(position.setY(y + 1.35));
      cylinder(0.07, 0.085, 1.35, ARENA_COLORS.railing, root, [
        position.x,
        y + 0.675,
        position.z,
      ], 7);
    }
    root.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color: ARENA_COLORS.railing }),
    ));
  }

  function addGrandstandSupports(root, section, radiusX, radiusZ) {
    const supportCount = Math.max(3, Math.round((section.end - section.start) / 0.22));
    for (let index = 0; index <= supportCount; index++) {
      const angle = THREE.MathUtils.lerp(section.start, section.end, index / supportCount);
      const position = oval(radiusX, radiusZ, angle);
      const height = section.baseY - 0.5;
      cylinder(0.42, 0.52, height, ARENA_COLORS.concreteDark, root, [
        position.x,
        height / 2 - 0.5,
        position.z,
      ], 8);
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
        const overHorsePassage = row < 5 && angleDistance(angle, HORSE_TUNNEL_ANGLE) < HORSE_TUNNEL_HALF_ANGLE + 0.02;
        if (!blockedByStairs && !playerSeat && !overHorsePassage) {
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
    return clearsStairs;
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
      for (const [segmentStart, segmentEnd] of excludeHorsePassage(start, end)) {
      createSolidOvalSegment(
        root,
        outerX,
        outerZ,
        innerX,
        innerZ,
        height,
        color,
        segmentStart,
        segmentEnd,
      );
      addTierFasciaSegment(root, outerX, outerZ, height, row, segmentStart, segmentEnd);
      }
      if (row >= 5 && start < HORSE_TUNNEL_ANGLE && end > HORSE_TUNNEL_ANGLE) {
        createSolidOvalSegment(root, outerX, outerZ, innerX, innerZ, height, color,
          HORSE_TUNNEL_ANGLE - HORSE_TUNNEL_HALF_ANGLE,
          HORSE_TUNNEL_ANGLE + HORSE_TUNNEL_HALF_ANGLE, 12, 9);
      }
    }
  }

  function excludeHorsePassage(start, end) {
    const left = HORSE_TUNNEL_ANGLE - HORSE_TUNNEL_HALF_ANGLE;
    const right = HORSE_TUNNEL_ANGLE + HORSE_TUNNEL_HALF_ANGLE;
    if (end <= left || start >= right) return [[start, end]];
    return [[start, Math.min(end, left)], [Math.max(start, right), end]]
      .filter(([a, b]) => b > a);
  }

  function horsePassageAt(x, z) {
    const angle = (Math.atan2(z / 47.25, x / 77.25) + Math.PI * 2) % (Math.PI * 2);
    return angleDistance(angle, HORSE_TUNNEL_ANGLE) < HORSE_TUNNEL_HALF_ANGLE &&
      (x / 99) ** 2 + (z / 66) ** 2 < 1;
  }

  function stairHalfAngle(rx, rz, angle) {
    const tangentX = rx * Math.sin(angle);
    const tangentZ = rz * Math.cos(angle);
    const distancePerRadian = Math.sqrt(tangentX * tangentX + tangentZ * tangentZ);
    const aisleHalfWidth = HD.CONFIG.stairs.width / 2 + 0.28;
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
    segmentCount = 18,
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

  function createOvalCanopy(root) {
    const roofSections = ELEVATED_SEATING.filter((section) => section.floor === 3);
    roofSections.forEach((section, index) => {
      createGrandstandRoofPanel(root, section, index);
    });
    createCanopyLighting(root, roofSections);
    createRoofSpeakers(root, roofSections);
  }

  function createGrandstandRoofPanel(root, section, sectionIndex) {
    const outerX = 125;
    const outerZ = 85.5;
    const innerX = 108;
    const innerZ = 73;
    // Highest deck is 21.56; preserve standing-player clearance underneath.
    const outerHeight = 28.4;
    const innerHeight = 30.4;
    const segments = 18;
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

    for (let index = 0; index <= 4; index++) {
      const angle = THREE.MathUtils.lerp(section.start, section.end, index / 4);
      const outer = oval(outerX - 0.9, outerZ - 0.9, angle);
      cylinder(0.3, 0.42, outerHeight + 0.12, 0x4c5a5d, root, [
        outer.x,
        (outerHeight + 0.12) / 2,
        outer.z,
      ], 10);
      const brace = cylinder(0.11, 0.11, 7.5, 0x4c5a5d, root, [outer.x, 24, outer.z], 8);
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
      const position = oval(112, 75, angle);
      dummy.position.set(position.x, 29.65, position.z);
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
      const position = oval(108, 73, angle);
      const fixture = new THREE.Group();
      fixture.position.set(position.x, 29.7, position.z);
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
      createChair(scene, placement, playerColor);
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

    createChair(scene, placement, HD.CONFIG.playerColors[0]);
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

  function createChair(scene, placement, color) {
    const root = new THREE.Group();
    root.position.set(placement.position.x, placement.tierTop, placement.position.z);
    root.rotation.y = placement.yaw;
    scene.add(root);

    box([1.35, 0.22, 1.25], color, root, [0, 0.11, 0]);
    const back = box([1.35, 1.25, 0.18], color, root, [0, 0.72, 0.6]);
    back.rotation.x = -0.08;
    cylinder(0.06, 0.08, 0.85, 0x39463e, root, [-0.48, -0.32, 0], 7);
    cylinder(0.06, 0.08, 0.85, 0x39463e, root, [0.48, -0.32, 0], 7);
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

    const modelDetail = HD.Settings.modelDetail();
    const mountainCount = modelDetail === "low" ? 18 : modelDetail === "standard" ? 28 : 36;
    const mountains = new THREE.InstancedMesh(
      new THREE.DodecahedronGeometry(18, 0),
      new THREE.MeshLambertMaterial({ color: 0x58745d, flatShading: true }),
      mountainCount,
    );
    const dummy = new THREE.Object3D();
    for (let i = 0; i < mountainCount; i++) {
      const angle = (i / mountainCount) * Math.PI * 2;
      const radius = 205 + Math.sin(i * 4.7) * 18;
      dummy.position.set(Math.cos(angle) * radius, 2 + (i % 3) * 2, Math.sin(angle) * radius);
      dummy.scale.set(2.1 + (i % 4) * 0.12, 0.7 + (i % 5) * 0.08, 1.6);
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
      const variation = Math.sin(i * 12.9898);
      const landscapeRow = i % 4;
      const radiusX = 127 + landscapeRow * 3.7 + variation * 0.9;
      const radiusZ = 88 + landscapeRow * 2.5 + variation * 0.65;
      const x = Math.cos(angle) * radiusX;
      const z = Math.sin(angle) * radiusZ;
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
    createConcourseGlassRails(scene);

    HD.world.staircases = [];
    STAIR_ANGLES.forEach((angle) => createStaircase(scene, angle));

    HD.world.shopPositions = [];
    HD.world.betCounterPositions = [];
    HD.world.sabotageCounterPositions = [];
    HD.world.barriers = [];
    const shopAngles = [Math.PI / 4, (Math.PI * 3) / 4, (Math.PI * 5) / 4, (Math.PI * 7) / 4];
    shopAngles.forEach((angle, index) => createUpperShop(scene, angle, index));
    createSabotageCounter(scene, Math.PI + 0.28);
    createUpperConcourseProps(scene);
  }

  function createUpperConcourse(scene) {
    const color = 0xb7a47f;

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
    for (let index = 0; index < 48; index++) {
      const angle = (index + 0.5) / 48 * Math.PI * 2;
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
    const position = oval(115, 79, angle).add(new THREE.Vector3(0, 0, -11));
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
    const stepCount = 24;
    const radialStep = pathLength / stepCount;
    const stepDepth = radialStep + 0.12;
    root.position.copy(start);
    root.rotation.y = Math.atan2(path.x, path.z);
    root.userData.staircase = {
      angle,
      start: start.toArray(),
      end: end.toArray(),
      visualTopY: stairs.topHeight - STAIR_SURFACE_INSET,
      concourseY: UPPER_CONCOURSE_Y,
    };
    scene.add(root);
    HD.world.staircases.push(root);

    const lightSteps = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      HD.util.material(0xd3c09a),
      Math.ceil(stepCount / 2),
    );
    const darkSteps = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      HD.util.material(0xc4b18c),
      Math.floor(stepCount / 2),
    );
    const dummy = new THREE.Object3D();
    let lightIndex = 0;
    let darkIndex = 0;

    for (let step = 0; step < stepCount; step++) {
      const progress = (step + 1) / stepCount;
      const distance = (step + 0.5) * radialStep;
      const topInset = STAIR_SURFACE_INSET * THREE.MathUtils.smoothstep(
        progress,
        0.62,
        1,
      );
      const top = stairHeightForProgress(progress) - topInset;
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
      0xcab78f,
      root,
      [0, stairs.bottomHeight - 0.14, 0],
    );
    addStairRails(root, pathLength);
  }

  function addStairRails(root, span) {
    const rise = HD.CONFIG.stairs.topHeight - HD.CONFIG.stairs.bottomHeight;
    const railLength = Math.sqrt(span * span + rise * rise);
    const railY = (
      HD.CONFIG.stairs.bottomHeight + HD.CONFIG.stairs.topHeight
    ) / 2 + 2.4;
    const railZ = span / 2;

    const railOffset = HD.CONFIG.stairs.width / 2;
    for (const side of [-1, 1]) {
      const rail = box(
        [0.14, 0.14, railLength],
        ARENA_COLORS.railing,
        root,
        [side * railOffset, railY, railZ],
      );
      rail.rotation.x = -Math.atan2(rise, span);

      for (const progress of [0.2, 0.5, 0.8]) {
        const distance = span * progress;
        const surface = stairHeightForProgress(progress);
        cylinder(
          0.07,
          0.08,
          2.4,
          ARENA_COLORS.railing,
          root,
          [side * railOffset, surface + 1.2, distance],
          7,
        );
      }
    }
  }

  function stairHeightForProgress(progress) {
    return THREE.MathUtils.lerp(
      HD.CONFIG.stairs.bottomHeight,
      HD.CONFIG.stairs.topHeight,
      progress,
    );
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
    sign.position.set(0, 4.48, -2.64);
    sign.scale.set(7.8, 1.08, 1);
    shop.add(sign);
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

  function createBettingCounter(scene, shopPosition, angle, index) {
    const tangent = new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle));
    const position = shopPosition.clone().addScaledVector(tangent, 10);
    const counter = new THREE.Group();
    const colors = [0x315f43, 0x315b77, 0x704858, 0x6d542f];
    counter.position.set(position.x, 13.5, position.z);
    counter.rotation.y = -angle + Math.PI / 2;
    scene.add(counter);

    box([5.2, 2.6, 2.4], colors[index], counter, [0, 1.3, 0]);
    box([5.8, 0.3, 2.9], 0xe8cf87, counter, [0, 2.75, 0]);
    box([4.5, 1.25, 0.16], 0x17382a, counter, [0, 4.05, 0]);
    const sign = createTextSign("BET - NO FEE", 0xf4d259);
    sign.position.set(0, 1.35, -1.23);
    sign.scale.set(4.1, 0.78, 1);
    counter.add(sign);
    addShopWorker(counter, colors[index], [0, 1.72, 0.45], 0.5);

    HD.world.betCounterPositions.push(new THREE.Vector3(position.x, 18.3, position.z));
    HD.world.barriers.push({ x: position.x, z: position.z, radius: 3.2 });
  }

  function createConcourseGlassRails(scene) {
    createCurvedGlassRail(scene, 103.25, 69.75, 13.5, 2.2, 72);
    createCurvedGlassRail(scene, 120, 83, 13.5, 2.4, 96);
  }

  // Major orientation landmarks remain intentionally simple and high contrast:
  // players can identify the infield, horse route, and stadium entry at a glance.
  function createArenaLandmarks(scene) {
    createInfieldPond(scene);
    createHorseServiceTunnel(scene);
    createFloodlightTowers(scene);
    createExteriorEntrance(scene);
    createBroadcastCrews(scene);
  }

  // Saved viewpoints for future replays; these do not render extra frames.
  function createBroadcastCrews(scene) {
    const stations = [
      ['finish', 35, 0.15, 9, 61, 0],
      ['back-turn', -31, 0.15, -9, -58, -13],
      ['infield', 7, 0.15, 15, 0, 34],
      ['north-balcony', 39, 13.5, 71, 0, 31],
      ['south-balcony', -39, 13.5, -71, 0, -31],
    ];
    HD.world.broadcastCameras = stations.map(([id, x, y, z, tx, tz]) => {
      const root = new THREE.Group();
      root.name = 'Broadcast crew: ' + id;
      root.position.set(x, y, z);
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
      camera.position.set(x, y + 3.02, z);
      camera.lookAt(target);
      scene.add(camera);
      if (y > 1) HD.world.barriers.push({ x, z, radius: 1.7 });
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

  function createHorseServiceTunnel(scene) {
    const root = new THREE.Group();
    root.name = "Horse entry and service tunnel";
    const center = oval(77.25, 47.25, HORSE_TUNNEL_ANGLE);
    const outside = oval(124, 87, HORSE_TUNNEL_ANGLE);
    const outward = outside.clone().sub(center).normalize();
    root.position.copy(center);
    root.rotation.y = Math.atan2(outward.x, outward.z);
    scene.add(root);

    const concrete = ARENA_COLORS.concrete;
    for (const side of [-1, 1]) {
      box([0.65, 8.5, 52], concrete, root, [side * 5.3, 4.25, 20]);
    }
    box([11.25, 0.5, 52], concrete, root, [0, 8.75, 20]);
    box([11.25, 0.2, 52], ARENA_COLORS.concreteDark, root, [0, 0.05, 20]);
    const sign = createTextSign("HORSE ENTRY / EXIT", 0xffdf75);
    sign.position.set(0, 7.4, -6.05);
    sign.scale.set(8.6, 1.05, 1);
    root.add(sign);

    for (let door = 0; door < 4; door++) {
      box([2.8, 4.8, 0.3], 0x294f62, root, [-4.8 + door * 3.2, 2.4, 46]);
    }
    const bridgeLeft = oval(77.25, 47.25, HORSE_TUNNEL_ANGLE - 0.095).setY(9.05);
    const bridgeRight = oval(77.25, 47.25, HORSE_TUNNEL_ANGLE + 0.095).setY(9.05);
    createUpperAisle(scene, oval(77.25, 47.25, HORSE_TUNNEL_ANGLE - 0.36).setY(1.65), bridgeLeft, "horse-crossing-left", 3.2);
    createUpperAisle(scene, bridgeLeft, bridgeRight, "horse-crossing-bridge", 5.6);
    HD.world.horseServiceRoute = {
      angle: HORSE_TUNNEL_ANGLE,
      outside: outside.setY(0.75),
      inside: oval(69, 40, HORSE_TUNNEL_ANGLE).setY(0.75),
      clearance: 8.5,
    };
    HD.world.horseTunnel = root;
  }

  function createFloodlightTowers(scene) {
    const angles = [0.32, 1.42, 2.55, 3.46, 4.55, 5.72];
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

  function createCurvedGlassRail(scene, radiusX, radiusZ, baseY, height, segments) {
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

      if (height <= 3) {
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
      dummy.scale.set(length - 0.08, height, 0.09);
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
    for (const [start, end] of excludeHorsePassage(0, Math.PI * 2)) {
      createSolidOvalSegment(scene, outerX, outerZ, innerX, innerZ, height, color, start, end, 96);
    }
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
  }
  return {
    build,
    refreshTrackLayout,
    update,
    oval,
    assignLocalSeat,
    playerSeatPlacement,
    refreshLocalPlayer,
    upperWalkSurfaceAt,
    horsePassageAt,
  };
})();
