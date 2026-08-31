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
  const COMMENTATOR_ANGLE = Math.PI / 4;
  const DETAILED_SEATS = [
    { row: 1, column: 30, local: true, activity: "watch" },
    { row: 1, column: 29, activity: "phone" },
    { row: 1, column: 28, activity: "watch" },
    { row: 3, column: 30, activity: "throw" },
    { row: 3, column: 29, activity: "watch" },
    { row: 5, column: 30, activity: "phone" },
    { row: 5, column: 29, activity: "watch" },
    { row: 5, column: 28, activity: "throw" },
  ];

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
    const track = new THREE.Mesh(trackGeo, HD.util.material(0xa96543));
    track.position.y = 0.03;
    track.receiveShadow = true;
    scene.add(track);
    createDetailedInfieldGrass(scene);
    for (let laneLine = 0; laneLine <= HD.CONFIG.raceHorseCount; laneLine++) {
      addTrackLine(
        scene,
        49 + laneLine * 2.85,
        22 + laneLine * 2.62,
      );
    }
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
    const lowerRail = [];
    const upperRail = [];
    for (let i = 0; i <= 128; i++) {
      const a = (i / 128) * Math.PI * 2;
      lowerRail.push(oval(rx, rz, a).setY(2.15));
      upperRail.push(oval(rx, rz, a).setY(3.55));
      if (i % 4 === 0) {
        const p = oval(rx, rz, a);
        cylinder(0.1, 0.13, 3.75, 0xf5e8c8, root, [p.x, 1.875, p.z], 7);
      }
    }
    [lowerRail, upperRail].forEach((points) => {
      root.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({ color: 0xf5e8c8 }),
      ));
    });
  }
  function addFinishLine(scene) {
    for (let x = 49; x < 73; x += 2) {
      const color = ((x - 49) / 2) % 2 ? 0x202020 : 0xffffff;
      box([2, 0.14, 1.25], color, scene, [x + 1, 0.27, 0]);
    }

    const arch = new THREE.Group();
    scene.add(arch);
    cylinder(0.3, 0.4, 8, 0xf4df9f, arch, [48.5, 4, 0]);
    cylinder(0.3, 0.4, 8, 0xf4df9f, arch, [73.5, 4, 0]);
    box([25.6, 1.5, 1], 0xd94f31, arch, [61, 8, 0]);

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
        const inCommentatorCutout = row >= 3 &&
          angleDistance(angle, COMMENTATOR_ANGLE) < 0.095;
        if (detailedPlayerSeat || inStairAisle || inCommentatorCutout) {
          [seatBases, seatBacks, crowdBodies, crowdHeads].forEach((batch) => {
            hideInstance(dummy, batch, instance);
          });
        }
        instance++;
      }
    }

    crowdBodies.instanceColor.needsUpdate = true;
    createOvalCanopy(root);
    createCommentatorBooth(root);
  }

  function createCommentatorBooth(root) {
    const position = oval(105, 70.5, COMMENTATOR_ANGLE);
    const booth = new THREE.Group();
    booth.position.set(position.x, 0, position.z);
    booth.rotation.y = -COMMENTATOR_ANGLE + Math.PI / 2;
    root.add(booth);

    box([13.5, 0.45, 11], 0x344a43, booth, [0, 8.15, 0]);
    box([13.8, 0.38, 12.5], 0xb9aa89, booth, [0, 13.5, 0]);
    box([0.35, 5.3, 11], 0x435a51, booth, [-6.55, 10.8, 0]);
    box([0.35, 5.3, 11], 0x435a51, booth, [6.55, 10.8, 0]);
    box([4.25, 5.3, 0.35], 0x435a51, booth, [-4.55, 10.8, 5.25]);
    box([4.25, 5.3, 0.35], 0x435a51, booth, [4.55, 10.8, 5.25]);

    const glassMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xbceaf0,
      transparent: true,
      opacity: 0.34,
      roughness: 0.08,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const glass = new THREE.Mesh(new THREE.BoxGeometry(11.8, 4.25, 0.12), glassMaterial);
    glass.position.set(0, 10.9, -5.25);
    booth.add(glass);
    for (let panel = -2; panel <= 2; panel++) {
      box([0.1, 4.35, 0.18], 0x53696d, booth, [panel * 2.35, 10.9, -5.3]);
    }
    box([10.4, 1.15, 1.3], 0x76583a, booth, [0, 9, -3.9]);

    const commentator = HD.Models.playerCharacter(0x7a3046, {
      variant: 6,
      hat: "cap",
      expression: "smile",
      skin: 0x8d593d,
    });
    HD.Models.setPlayerStanding(commentator, true);
    commentator.position.set(0, 8.4, -1.9);
    commentator.rotation.y = Math.PI;
    commentator.scale.setScalar(0.72);
    booth.add(commentator);

    HD.world.commentatorBox = {
      x: position.x,
      z: position.z,
      angle: booth.rotation.y,
      halfWidth: 6.9,
      halfDepth: 6.25,
    };
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

  function addTierRing(root, row) {
    const innerX = 80.5 + row * 3.25;
    const innerZ = 50.5 + row * 2.75;
    const outerX = innerX + 3.25;
    const outerZ = innerZ + 2.75;
    const tierTop = HD.CONFIG.grandstandBaseHeight + row * 1.5;
    const color = row % 2 ? 0x526c5b : 0x435e50;

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
      createSolidOvalSegment(root, outerX, outerZ, innerX, innerZ, height, color, start, end);
      addTierFasciaSegment(root, outerX, outerZ, height, row, start, end);
    }
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
  ) {
    const shape = new THREE.Shape();
    const segments = 18;

    for (let index = 0; index <= segments; index++) {
      const angle = THREE.MathUtils.lerp(start, end, index / segments);
      const x = Math.cos(angle) * outerX;
      const z = Math.sin(angle) * outerZ;
      if (index === 0) shape.moveTo(x, z);
      else shape.lineTo(x, z);
    }

    for (let index = segments; index >= 0; index--) {
      const angle = THREE.MathUtils.lerp(start, end, index / segments);
      shape.lineTo(Math.cos(angle) * innerX, Math.sin(angle) * innerZ);
    }
    shape.closePath();

    const foundationBottom = -0.55;
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
    const outerX = 120;
    const outerZ = 83;
    const innerX = 90;
    const innerZ = 57;
    const outerHeight = 21.5;
    const innerHeight = 25;
    const segments = 128;
    const positions = [];
    const indices = [];

    for (let index = 0; index <= segments; index++) {
      const angle = (index / segments) * Math.PI * 2;
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

    const material = HD.util.material(0xf0cf61, {
      metalness: 0.12,
      roughness: 0.58,
      side: THREE.DoubleSide,
    });
    const canopy = new THREE.Mesh(geometry, material);
    canopy.receiveShadow = true;
    root.add(canopy);

    createRoofGlassWall(root, outerX, outerZ, 13.5, outerHeight);
    createCanopyLighting(root);
    createRoofSpeakers(root);
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

  function createCanopyLighting(root) {
    const lightCount = 32;
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
      const angle = (index / lightCount) * Math.PI * 2;
      const position = oval(109, 74.5, angle);
      dummy.position.set(position.x, 22.8, position.z);
      dummy.rotation.set(0, -angle, 0);
      dummy.scale.set(3.4, 0.12, 0.5);
      dummy.updateMatrix();
      lights.setMatrixAt(index, dummy.matrix);
    }

    lights.instanceMatrix.needsUpdate = true;
    lights.castShadow = false;
    root.add(lights);

    for (let index = 0; index < 16; index++) {
      const angle = (index / 16) * Math.PI * 2;
      const position = oval(101, 67, angle);
      const fixture = new THREE.Group();
      fixture.position.set(position.x, 23.1, position.z);
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
  }

  function createRoofSpeakers(root) {
    const angles = [Math.PI / 4, (Math.PI * 3) / 4, (Math.PI * 5) / 4, (Math.PI * 7) / 4];
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
      cylinder(0.45, 0.7, 6, 0x765034, scene, [p.x, 2.5, p.z]);
      sphere(3.8, 0x2f7d3e, scene, [p.x, 7, p.z]);
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
      context.fillText(`#${data.index + 1}  ${data.name}`, 105, y);
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
      const avatar = HD.Models.playerCharacter(playerColor, {
        variant: index,
        activity: seat.activity,
      });
      avatar.position.copy(placement.avatar);
      avatar.rotation.y = placement.yaw;
      avatar.userData.activity = seat.activity;
      avatar.userData.name = `Player ${index + 2}`;
      avatar.traverse((object) => {
        if (!object.isMesh) return;
        object.castShadow = false;
        object.receiveShadow = true;
      });
      scene.add(avatar);
      HD.world.players.push(avatar);
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
    HD.Models.setPlayerStanding(player, false);
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
    sky.rotation.z = Math.PI;
    scene.add(sky);

    const modelDetail = HD.Settings.modelDetail();
    const mountainCount = modelDetail === "low" ? 18 : modelDetail === "standard" ? 28 : 36;
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
    createRaisedRing(scene, 120, 83, 103.25, 69.75, 13.5, 0xb7a47f);
    createConcourseGlassRails(scene);

    STAIR_ANGLES.forEach((angle) => createStaircase(scene, angle));

    HD.world.shopPositions = [];
    HD.world.betCounterPositions = [];
    HD.world.sabotageCounterPositions = [];
    HD.world.barriers = [];
    const shopAngles = [Math.PI / 4, (Math.PI * 3) / 4, (Math.PI * 5) / 4, (Math.PI * 7) / 4];
    shopAngles.forEach((angle, index) => createUpperShop(scene, angle, index));
    createSabotageCounter(scene, Math.PI);
    createUpperConcourseProps(scene);
  }

  function createUpperConcourseProps(scene) {
    const colors = [0x496b3f, 0xa95e3f, 0x3c6578];
    for (let index = 0; index < 12; index++) {
      const angle = (index / 12) * Math.PI * 2 + 0.18;
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
      const position = oval(116, 78.5, angle);
      const table = new THREE.Group();
      table.position.set(position.x, 13.5, position.z);
      scene.add(table);
      cylinder(1.35, 1.35, 0.2, 0xe0c38b, table, [0, 1.2, 0], 16);
      cylinder(0.18, 0.24, 1.2, 0x465456, table, [0, 0.6, 0], 10);
      HD.world.barriers.push({ x: position.x, z: position.z, radius: 1.5 });
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
    scene.add(root);

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
      const top = stairHeightForProgress(progress) - progress * 0.06;
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
      [stairs.width, 0.4, 1.8],
      0xcab78f,
      root,
      [0, stairs.bottomHeight - 0.2, 0.15],
    );
    box(
      [stairs.width, 0.4, 2],
      0xcab78f,
      root,
      [0, stairs.topHeight - 0.24, pathLength + 0.35],
    );
    addStairRails(root, pathLength);
  }

  function addStairRails(root, span) {
    const rise = HD.CONFIG.stairs.topHeight - HD.CONFIG.stairs.bottomHeight;
    const railLength = Math.sqrt(span * span + rise * rise);
    const railY = (
      HD.CONFIG.stairs.bottomHeight + HD.CONFIG.stairs.topHeight
    ) / 2 + 1;
    const railZ = span / 2;

    const railOffset = HD.CONFIG.stairs.width / 2;
    for (const side of [-1, 1]) {
      const rail = box(
        [0.14, 0.14, railLength],
        0xe8ddc5,
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
          1.8,
          0xe8ddc5,
          root,
          [side * railOffset, surface + 0.9, distance],
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
    createCurvedGlassRail(scene, 102.9, 69.4, 13.5, 2.2, 72);
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
      const midpoint = (angleA + angleB) / 2;
      const atStairs = height <= 3 && STAIR_ANGLES.some(
        (stairAngle) => Math.abs(Math.atan2(
          Math.sin(midpoint - stairAngle),
          Math.cos(midpoint - stairAngle),
        )) < 0.065,
      );
      if (atStairs) continue;

      const start = oval(radiusX, radiusZ, angleA);
      const end = oval(radiusX, radiusZ, angleB);
      panels.push({ start, end });
    }

    const glassBatch = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      glass,
      panels.length,
    );
    const frameBatch = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      HD.util.material(0x526970),
      panels.length,
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

      dummy.position.set(start.x, baseY + height / 2, start.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(0.08, height + 0.12, 0.12);
      dummy.updateMatrix();
      frameBatch.setMatrixAt(index, dummy.matrix);

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
    glassBatch.instanceMatrix.needsUpdate = true;
    frameBatch.instanceMatrix.needsUpdate = true;
    railBatch.instanceMatrix.needsUpdate = true;
    scene.add(glassBatch, frameBatch, railBatch);
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
    createSolidOvalRing(scene, outerX, outerZ, innerX, innerZ, height, color, 128);
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
    update,
    oval,
    assignLocalSeat,
    playerSeatPlacement,
    refreshLocalPlayer,
  };
})();
