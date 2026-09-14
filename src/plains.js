"use strict";

HD.Plains = (() => {
  function heightAt(x, z) {
    const radius = Math.hypot(x / 135, z / 98);
    const blend = THREE.MathUtils.smoothstep(radius, 1, 1.85);
    return -0.6 + blend * (
      3.6 * Math.sin(x / 115 + 0.4) * Math.cos(z / 143) +
      1.9 * Math.sin((x + z) / 77) +
      0.65 * Math.cos((x - z) / 49)
    );
  }

  function build(scene) {
    const geometry = new THREE.RingGeometry(0, 1, 160, 40);
    geometry.rotateX(-Math.PI / 2);
    geometry.scale(360, 1, 285);
    const positions = geometry.attributes.position;
    const colors = [];
    const low = new THREE.Color(0x66834e);
    const high = new THREE.Color(0x96a568);
    const color = new THREE.Color();
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), z = positions.getZ(i);
      positions.setY(i, heightAt(x, z));
      const variation = 0.48 + 0.22 * Math.sin(x / 66) * Math.cos(z / 83)
        + 0.12 * Math.sin((x + z) / 31);
      color.copy(low).lerp(high, variation);
      colors.push(color.r, color.g, color.b);
    }
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    const terrain = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({
      vertexColors: true,
    }));
    terrain.name = "Open rolling plains";
    terrain.receiveShadow = true;
    scene.add(terrain);

    let seed = 41973;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const point = (near, far) => {
      const angle = random() * Math.PI * 2;
      const distance = near + (far - near) * Math.sqrt(random());
      return [Math.cos(angle) * distance * 1.25, Math.sin(angle) * distance];
    };
    const dummy = new THREE.Object3D();
    const tuftGeometry = new THREE.BufferGeometry();
    tuftGeometry.setAttribute("position", new THREE.Float32BufferAttribute([
      -0.3, 0, 0, 0, 0.9, 0, 0.3, 0, 0,
      0, 0, -0.3, 0, 0.7, 0, 0, 0, 0.3,
    ], 3));
    tuftGeometry.computeVertexNormals();
    const grassCount = HD.Settings.modelDetail() === "low" ? 900 : 1800;
    const grass = new THREE.InstancedMesh(tuftGeometry, new THREE.MeshLambertMaterial({
      color: 0x809550, side: THREE.DoubleSide,
    }), grassCount);
    grass.name = "Instanced meadow grasses";
    for (let i = 0; i < grassCount; i++) {
      const [x, z] = point(112, 275);
      dummy.position.set(x, heightAt(x, z), z);
      const size = 0.5 + random() * 0.7;
      dummy.scale.set(size, size, size);
      dummy.rotation.set(0, random() * Math.PI, 0);
      dummy.updateMatrix();
      grass.setMatrixAt(i, dummy.matrix);
    }
    grass.computeBoundingSphere();
    scene.add(grass);

    const trunks = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.23, 0.35, 3.3, 6),
      new THREE.MeshLambertMaterial({ color: 0x68563d }), 96,
    );
    const leaves = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 10, 7),
      new THREE.MeshLambertMaterial({ color: 0x506f43 }), 96,
    );
    trunks.name = "Scattered plains tree trunks";
    leaves.name = "Scattered plains tree canopies";
    for (let i = 0; i < 96; i++) {
      const [x, z] = point(115, 265);
      const size = 1.1 + random() * 1.2;
      dummy.position.set(x, heightAt(x, z) + 1.65 * size, z);
      dummy.scale.set(size, size, size);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      dummy.position.y = heightAt(x, z) + 4 * size;
      dummy.scale.set(2.6 * size, 2 * size, 2.3 * size);
      dummy.updateMatrix();
      leaves.setMatrixAt(i, dummy.matrix);
    }
    for (const batch of [trunks, leaves]) {
      batch.computeBoundingSphere();
      scene.add(batch);
    }
    const bushes = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 8, 6),
      new THREE.MeshLambertMaterial({ color: 0x587444 }), 240,
    );
    bushes.name = 'Plains shrub clusters';
    for (let i = 0; i < bushes.count; i++) {
      const [x, z] = point(112, 278);
      const size = 0.7 + random() * 1.1;
      dummy.position.set(x, heightAt(x, z) + size * 0.5, z);
      dummy.scale.set(size * 1.5, size, size);
      dummy.updateMatrix();
      bushes.setMatrixAt(i, dummy.matrix);
    }
    bushes.computeBoundingSphere();
    scene.add(bushes);

    // A continuous earth skirt gives the playable landscape a deliberate edge.
    const edgePositions = [];
    for (let i = 0; i < 160; i++) {
      const a = i / 160 * Math.PI * 2;
      const b = (i + 1) / 160 * Math.PI * 2;
      const x = Math.cos(a) * 360, z = Math.sin(a) * 285;
      const nx = Math.cos(b) * 360, nz = Math.sin(b) * 285;
      edgePositions.push(x, heightAt(x, z), z, nx, heightAt(nx, nz), nz,
        x, -19.8, z, nx, heightAt(nx, nz), nz, nx, -19.8, nz, x, -19.8, z);
    }
    const edgeGeometry = new THREE.BufferGeometry();
    edgeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(edgePositions, 3));
    edgeGeometry.computeVertexNormals();
    const edge = new THREE.Mesh(edgeGeometry,
      new THREE.MeshLambertMaterial({ color: 0x82755b, side: THREE.DoubleSide }));
    edge.name = 'Continuous plains earth boundary';
    scene.add(edge);

    const mountains = new THREE.Group();
    mountains.name = 'Distant mountain horizon';
    for (let i = 0; i < 24; i++) {
      const angle = i / 24 * Math.PI * 2;
      const height = 65 + random() * 75;
      const peak = new THREE.Mesh(
        new THREE.ConeGeometry(70 + random() * 50, height, 7),
        new THREE.MeshLambertMaterial({ color: i % 2 ? 0x8da6af : 0x9aafb7, fog: false }),
      );
      peak.position.set(Math.cos(angle) * 720, height / 2 - 20, Math.sin(angle) * 720);
      peak.scale.set(1.4, 1, 1);
      peak.rotation.y = angle;
      mountains.add(peak);
    }
    scene.add(mountains);
    HD.world.plains = { terrain, grass, trunks, leaves, bushes, edge, mountains };
  }
  return { build, heightAt };
})();
