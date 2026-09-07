"use strict";

// Hand-built from the user's September 7 screenshots. No imported geometry,
// decoding, external textures or reflection maps are required by gameplay.
HD.ReferenceModels = (() => {
  const T = THREE;
  const palette = {
    blue: 0x123cdb, foam: 0x536fff, red: 0xda1529, orange: 0xff830b,
    bun: 0xe7ad70, wood: 0xa77543, oats: 0xd4b384, cream: 0xffedb0,
    white: 0xf1f1eb, silver: 0xa6b4bd, dark: 0x282e31, gold: 0xe7b62e,
    green: 0x18a536, tennis: 0xb5f348,
  };
  const templates = new Map();
  const materials = new Map();
  const sizes = {
    hotdog: 1.35, soda: 1.15, horseshoe: 0.95, carrot: 1.4,
    hurdle: 1.8, pillow: 1.15, chair: 1.8, performanceOats: 1.45,
    popcorn: 1.3, waterBottle: 1.15, tennisBall: 0.64, beachBall: 1.04,
    trafficCone: 1.55, frisbee: 1.1, goldenCarrot: 1.4,
    goldenHorseshoe: 0.95, goldenHotdog: 1.35,
  };

  function material(color, transparent = false) {
    const key = `${color}:${transparent}`;
    if (!materials.has(key)) {
      materials.set(key, new T.MeshStandardMaterial({
        color, roughness: 0.82, metalness: 0,
        transparent, opacity: transparent ? 0.3 : 1,
        depthWrite: !transparent, envMapIntensity: 0,
      }));
    }
    return materials.get(key);
  }

  function add(parent, geometry, color, x = 0, y = 0, z = 0) {
    const object = new T.Mesh(geometry, material(color));
    object.position.set(x, y, z);
    parent.add(object);
    return object;
  }

  function box(parent, w, h, d, color, x = 0, y = 0, z = 0) {
    return add(parent, new T.BoxGeometry(w, h, d), color, x, y, z);
  }

  function cylinder(parent, r1, r2, h, color, x = 0, y = 0, z = 0, sides = 16) {
    return add(parent, new T.CylinderGeometry(r1, r2, h, sides), color, x, y, z);
  }

  function sphere(parent, r, color, x = 0, y = 0, z = 0) {
    return add(parent, new T.SphereGeometry(r, 12, 8), color, x, y, z);
  }

  function tube(parent, points, radius, color, segments = 24) {
    return add(parent, new T.TubeGeometry(new T.CatmullRomCurve3(points), segments, radius, 5, false), color);
  }

  function capsule(parent, radius, length, color, x = 0, y = 0, z = 0) {
    return add(parent, new T.CapsuleGeometry(radius, length, 3, 10), color, x, y, z);
  }

  function cushion(parent, color, y = 0) {
    const shape = new T.Shape();
    shape.moveTo(-0.4, -0.5);
    shape.lineTo(0.4, -0.5);
    shape.quadraticCurveTo(0.57, -0.5, 0.57, -0.32);
    shape.lineTo(0.57, 0.32);
    shape.quadraticCurveTo(0.57, 0.5, 0.38, 0.5);
    shape.lineTo(-0.38, 0.5);
    shape.quadraticCurveTo(-0.57, 0.5, -0.57, 0.32);
    shape.lineTo(-0.57, -0.32);
    shape.quadraticCurveTo(-0.57, -0.5, -0.4, -0.5);
    const geometry = new T.ExtrudeGeometry(shape, {
      depth: 0.1, bevelEnabled: true, bevelSize: 0.045,
      bevelThickness: 0.04, bevelSegments: 2, curveSegments: 5,
    });
    geometry.rotateX(-Math.PI / 2);
    add(parent, geometry, color, 0, y, 0);
    const button = cylinder(parent, 0.075, 0.075, 0.015, color, 0, y + 0.146, 0);
    button.userData.detail = "center-button";
  }

  function hotdog(root, gold = false) {
    for (const z of [-0.16, 0.16]) {
      const bun = capsule(root, 0.19, 1.08, gold ? palette.gold : palette.bun, 0, -0.045, z);
      bun.rotation.z = Math.PI / 2;
      bun.scale.z = 0.8;
    }
    const sausage = capsule(root, 0.145, 1.1, gold ? palette.gold : palette.orange, 0, 0.105);
    sausage.rotation.z = Math.PI / 2;
    for (let stripe = 0; stripe < 2; stripe++) {
      const points = Array.from({ length: 37 }, (_, i) => new T.Vector3(
        -0.52 + i / 36 * 1.04,
        0.252 + stripe * 0.003,
        Math.sin(i / 36 * Math.PI * 9 + stripe * Math.PI) * 0.075,
      ));
      tube(root, points, 0.018, gold ? 0xbf8e1f : stripe ? 0xf2cf16 : palette.red, 36);
    }
  }

  function carrot(root, gold = false) {
    const body = add(root, new T.LatheGeometry([
      new T.Vector2(0.01, -0.62), new T.Vector2(0.06, -0.48),
      new T.Vector2(0.13, -0.13), new T.Vector2(0.17, 0.2),
      new T.Vector2(0.14, 0.32), new T.Vector2(0, 0.35),
    ], 14), gold ? palette.gold : palette.orange);
    for (const x of [-0.08, 0, 0.08]) {
      const leaf = capsule(root, 0.044, 0.22, palette.green, x, 0.44, 0);
      leaf.rotation.z = -x * 2;
    }
    for (let i = 0; i < 5; i++) {
      const mark = add(root, new T.TorusGeometry(0.065 + i * 0.017, 0.009, 3, 8, 1.2), gold ? 0xb58919 : 0xb8540c, 0, -0.34 + i * 0.125);
      mark.rotation.x = Math.PI / 2;
      mark.rotation.z = i * 1.3;
    }
    root.rotation.z = -Math.PI / 2;
    body.userData.detail = "tapered-carrot";
  }

  function horseshoe(root, gold = false) {
    const shape = new T.Shape();
    shape.absarc(0, 0, 0.5, -0.38, Math.PI + 0.38, false);
    shape.absarc(-0.38, -0.16, 0.115, Math.PI + 0.38, Math.PI * 2 + 0.38, false);
    shape.absarc(0, 0, 0.27, Math.PI + 0.38, -0.38, true);
    shape.absarc(0.38, -0.16, 0.115, Math.PI - 0.38, Math.PI * 2 - 0.38, false);
    shape.closePath();
    for (let i = 0; i < 7; i++) {
      const angle = 0.13 + i / 6 * (Math.PI - 0.26);
      const hole = new T.Path();
      hole.absarc(Math.cos(angle) * 0.39, Math.sin(angle) * 0.39, 0.037, 0, Math.PI * 2, true);
      shape.holes.push(hole);
    }
    const geometry = new T.ExtrudeGeometry(shape, { depth: 0.075, bevelEnabled: false, curveSegments: 16 });
    geometry.rotateX(-Math.PI / 2);
    add(root, geometry, gold ? palette.gold : palette.foam);
  }

  function label(root, text, foreground, background, width, height, position) {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 160;
    const c = canvas.getContext("2d");
    c.fillStyle = background;
    c.fillRect(0, 0, 256, 160);
    c.fillStyle = foreground;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.font = "bold 52px Georgia";
    const lines = text.split("\n");
    lines.forEach((line, i) => c.fillText(line, 128, 80 + (i - (lines.length - 1) / 2) * 58));
    const texture = new T.CanvasTexture(canvas);
    texture.colorSpace = T.SRGBColorSpace;
    const mesh = new T.Mesh(new T.PlaneGeometry(width, height), new T.MeshBasicMaterial({ map: texture, toneMapped: false }));
    mesh.position.set(...position);
    root.add(mesh);
  }

  function oats(root) {
    box(root, 0.64, 0.82, 0.32, palette.oats);
    const roof = new T.BufferGeometry();
    roof.setAttribute("position", new T.Float32BufferAttribute([
      -0.32,0.41,0.16, 0.32,0.41,0.16, 0.32,0.65,0,
      -0.32,0.41,0.16, 0.32,0.65,0, -0.32,0.65,0,
      0.32,0.41,-0.16, -0.32,0.41,-0.16, -0.32,0.65,0,
      0.32,0.41,-0.16, -0.32,0.65,0, 0.32,0.65,0,
      -0.32,0.41,-0.16, -0.32,0.41,0.16, -0.32,0.65,0,
      0.32,0.41,0.16, 0.32,0.41,-0.16, 0.32,0.65,0,
    ], 3));
    roof.computeVertexNormals();
    add(root, roof, palette.oats);
    box(root, 0.66, 0.035, 0.05, palette.oats, 0, 0.66);
    box(root, 0.65, 0.09, 0.33, palette.blue, 0, -0.38);
    box(root, 0.13, 0.23, 0.02, palette.blue, 0, 0.45, 0.175).rotation.x = -0.4;
    label(root, "OATS", "#24448f", "#d4b384", 0.56, 0.22, [0, 0.19, 0.165]);
    box(root, 0.49, 0.27, 0.018, 0x8c7858, 0, -0.11, 0.167);
    for (let i = 0; i < 30; i++) {
      const grain = sphere(root, 0.025, i % 2 ? 0xb6a17a : 0xcebb90,
        ((i * 17) % 29) / 29 * 0.43 - 0.215, -0.22 + ((i * 7) % 23) / 23 * 0.21, 0.184);
      grain.scale.set(1.4, 0.5, 0.36);
      grain.rotation.z = i * 2.4;
    }
  }

  function popcorn(root) {
    box(root, 0.58, 0.82, 0.42, palette.white);
    for (let i = 0; i < 7; i++) {
      for (const side of [-1, 1]) {
        box(root, 0.043, 0.82, 0.006, palette.red, -0.26 + i * 0.086, 0, side * 0.214);
      }
    }
    for (let i = 0; i < 18; i++) {
      sphere(root, 0.078, palette.cream,
        ((i * 7) % 17) / 17 * 0.47 - 0.235,
        0.43 + (i % 3) * 0.036,
        ((i * 11) % 17) / 17 * 0.3 - 0.15);
    }
    label(root, "POP\nCORN", "#b31526", "#f1f1eb", 0.4, 0.25, [0, 0.04, 0.223]);
  }

  function soda(root) {
    cylinder(root, 0.23, 0.23, 0.7, palette.red);
    cylinder(root, 0.205, 0.23, 0.09, palette.red, 0, 0.395);
    cylinder(root, 0.215, 0.215, 0.027, palette.silver, 0, 0.455);
    cylinder(root, 0.23, 0.22, 0.03, palette.silver, 0, -0.355);
    const ring = add(root, new T.TorusGeometry(0.21, 0.012, 5, 24), palette.silver, 0, 0.474);
    ring.rotation.x = Math.PI / 2;
    const tab = add(root, new T.TorusGeometry(0.047, 0.016, 5, 12), palette.silver, 0, 0.486, 0.01);
    tab.rotation.x = Math.PI / 2;
    tab.scale.y = 1.6;
    const opening = sphere(root, 0.055, palette.dark, 0, 0.475, 0.09);
    opening.scale.y = 0.07;
    const vertices = [];
    const point = (a, edge) => [Math.cos(a) * 0.234, Math.sin(a * 2) * 0.14 + edge * 0.105, Math.sin(a) * 0.234];
    for (let i = 0; i < 48; i++) {
      const a = i / 48 * Math.PI * 2;
      const b = (i + 1) / 48 * Math.PI * 2;
      vertices.push(...point(a, -1), ...point(a, 1), ...point(b, 1),
        ...point(a, -1), ...point(b, 1), ...point(b, -1));
    }
    const wrap = new T.BufferGeometry();
    wrap.setAttribute("position", new T.Float32BufferAttribute(vertices, 3));
    wrap.computeVertexNormals();
    add(root, wrap, palette.white);
  }

  function waterBottle(root) {
    const body = cylinder(root, 0.19, 0.19, 0.76, 0x98d7ec, 0, 0, 0, 8);
    body.material = material(0x91cee2, true);
    cylinder(root, 0.17, 0.17, 0.32, 0x2289c1, 0, -0.2, 0, 8);
    cylinder(root, 0.095, 0.19, 0.2, 0xafddec, 0, 0.48, 0, 8).material = body.material;
    cylinder(root, 0.1, 0.1, 0.12, 0x075bbb, 0, 0.64);
    cylinder(root, 0.195, 0.195, 0.22, 0x115cb9, 0, 0.04, 0, 8);
    for (const y of [-0.3, -0.19, 0.3]) {
      const ring = add(root, new T.TorusGeometry(0.184, 0.01, 4, 8), 0x69a6c2, 0, y);
      ring.rotation.x = Math.PI / 2;
    }
    const drop = sphere(root, 0.064, 0xbce9fa, 0, 0.032, 0.2);
    drop.scale.set(0.75, 1.1, 0.15);
    add(root, new T.ConeGeometry(0.04, 0.09, 8), 0xbce9fa, 0, 0.1, 0.2);
  }

  function chair(root) {
    cushion(root, palette.blue);
    for (const x of [-0.43, 0.43]) {
      for (const z of [-0.35, 0.35]) {
        const leg = cylinder(root, 0.065, 0.07, 0.85, palette.wood, x, -0.46, z);
        leg.rotation.z = x * 0.12;
      }
      cylinder(root, 0.065, 0.065, 0.95, palette.wood, x, 0.58, -0.36);
    }
    box(root, 1, 0.4, 0.11, palette.wood, 0, 0.85, -0.36);
  }

  function hurdle(root) {
    for (const x of [-0.7, 0.7]) {
      box(root, 0.48, 0.15, 0.38, palette.dark, x, -0.5);
      cylinder(root, 0.07, 0.09, 1, 0x083cbb, x, 0);
      sphere(root, 0.095, 0x083cbb, x, 0.51);
    }
    for (let i = 0; i < 9; i++) {
      cylinder(root, 0.034, 0.034, 1.4 / 9, i % 2 ? palette.blue : palette.white, -0.7 + (i + 0.5) * 1.4 / 9, 0.42).rotation.z = Math.PI / 2;
    }
  }

  function beachBall(root) {
    for (let i = 0; i < 6; i++) {
      add(root, new T.SphereGeometry(0.5, 6, 10, i * Math.PI / 3, Math.PI / 3),
        [palette.red, palette.white, 0x0b88d8][i % 3]);
    }
    cylinder(root, 0.095, 0.095, 0.015, palette.white, 0, 0.5);
  }

  function tennisBall(root) {
    sphere(root, 0.32, palette.tennis);
    const points = Array.from({ length: 65 }, (_, i) => {
      const a = i / 64 * Math.PI * 2;
      const y = Math.sin(a * 2) * 0.18;
      const radius = Math.sqrt(0.322 ** 2 - y * y);
      return new T.Vector3(Math.cos(a) * radius, y, Math.sin(a) * radius);
    });
    tube(root, points, 0.01, palette.white, 64);
  }

  function trafficCone(root) {
    box(root, 0.83, 0.06, 0.83, 0xeb5b06, 0, -0.46);
    for (let i = 0; i < 5; i++) {
      cylinder(root, 0.34 - (i + 1) * 0.05, 0.34 - i * 0.05, 0.16,
        i % 2 ? palette.white : 0xeb5b06, 0, -0.34 + i * 0.16);
    }
    cylinder(root, 0.056, 0.056, 0.004, palette.dark, 0, 0.385);
  }

  function frisbee(root) {
    cylinder(root, 0.5, 0.52, 0.065, 0xce2f14);
    const rim = add(root, new T.TorusGeometry(0.49, 0.025, 4, 32), 0xce2f14, 0, 0.036);
    rim.rotation.x = Math.PI / 2;
    const stripe = add(root, new T.TorusGeometry(0.34, 0.024, 4, 32), palette.white, 0, 0.04);
    stripe.rotation.x = Math.PI / 2;
    const icon = add(root, new T.ConeGeometry(0.035, 0.25, 10), palette.white, 0, 0.045);
    icon.rotation.z = Math.PI / 2;
    icon.scale.z = 0.15;
  }

  const builders = {
    hotdog, soda, horseshoe, carrot, hurdle, chair,
    pillow: (root) => cushion(root, palette.blue),
    performanceOats: oats, popcorn, waterBottle, beachBall, tennisBall,
    trafficCone, frisbee,
    goldenCarrot: (root) => carrot(root, true),
    goldenHorseshoe: (root) => horseshoe(root, true),
    goldenHotdog: (root) => hotdog(root, true),
  };

  function create(id) {
    if (!builders[id]) return null;
    if (!templates.has(id)) {
      const construction = new T.Group();
      builders[id](construction);
      const content = batchStaticMeshes(construction);
      const bounds = new T.Box3().setFromObject(content);
      const size = bounds.getSize(new T.Vector3());
      const center = bounds.getCenter(new T.Vector3());
      const pivot = new T.Group();
      content.position.sub(center);
      pivot.add(content);
      pivot.scale.setScalar(sizes[id] / Math.max(size.x, size.y, size.z));
      const root = new T.Group();
      root.add(pivot);
      root.userData.referenceModel = id;
      templates.set(id, root);
    }
    return templates.get(id).clone(true);
  }

  function batchStaticMeshes(root) {
    root.updateMatrixWorld(true);
    const batches = new Map();
    root.traverse((object) => {
      if (!object.isMesh) return;
      const key = object.material.uuid;
      if (!batches.has(key)) batches.set(key, { material: object.material, positions: [], normals: [], uvs: [] });
      const batch = batches.get(key);
      const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
      geometry.applyMatrix4(object.matrixWorld);
      batch.positions.push(...geometry.attributes.position.array);
      batch.normals.push(...geometry.attributes.normal.array);
      const uv = geometry.attributes.uv;
      batch.uvs.push(...(uv ? uv.array : new Float32Array(geometry.attributes.position.count * 2)));
      geometry.dispose();
      object.geometry.dispose();
    });
    const compact = new T.Group();
    batches.forEach((batch) => {
      const geometry = new T.BufferGeometry();
      geometry.setAttribute("position", new T.Float32BufferAttribute(batch.positions, 3));
      geometry.setAttribute("normal", new T.Float32BufferAttribute(batch.normals, 3));
      geometry.setAttribute("uv", new T.Float32BufferAttribute(batch.uvs, 2));
      geometry.computeBoundingSphere();
      compact.add(new T.Mesh(geometry, batch.material));
    });
    return compact;
  }

  return { create, sizes, palette };
})();
