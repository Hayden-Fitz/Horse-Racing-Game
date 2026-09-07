import { createHash } from "node:crypto";
import * as THREE from "../vendor/three.module.js";

// Share only perfectly identical vertices (including normals, colors and UVs).
// Unlike simplification/rounded welding, this cannot alter the surface.
export function indexIdenticalVertices(geometry) {
  const attributes = Object.entries(geometry.attributes);
  const unique = new Map();
  const retained = [];
  const remap = [];
  for (let vertex = 0; vertex < geometry.attributes.position.count; vertex++) {
    const values = [];
    for (const [, attribute] of attributes) {
      for (let component = 0; component < attribute.itemSize; component++) {
        values.push(attribute.array[vertex * attribute.itemSize + component]);
      }
    }
    const key = values.join(",");
    if (!unique.has(key)) {
      unique.set(key, retained.length);
      retained.push(vertex);
    }
    remap.push(unique.get(key));
  }
  const compact = new THREE.BufferGeometry();
  for (const [name, attribute] of attributes) {
    const values = new attribute.array.constructor(retained.length * attribute.itemSize);
    retained.forEach((vertex, index) => {
      for (let component = 0; component < attribute.itemSize; component++) {
        values[index * attribute.itemSize + component] =
          attribute.array[vertex * attribute.itemSize + component];
      }
    });
    compact.setAttribute(name, new THREE.BufferAttribute(values, attribute.itemSize, attribute.normalized));
  }
  compact.setIndex(geometry.index
    ? Array.from(geometry.index.array, (vertex) => remap[vertex]) : remap);
  for (const group of geometry.groups) compact.addGroup(group.start, group.count, group.materialIndex);
  return compact;
}

// Order-independent fingerprint of every original triangle and its normals.
// Material grouping may reorder triangles, but must never change their shape.
export function geometryFingerprint(scene) {
  const triangles = [];
  scene.traverse((object) => {
    if (!object.isMesh) return;
    const geometry = object.geometry;
    const position = geometry.attributes.position;
    const normal = geometry.attributes.normal;
    const count = geometry.index?.count || position.count;
    for (let index = 0; index < count; index += 3) {
      const values = [];
      for (let corner = 0; corner < 3; corner++) {
        const vertex = geometry.index ? geometry.index.getX(index + corner) : index + corner;
        for (const attribute of [position, normal]) {
          if (attribute) values.push(attribute.getX(vertex), attribute.getY(vertex), attribute.getZ(vertex));
        }
      }
      triangles.push(values.join(","));
    }
  });
  return createHash("sha256").update(triangles.sort().join("\n")).digest("hex");
}
