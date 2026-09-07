import * as THREE from "../vendor/three.module.js";

// A small studio reflection map gives gold a readable sheen without adding
// per-item lights, image downloads, or a render loop for reflections.
export function createModelEnvironment(renderer) {
  const room = new THREE.Scene();
  const enclosure = new THREE.Mesh(
    new THREE.BoxGeometry(12, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0x899db0, side: THREE.BackSide }),
  );
  room.add(enclosure);
  for (const [x, y, z] of [[-4, 3, 0], [4, 2, 1], [0, 4, -4]]) {
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(3, 5),
      new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }),
    );
    panel.position.set(x, y, z);
    panel.lookAt(0, 0, 0);
    room.add(panel);
  }
  const generator = new THREE.PMREMGenerator(renderer);
  const target = generator.fromScene(room);
  generator.dispose();
  room.traverse((object) => {
    object.geometry?.dispose();
    object.material?.dispose();
  });
  return target;
}
