import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "../vendor/three.module.js";
import { GLTFLoader } from "../vendor/loaders/GLTFLoader.js";
import { GLTFExporter } from "../vendor/GLTFExporter.js";
import { mergeVertices } from "../vendor/utils/BufferGeometryUtils.js";
import { MeshoptSimplifier } from "../vendor/meshopt_simplifier.module.js";
import { MODEL_CATALOG } from "../assets/Models/catalog.mjs";

// GLTFExporter uses FileReader even for untextured, binary-only exports.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((result) => {
      this.result = result;
      this.onloadend?.();
    });
  }
};

const sourceDirectory = process.argv[2];
if (!sourceDirectory) throw new Error("Provide the folder containing the original GLBs.");
const outputDirectory = fileURLToPath(new URL("../assets/Models/optimized/", import.meta.url));
await fs.mkdir(outputDirectory, { recursive: true });
await MeshoptSimplifier.ready;
const report = [];

for (const [id, entry] of Object.entries(MODEL_CATALOG)) {
  const source = await fs.readFile(path.join(sourceDirectory, entry.source));
  const gltf = await new GLTFLoader().parseAsync(
    source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength), "",
  );
  const beforeBounds = new THREE.Box3().setFromObject(gltf.scene);
  let originalTriangles = 0;
  let triangles = 0;

  gltf.scene.traverse((object) => {
    if (!object.isMesh) return;
    const original = object.geometry;
    originalTriangles += (original.index?.count || original.attributes.position.count) / 3;
    let geometry = mergeVertices(original, 0.00001);
    const positions = geometry.attributes.position;
    const indices = new Uint32Array(geometry.index.array);
    const target = Math.min(indices.length, entry.triangles * 3);
    const [simplified] = MeshoptSimplifier.simplify(
      indices, new Float32Array(positions.array), 3, target, 0.008,
    );

    // Compact all attributes together, retaining the original vertex colors and
    // normals. Dropping unused vertices saves download and GPU memory.
    const unique = [...new Set(simplified)];
    const remap = new Map(unique.map((vertex, index) => [vertex, index]));
    const compact = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(geometry.attributes)) {
      const values = new attribute.array.constructor(unique.length * attribute.itemSize);
      unique.forEach((vertex, index) => {
        for (let component = 0; component < attribute.itemSize; component++) {
          values[index * attribute.itemSize + component] =
            attribute.array[vertex * attribute.itemSize + component];
        }
      });
      compact.setAttribute(name, new THREE.BufferAttribute(values, attribute.itemSize, attribute.normalized));
    }
    compact.setIndex(Array.from(simplified, (vertex) => remap.get(vertex)));
    const colors = compact.getAttribute("color");
    // The exported gold horseshoe/hotdog and pillow are almost black. Give
    // those assets readable, intentional materials while keeping their shape.
    const replacement = entry.gold ? 0xe5ac32
      : id === "horseshoe" ? 0x8297ae
        : id === "pillow" ? 0x8754aa : null;
    if (colors && replacement !== null) {
      const tint = new THREE.Color(replacement);
      for (let vertex = 0; vertex < colors.count; vertex++) {
        const greenLeaf = id === "goldenCarrot" &&
          colors.getY(vertex) > colors.getX(vertex) * 1.3;
        if (!greenLeaf) colors.setXYZ(vertex, tint.r, tint.g, tint.b);
      }
    }
    compact.computeBoundingBox();
    compact.computeBoundingSphere();
    object.geometry = compact;
    triangles += simplified.length / 3;
    geometry.dispose();
    original.dispose();
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      material.roughness = entry.gold ? 0.24 : 0.62;
      material.metalness = entry.gold ? 0.65 : 0.02;
    }
  });

  const binary = await new GLTFExporter().parseAsync(gltf.scene, { binary: true });
  await fs.writeFile(path.join(outputDirectory, `${id}.glb`), Buffer.from(binary));
  const result = {
    id, source: entry.source, sourceBytes: source.length, bytes: binary.byteLength,
    originalTriangles, triangles,
    sourceSize: beforeBounds.getSize(new THREE.Vector3()).toArray(),
    requiresRig: Boolean(entry.requiresRig),
  };
  report.push(result);
  console.log(JSON.stringify(result));
}

await fs.writeFile(path.join(outputDirectory, "report.json"), JSON.stringify(report, null, 2) + "\n");
