"use strict";

const assert = require("assert");
const path = require("path");
const { pathToFileURL } = require("url");

async function run() {
  global.window = global;
  global.THREE = await import(
    pathToFileURL(path.resolve(__dirname, "../vendor/three.module.js")).href
  );
  global.document = {
    createElement(tagName) {
      if (tagName !== "canvas") return {};
      return {
        width: 0,
        height: 0,
        getContext: createCanvasContext,
      };
    },
  };

  require("../src/config.js");
  HD.Settings = {
    modelDetail: () => "low",
    avatarOptions: () => ({
      skin: 0xf1c7a5,
      hat: "cap",
      expression: "smile",
    }),
  };
  require("../src/models.js");
  require("../src/stadium.js");
  require("../src/race.js");

  HD.world.scene = new THREE.Scene();
  HD.world.camera = new THREE.PerspectiveCamera();
  HD.Stadium.build(HD.world.scene);
  const concessionDetails = { menus: 0, bins: 0 };
  HD.world.scene.traverse(object => {
    if (object.name === 'Concession menu board') concessionDetails.menus++;
    if (object.name === 'Concession waste station') concessionDetails.bins++;
  });
  assert.equal(concessionDetails.menus, 8, 'Every stall needs two readable menu boards');
  assert.equal(concessionDetails.bins, 8, 'Every stall needs recessed waste and recycling stations');
  const facilityLabels = [];
  HD.world.scene.traverse(object => {
    if (object.name.startsWith('Facility label: ')) facilityLabels.push(object.name);
  });
  for (const label of ['MEN', 'WOMEN', 'ACCESSIBLE']) {
    assert.equal(facilityLabels.filter(name => name === `Facility label: ${label}`).length,
      2, `Both restroom buildings need a labeled ${label} entrance`);
  }
  const broadcast = HD.world.broadcastCameras;
  const firstAid = HD.world.scene.getObjectByName('FIRST AID concourse building');
  for (const shop of HD.world.shopPositions) {
    assert.ok(Math.hypot(firstAid.position.x - shop.x, firstAid.position.z - shop.z) > 12.5,
      'First aid must remain separated from concession storefronts');
  }
  const fixer = HD.world.sabotageCounterPositions[0];
  assert.equal(HD.world.shopPositions.length, 4,
    'All four concession storefronts must be available');
  assert.equal(HD.world.betCounterPositions.length, 4,
    'Every concession quarter needs a betting counter');
  assert.equal(HD.world.sabotageCounterPositions.length, 1,
    'The always-on Fixer Hub must be available');
  for (const vendor of [
    ...HD.world.shopPositions,
    ...HD.world.betCounterPositions,
    ...HD.world.sabotageCounterPositions,
  ]) {
    assert.ok(
      HD.world.barriers.some((barrier) => {
        return Math.hypot(barrier.x - vendor.x, barrier.z - vendor.z) < 0.01;
      }),
      'Every vendor needs a matching collision barrier',
    );
  }
  const fixerOuter = (fixer.x / 120) ** 2 + (fixer.z / 83) ** 2;
  const fixerInner = (fixer.x / 103.25) ** 2 + (fixer.z / 69.75) ** 2;
  assert.ok(fixerOuter < 0.98 && fixerInner > 1.02,
    'The Fixer Hub must sit fully within the shop concourse');
  for (const shop of HD.world.shopPositions) {
    assert.ok(Math.hypot(fixer.x - shop.x, fixer.z - shop.z) > 18,
      'The Fixer Hub must not overlap a concession storefront');
  }
  const upperFlights = HD.world.arenaSurfaces.filter(surface => surface.stairs);
  const terraces = HD.world.arenaSurfaces.filter(surface => surface.terrace);
  assert.equal(
    upperFlights.filter(surface => surface.id.includes('spine-')).length,
    0,
    'Removed upper stair towers returned',
  );
  assert.ok(
    upperFlights.some(surface => surface.id.includes('main-entrance')),
    'The retained public entrance route is missing',
  );
  assert.equal(terraces.length, 0, 'Removed elevated seating terraces returned');
  assert.equal(HD.world.stairArrivalMarkers.length, 0,
    'Decorative arches must not return above the stairs');
  assert.ok(HD.world.scene.getObjectByName('Single-bowl stadium canopy'),
    'The single-bowl roof is missing');
  assert.equal(broadcast.length, 10);
  assert.equal(new Set(broadcast.map((station) => station.id)).size, 10);
  assert.equal(broadcast.filter(station => station.id.startsWith('seating-bay-')).length, 2);
  assert.ok(!broadcast.some(station => station.id.startsWith('walk-')));
  for (let i = 0; i < 2; i++) {
    const bay = HD.world.scene.getObjectByName('Reserved seating camera bay ' + i);
    assert.equal(bay, undefined,
      'Seating viewpoints must use normal crowd seats, not camera platforms');
    const station = broadcast.find(entry => entry.id === 'seating-bay-' + i);
    assert.equal(station.physicalCrew, false);
    assert.equal(station.root.parent, null,
      'Virtual seating cameras must not render camera operators');
  }
  for (const station of broadcast) {
    assert.ok(station.camera.isPerspectiveCamera);
    const direction = station.camera.getWorldDirection(new THREE.Vector3());
    const towardTrack = station.target.clone().sub(station.camera.position).normalize();
    assert.ok(direction.dot(towardTrack) > 0.999, 'Replay camera must face its track target');
    const { x, y, z } = station.root.position;
    if (y < 1) {
      assert.ok((x / 49) ** 2 + (z / 22) ** 2 < 0.9, 'Infield crew must stay off the racing surface');
    } else if (station.physicalCrew) {
      assert.ok(HD.world.barriers.some((barrier) => barrier.x === x && barrier.z === z));
    }
  }
  for (const count of [8, 4, 6]) {
    const previous = HD.world.laneMarkings;
    let disposed = 0;
    previous.children.forEach((line) => {
      line.geometry.addEventListener("dispose", () => disposed++);
    });
    HD.CONFIG.raceHorseCount = count;
    HD.Stadium.refreshTrackLayout();
    assert.equal(previous.parent, null, "Old markings must leave the scene");
    assert.equal(disposed, previous.children.length, "Old lane geometry must be released");
    assert.equal(HD.world.laneMarkings.children.length, count + 1);
  }
  HD.Race.resetHorses();

  assert.equal(HD.state.horses.length, 6, "The race did not build a six-horse field");
  const savedPhase = HD.state.phase;
  const runner = HD.state.horses[0].userData.data;
  const savedOdds = runner.odds;
  const savedProgress = runner.progress;
  HD.state.phase = 'betting';
  HD.Stadium.refreshBettingDisplays();
  const displays = HD.world.bettingDisplays;
  assert.equal(displays.length, 3, 'Counters should share only three odds textures');
  assert.equal(displays.flatMap(display => display.rows).length, 6, 'Screens must include the full field');
  assert.ok(displays.every(display => display.status === 'BETTING OPEN'));
  const textureVersion = displays[0].texture.version;
  HD.Stadium.refreshBettingDisplays();
  assert.equal(displays[0].texture.version, textureVersion, 'Unchanged odds must not upload textures');
  runner.odds = 9.5;
  HD.Stadium.refreshBettingDisplays();
  assert.equal(displays[0].rows[0].odds, 9.5, 'Counter odds must track actual betting data');
  HD.state.phase = 'racing';
  runner.progress = 0.5;
  HD.Stadium.refreshBettingDisplays();
  assert.equal(displays[0].status, 'LIVE BETTING');
  runner.progress = 1;
  HD.Stadium.refreshBettingDisplays();
  assert.ok(displays.every(display => display.status === 'BETTING CLOSED'));
  runner.odds = savedOdds;
  runner.progress = savedProgress;
  HD.state.phase = savedPhase;
  HD.Stadium.refreshBettingDisplays();
  const horseNumber = HD.state.horses[0].userData.numberLabel;
  assert.ok(horseNumber.position.y > 6, "Horse numbers should float above the jockey");
  assert.equal(
    horseNumber.material.depthTest,
    false,
    "Horse numbers should remain visible through stadium geometry",
  );
  assert.equal(HD.world.players.length, 0, "Reserved seats must not spawn fake players");
  const remoteAvatar = HD.Models.playerCharacter(0x3366cc);
  HD.Models.setPlayerNameTag(remoteAvatar, "Maya");
  assert.equal(remoteAvatar.userData.nameTag.userData.label, "Maya");
  assert.equal(
    remoteAvatar.userData.nameTag.material.depthTest,
    false,
    "Player tags should remain visible through stadium geometry",
  );
  HD.Models.setPlayerNameTag(HD.world.localPlayer, "Do not show this");
  assert.equal(
    HD.world.localPlayer.userData.nameTag,
    undefined,
    "The local player should not see their own name tag",
  );
  assert.equal(new Set(HD.state.activeHorseIds).size, 6, "The race field contains duplicates");
  assert.equal(HD.state.horseFieldRacesRemaining, 2, "The new field should last two races");
  const firstField = [...HD.state.activeHorseIds];
  HD.state.horseFieldRacesRemaining = 1;
  HD.Race.resetHorses();
  assert.deepEqual(
    HD.state.activeHorseIds,
    firstField,
    "The selected horse field changed before completing its second race",
  );
  assert.equal(HD.world.shopPositions.length, 4, "The upper concourse shops did not build");
  assert.equal(
    HD.world.crowdThrowers.length,
    3,
    "The crowd should contain exactly three featured throwers",
  );
  assert.equal(
    new Set(HD.world.crowdThrowers.map((thrower) => thrower.userData.throwerIndex)).size,
    3,
    "The featured crowd throwers need unique stagger slots",
  );
  assert.ok(
    HD.world.crowdThrowers.every((thrower) => thrower.userData.ambientThrower),
    "A featured crowd thrower is missing its race-only behavior marker",
  );
  assert.ok(
    HD.world.crowdThrowers.every((thrower) => thrower.children.length === 0),
    "Crowd throw origins should not replace lightweight spectators with player models",
  );
  assert.equal(
    HD.world.projectileBarriers.length,
    0,
    "The removed commentator booth must not leave invisible projectile barriers",
  );
  assert.ok(HD.world.barriers.length >= 8, "Shop and counter barriers are incomplete");
  assert.equal(HD.world.commentators.length, 0, "The commentary NPCs must be removed");
  assert.equal(HD.world.commentatorBox, undefined, "The booth walk zone must be removed");
  assert.equal(HD.world.horseTunnel, undefined, "The removed horse tunnel returned");
  assert.equal(HD.world.horseServiceRoute, undefined, "The removed service route returned");
  [
    "Landscaped infield pond and fountain",
    "Stadium floodlight towers",
    "Main public entrance plaza",
  ].forEach((name) => {
    assert.ok(HD.world.scene.getObjectByName(name), `Arena landmark missing: ${name}`);
  });
  const elevatedFloors = new Set();
  HD.world.scene.traverse((object) => {
    if (object.userData?.seatingFloor) elevatedFloors.add(object.userData.seatingFloor);
  });
  assert.equal(elevatedFloors.size, 0, 'Removed elevated seating floors returned');
  for (let step = 0; step < 16; step++) {
    assert.ok(
      upperFloorHitsAt((step + 0.5) / 16 * Math.PI * 2) > 0,
      "The upper concourse must be continuous with no commentator cutout",
    );
  }
  const seatBatches = HD.world.scene.children
    .flatMap((child) => child.children || [])
    .filter((object) =>
      object.isInstancedMesh &&
      object.userData.seatingSector &&
      object.geometry.userData.seatCushion,
    );
  assert.equal(seatBatches.length, 8, "The lower bowl should cull seating in separate sectors");
  const seatMatrix = new THREE.Matrix4();
  const columns = seatBatches[0].userData.seatingSector.columns;
  const formerBoothColumn = Math.round((Math.PI * 2 - 0.18) / (Math.PI * 2) * columns) % columns;
  const seatBases = seatBatches.find(batch => {
    const sector = batch.userData.seatingSector;
    return formerBoothColumn >= sector.firstColumn && formerBoothColumn < sector.firstColumn + sector.sectorColumns;
  });
  [4, 5, 6].forEach((row) => {
    const sector = seatBases.userData.seatingSector;
    seatBases.getMatrixAt(row * sector.sectorColumns + formerBoothColumn - sector.firstColumn, seatMatrix);
    assert.ok(
      Math.abs(seatMatrix.determinant()) > 0.01,
      "The commentator seat cutout must be restored at every affected row",
    );
  });
  assert.ok(
    HD.CONFIG.stairs.startZ < 50.5,
    "The left/right stair entrances must overlap the lower walking ring",
  );
  assert.equal(
    HD.world.staircases?.length,
    4,
    "The stadium should have four aligned public staircases",
  );
  assert.ok(
    HD.world.staircases.every((staircase) => {
      const data = staircase.userData.staircase;
      return data.treadCount === 23 &&
        data.treadsPerSeatRow === 3 &&
        data.rowLandingCount === 7 &&
        data.surfaceProfile.every((segment, index, all) => {
          return segment.end > segment.start &&
            (index === 0 || Math.abs(segment.start - all[index - 1].end) < 0.0001);
        });
    }),
    'Each stair needs two connector treads and a broad landing at every seating row',
  );
  assert.equal(
    HD.world.scene.getObjectByName('Solid lower stair retaining wall'),
    undefined,
    'Triangular stair side walls must remain removed',
  );
  assert.equal(
    HD.world.staircases.filter((staircase) => {
      return staircase.getObjectByName('Visual-only straight center stair handrail');
    }).length,
    4,
    'Every public staircase needs one centered visual-only handrail',
  );
  assert.ok(
    HD.world.staircases.every(staircase => {
      const posts = staircase.children.filter(object =>
        object.name === 'Visual-only center stair handrail post');
      return posts.length === 9 &&
        posts.every(post => post.userData.collision === false);
    }),
    'Center handrail posts must form a lightweight collision-free straight line',
  );
  assert.ok(
    HD.world.scene.getObjectByName('Solid upper-concourse foundation'),
    'The upper concourse must not expose open ground beneath its floor',
  );
  assert.ok(
    HD.world.staircases.every((staircase) => {
      const stair = staircase.userData.staircase;
      return stair.visualTopY < stair.concourseY &&
        stair.concourseY - stair.visualTopY <= 0.08;
    }),
    "A public staircase is coplanar with or too far below the upper concourse",
  );
  assert.equal(HD.world.publicEntrances?.length, 2);
  assert.ok(HD.world.replayBillboard?.replayReady, 'The replay billboard surface is unavailable');
  assert.equal(HD.world.replayBillboard.canvas.width, 1024);
  assert.equal(HD.world.replayBillboard.canvas.height, 576);
  assert.ok(
    HD.world.replayBillboard.angle > 4.3 && HD.world.replayBillboard.angle < 4.7,
    'The replay billboard must remain on the far side without covering a stair',
  );
  assert.ok(
    HD.world.scene.getObjectByName('Instant replay video surface'),
    'The future replay system has no named video surface',
  );
  assert.ok(
    HD.world.scene.children.some((object) => {
      return object.isInstancedMesh &&
        object.userData.concourseGlass &&
        object.userData.panelCount > 60;
    }),
    "The upper-concourse glass fence is incomplete",
  );
  const outerGlass = HD.world.scene.children.find((object) => {
    return object.isInstancedMesh && object.userData.completeOuterRing;
  });
  assert.equal(
    outerGlass?.userData.panelCount,
    96,
    'The outside stadium glass must form one complete ring',
  );
  assert.ok(
    HD.world.scene.children.some((object) => object.isInstancedMesh && object.count === 120),
    "The instanced infield grass detail is missing",
  );

  require("../src/broadcast.js");
  let renderTarget = null;
  let renderCount = 0;
  let failRender = false;
  let interpolatedScale = false;
  let replayPlayerVisible = false;
  let centeredProjectile = false;
  const player = new THREE.Group();
  player.name = 'Recorded test player';
  const hand = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  player.add(hand);
  player.layers.set(2);
  HD.world.localPlayer = player;
  HD.world.scene.add(player);
  const playerStart = player.position.clone();
  HD.world.renderer = {
    shadowMap: { autoUpdate: true },
    getRenderTarget: () => renderTarget,
    setRenderTarget: value => { renderTarget = value; },
    render(scene, camera) {
      renderCount++;
      assert.equal(HD.world.replayBillboard.root.visible, false);
      if (HD.Broadcast.diagnostics.replaying) {
        assert.equal(player.visible, false, 'Hide live players only during replay rendering');
        HD.world.scene.children.forEach((mesh) => {
          if (mesh.name !== 'Broadcast replay double' || !mesh.visible) return;
          if (mesh.children.length === 1 && mesh.children[0].geometry === hand.geometry) {
            replayPlayerVisible = true;
          }
          if (mesh.geometry?.type === 'BoxGeometry' && !mesh.children.length) {
            camera.updateMatrixWorld(true);
            const projection = mesh.position.clone().project(camera);
            if (Math.abs(projection.x) < 0.0001 && Math.abs(projection.y) < 0.0001) {
              centeredProjectile = true;
              assert.ok(camera.position.y > mesh.position.y,
                'Chase camera must remain above the prop, even close to impact');
            }
          }
          const units = (mesh.scale.x - 1) * 1000;
          if (units > 0 && units < 110 && Math.abs(units - Math.round(units)) > 0.01) {
            interpolatedScale = true;
          }
        });
      }
      if (failRender) throw new Error("Test render failure");
    },
  };
  HD.state.phase = "racing";
  HD.state.horses.forEach((horse, i) => {
    horse.userData.data.progress = 0.5 - i * 0.005;
    horse.position.set(i * 4, 0, 0);
  });
  for (let i = 0; i < 20; i++) HD.Broadcast.update(0.1);
  assert.ok(renderCount > 0, "TV must render a real camera feed");
  const beforeInvalidTime = HD.Broadcast.diagnostics;
  const rendersBeforeInvalidTime = renderCount;
  [NaN, Infinity, -Infinity, 0, -1].forEach((dt) => HD.Broadcast.update(dt));
  assert.deepEqual(HD.Broadcast.diagnostics, beforeInvalidTime);
  assert.equal(renderCount, rendersBeforeInvalidTime, 'Invalid time must not render or alter replay history');
  const horse = HD.state.horses[0];
  const originalPosition = horse.position.clone();
  const nearby = HD.state.horses[1];
  const projectile = { type: "carrot", config: { boostDuration: 5 } };
  nearby.position.set(50, 0, 0);
  HD.Broadcast.impact(nearby, projectile);
  assert.equal(HD.Broadcast.diagnostics.pending, false, 'Distant hits must not interrupt the leader');
  nearby.position.set(4, 0, 0);
  nearby.userData.data.progress = -0.5;
  HD.Broadcast.impact(nearby, projectile);
  assert.equal(HD.Broadcast.diagnostics.pending, false, 'Lapped horses do not count as nearby challengers');
  nearby.userData.data.progress = 0.51;
  HD.Broadcast.update(0.1);
  assert.equal(HD.Broadcast.diagnostics.subjectId, nearby.uuid, 'Live coverage must follow a new leader');
  assert.equal(HD.Broadcast.diagnostics.pending, false, 'Leader changes alone must not trigger replay');
  nearby.userData.data.progress = 0.495;
  const airborne = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  airborne.position.set(10, 12, 0);
  HD.state.projectiles.push({mesh: airborne, position: airborne.position, velocity: new THREE.Vector3(1, 2, 0)});
  for (let i = 0; i < 110; i++) {
    nearby.scale.setScalar(1 + i * 0.001);
    HD.Broadcast.update(0.1);
    assert.equal(HD.Broadcast.diagnostics.subjectId, horse.uuid, 'Airborne items must not steal live coverage');
  }
  projectile.mesh = airborne;
  HD.state.projectiles.pop();
  HD.Broadcast.impact(nearby, projectile);
  for (let i = 0; i < 9; i++) HD.Broadcast.update(0.1);
  assert.equal(HD.Broadcast.diagnostics.replaying, false, 'Keep showing live action during the one-second delay');
  for (let i = 0; i < 2; i++) HD.Broadcast.update(0.1);
  assert.equal(HD.Broadcast.diagnostics.replaying, true, 'Nearby impacts replay after about one second');
  assert.equal(HD.Broadcast.diagnostics.projectileChase, true,
    'Recorded projectile impacts must activate the invisible chase camera');
  assert.ok(replayPlayerVisible, 'Replay must render recorded player bodies');
  assert.ok(centeredProjectile, 'Projectile must project to the center of its chase camera');
  assert.ok(player.position.equals(playerStart), 'Replay cannot alter real player transforms');
  assert.equal(player.visible, true, 'Replay rendering restores player visibility');
  assert.ok(HD.Broadcast.diagnostics.replaying, "A major hit must trigger delayed replay");
  assert.ok(horse.position.equals(originalPosition), "Replay must not move real horses");
  assert.equal(horse.visible, true);
  assert.equal(renderTarget, null);
  failRender = true;
  assert.throws(() => HD.Broadcast.update(0.1), /Test render failure/);
  assert.equal(horse.visible, true, "Render failure must restore real horses");
  assert.equal(player.visible, true, 'Render failure must restore players too');
  assert.equal(HD.world.replayBillboard.root.visible, true);
  assert.equal(HD.world.renderer.shadowMap.autoUpdate, true);
  assert.equal(renderTarget, null);
  failRender = false;
  for (let i = 0; i < 200; i++) HD.Broadcast.update(0.1);
  assert.ok(!HD.Broadcast.diagnostics.replaying, "Replay must return to live coverage");
  assert.ok(interpolatedScale, 'Playback must interpolate recorded scales between samples');
  assert.equal(nearby.scale.x, 1.109, 'Replay must not change live horse scale');
  assert.equal(HD.Broadcast.diagnostics.subjectId, horse.uuid, 'Playback must return to the current leader');
  assert.ok(HD.Broadcast.diagnostics.samples <= 122, "History must be bounded");
  HD.state.phase = "betting";
  HD.Broadcast.update(0.1);
  assert.equal(HD.Broadcast.diagnostics.samples, 0, "New race clears old footage");
  HD.state.phase = 'racing';
  const beforeSmoothPlayback = renderCount;
  for (let i = 0; i < 60; i++) HD.Broadcast.update(1 / 60);
  assert.equal(renderCount - beforeSmoothPlayback, 60,
    'TV should render every frame at 60 fps instead of the old 20 fps cap');
  assert.ok(HD.Broadcast.diagnostics.samples >= 29 &&
    HD.Broadcast.diagnostics.samples <= 31, 'Capture poses at 30 Hz for smooth interpolation');

  console.log("Stadium geometry, ten cameras, live feed and isolated bounded replays passed.");

  function upperFloorHitsAt(angle, radiusX = 106, radiusZ = 72) {
    HD.world.scene.updateMatrixWorld(true);
    const point = HD.Stadium.oval(radiusX, radiusZ, angle);
    const raycaster = new THREE.Raycaster(
      new THREE.Vector3(point.x, 18, point.z),
      new THREE.Vector3(0, -1, 0),
      0,
      10,
    );
    const geometry = [];
    HD.world.scene.traverse((object) => {
      if (object.isMesh && !object.isSprite) geometry.push(object);
    });
    const hits = raycaster
      .intersectObjects(geometry, false)
      .filter((hit) =>
        Math.abs(hit.point.y - 13.5) < 0.08 &&
        hit.object.geometry?.type === "ExtrudeGeometry" &&
        hit.object.material?.color?.getHex() === 0xb7a47f,
      );
    return hits.length;
  }
}

function createCanvasContext() {
  const gradient = { addColorStop() {} };
  return new Proxy(
    {},
    {
      get(target, property) {
        if (property in target) return target[property];
        if (property === "createLinearGradient") return () => gradient;
        if (property === "measureText") return () => ({ width: 100 });
        return () => {};
      },
      set(target, property, value) {
        target[property] = value;
        return true;
      },
    },
  );
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
