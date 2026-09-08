// Material-only restoration. Original triangle positions, normals and topology
// are retained; these files never pass through the old mesh simplifier.
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import * as THREE from "../vendor/three.module.js";
import { GLTFLoader } from "../vendor/loaders/GLTFLoader.js";
import { GLTFExporter } from "../vendor/GLTFExporter.js";
import { MODEL_CATALOG } from "../assets/Models/catalog.mjs";
import { geometryFingerprint, indexIdenticalVertices } from "./model-geometry.mjs";
import { attachSodaLabel } from "./soda-label.mjs";

globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((result) => {
      this.result = result;
      this.onloadend?.();
    });
  }
};

const sourceDirectory = process.argv[2];
if (!sourceDirectory) throw new Error("Provide the original GLB directory.");
const output = new URL("../assets/Models/corrected/", import.meta.url);
await fs.mkdir(output, { recursive: true });

// Tinkercad exports a single mesh, even for pieces with different finishes.
// Identify connected pieces in its Z-up local coordinates, without moving them.
function components(geometry) {
  const position = geometry.attributes.position;
  const parent = Array.from({ length: position.count }, (_, index) => index);
  const root = (index) => parent[index] === index
    ? index : (parent[index] = root(parent[index]));
  const join = (a, b) => { parent[root(a)] = root(b); };
  const keys = new Map();
  for (let index = 0; index < position.count; index++) {
    const key = [position.getX(index), position.getY(index), position.getZ(index)]
      .map((value) => value.toFixed(4)).join(",");
    if (keys.has(key)) join(index, keys.get(key));
    else keys.set(key, index);
  }
  const indices = geometry.index?.array || parent.map((_, index) => index);
  for (let index = 0; index < indices.length; index += 3) {
    join(indices[index], indices[index + 1]);
    join(indices[index], indices[index + 2]);
  }
  const groups = new Map();
  for (let index = 0; index < position.count; index++) {
    const key = root(index);
    if (!groups.has(key)) groups.set(key, new THREE.Box3());
    groups.get(key).expandByPoint(new THREE.Vector3().fromBufferAttribute(position, index));
  }
  return Array.from({ length: position.count }, (_, index) => groups.get(root(index)));
}

function splitPlayerBase(scene) {
  let original;
  scene.traverse((object) => {
    if (object.isMesh && !original) original = object;
  });
  if (!original) throw new Error("The player export has no mesh.");

  const geometry = original.geometry;
  const position = geometry.attributes.position;
  const pieceForVertex = components(geometry);
  const verticesByPiece = new Map();
  for (let vertex = 0; vertex < position.count; vertex++) {
    const piece = pieceForVertex[vertex];
    if (!verticesByPiece.has(piece)) verticesByPiece.set(piece, []);
    verticesByPiece.get(piece).push(vertex);
  }

  function partName(box) {
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const side = center.y > 57.2 ? "Left" : "Right";
    if (box.max.z < 7) return `shoe${side}`;
    if (box.min.z < 1 && box.max.z > 25 && size.z < 29) return `leg${side}`;
    if (box.max.z > 70) return "head";
    if (size.z > 25 && box.min.z > 20 && size.y > 15 && size.x < 12) {
      return `arm${side}`;
    }
    if (box.min.z > 47 && box.max.z < 54) return `sleeve${side}`;
    if (box.min.z > 53 && box.max.z < 57) return "collar";
    if (size.z < 4 && center.z < 30) return "waist";
    return "torso";
  }

  const parent = original.parent;
  const created = [];
  for (const [box, vertices] of verticesByPiece) {
    const partGeometry = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(geometry.attributes)) {
      const values = new attribute.array.constructor(vertices.length * attribute.itemSize);
      vertices.forEach((vertex, index) => {
        for (let component = 0; component < attribute.itemSize; component++) {
          values[index * attribute.itemSize + component] =
            attribute.array[vertex * attribute.itemSize + component];
        }
      });
      partGeometry.setAttribute(
        name,
        new THREE.BufferAttribute(values, attribute.itemSize, attribute.normalized),
      );
    }
    const part = new THREE.Mesh(partGeometry, original.material);
    part.name = `HDPlayer_${partName(box)}`;
    part.position.copy(original.position);
    part.quaternion.copy(original.quaternion);
    part.scale.copy(original.scale);
    parent.add(part);
    created.push(part);
  }
  parent.remove(original);
  geometry.dispose();
  return created;
}

// Optional asset ID supports focused material edits without rebuilding the
// unrelated exports. Keep all other manifest entries intact.
const selectedId = process.argv[3];
if (selectedId && !Object.hasOwn(MODEL_CATALOG, selectedId)) {
  throw new Error(`Unknown model: ${selectedId}`);
}
const report = selectedId
  ? JSON.parse(await fs.readFile(new URL("report.json", output), "utf8"))
  : [];
const stagedAssets = new Map();
for (const [id, entry] of Object.entries(MODEL_CATALOG)) {
  if (selectedId && id !== selectedId) continue;
  const source = await fs.readFile(path.join(sourceDirectory, entry.source));
  const scene = (await new GLTFLoader().parseAsync(
    source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength), "",
  )).scene;
  const originalGeometry = geometryFingerprint(scene);
  if (id === "playerBase") splitPlayerBase(scene);
  let triangles = 0;
  scene.traverse((object) => {
    if (!object.isMesh) return;
    const geometry = object.geometry;
    const colors = geometry.attributes.color;
    const pieces = ["chair", "waterBottle", "soda"].includes(id) ? components(geometry) : null;
    const finishes = [];
    const uv = id === "soda" ? new Float32Array(colors.count * 2) : null;
    const tint = new THREE.Color();
    for (let index = 0; index < colors.count; index++) {
      tint.fromBufferAttribute(colors, index);
      let finish = 0;
      if (id === "goldenHotdog" || id === "goldenHorseshoe") tint.setRGB(0.89, 0.72, 0.24);
      if (id === "horseshoe") tint.setRGB(0.45, 0.53, 0.87);
      if (id === "pillow") tint.setRGB(0.065, 0.20, 0.79);
      if (id === "chair" && pieces[index].max.z - pieces[index].min.z > 20) {
        tint.setRGB(0.64, 0.44, 0.25);
      }
      if (id === "chair" && pieces[index].max.z < 93) tint.setRGB(0.64, 0.44, 0.25);
      if (id === "waterBottle") {
        const piece = pieces[index];
        if (piece.min.z < 1 && piece.max.z > 120) {
          tint.setRGB(0.65, 0.84, 0.91);
          finish = 1;
        } else if (piece.min.z < 1) {
          tint.setRGB(0.35, 0.69, 0.86);
          finish = 2;
        }
      }
      if (id === "playerBase" && geometry.attributes.position.getZ(index) < 7) {
        tint.setRGB(0.169, 0.18, 0.192);
      }
      if (id === "playerBase") {
        const sourceColor = tint.clone();
        if (sourceColor.b > sourceColor.r * 1.8) finish = 1;
        if (sourceColor.r < 0.3 && sourceColor.g < 0.3 && sourceColor.b < 0.3) finish = 2;
        if (geometry.attributes.position.getZ(index) < 7) finish = 2;
        // glTF loaders enable vertex colors whenever COLOR_0 is present.
        // Keep this channel neutral so customizable materials are not tinted
        // a second time by the original blue shirt or tan skin palette.
        tint.setRGB(1, 1, 1);
      }
      if (id === "soda") {
        const piece = pieces[index];
        if (piece.max.x - piece.min.x > 50.25) {
          finish = 1;
          tint.setRGB(1, 1, 1);
        }
        const position = geometry.attributes.position;
        uv[index * 2] = Math.atan2(position.getY(index) + 7.75, position.getX(index) - 8.75) / (Math.PI * 2) + 0.5;
        uv[index * 2 + 1] = (position.getZ(index) - 2.6995) / 78.537;
      }
      // The original palette values are display/sRGB colors, not linear light.
      tint.convertSRGBToLinear();
      colors.setXYZ(index, tint.r, tint.g, tint.b);
      finishes.push(finish);
    }
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: entry.gold ? 0.3 : 0.76,
      metalness: entry.gold ? 0.22 : 0,
      envMapIntensity: 0.35,
    });
    object.material = material;
    if (id === "playerBase") {
      const skinMaterial = material.clone();
      skinMaterial.name = "Player skin";
      skinMaterial.vertexColors = false;
      skinMaterial.color.set(0xe2c095);
      const shirtMaterial = skinMaterial.clone();
      shirtMaterial.name = "Player shirt";
      shirtMaterial.color.set(0x003fd0);
      const darkMaterial = skinMaterial.clone();
      darkMaterial.name = "Player dark";
      darkMaterial.color.set(0x2b2e31);
      object.material = [skinMaterial, shirtMaterial, darkMaterial];
    }
    if (id === "soda") {
      // Keep each seam triangle on one side of the repeat boundary.
      for (let index = 0; index < colors.count; index += 3) {
        const values = [uv[index * 2], uv[(index + 1) * 2], uv[(index + 2) * 2]];
        if (Math.max(...values) - Math.min(...values) > 0.5) {
          for (let corner = 0; corner < 3; corner++) {
            if (values[corner] < 0.5) uv[(index + corner) * 2] += 1;
          }
        }
      }
      geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
      const wrapper = material.clone();
      wrapper.name = "Soda printed wrapper";
      wrapper.roughness = 0.55;
      object.material = [material, wrapper];
    }
    if (id === "waterBottle") {
      const plastic = material.clone();
      plastic.transparent = true;
      plastic.opacity = 0.28;
      plastic.depthWrite = false;
      plastic.roughness = 0.2;
      plastic.side = THREE.DoubleSide;
      const water = plastic.clone();
      water.opacity = 0.2;
      object.material = [material, plastic, water];
    }
    if (Array.isArray(object.material)) {
      const original = geometry.index?.array || finishes.map((_, index) => index);
      const batches = object.material.map(() => []);
      for (let index = 0; index < original.length; index += 3) {
        const vertices = [original[index], original[index + 1], original[index + 2]];
        batches[finishes[vertices[0]]].push(...vertices);
      }
      geometry.clearGroups();
      let start = 0;
      batches.forEach((batch, finish) => {
        if (!batch.length) return;
        geometry.addGroup(start, batch.length, finish);
        start += batch.length;
      });
      geometry.setIndex(batches.flat());
    }
    triangles += (geometry.index?.count || geometry.attributes.position.count) / 3;
    object.geometry = indexIdenticalVertices(geometry);
    geometry.dispose();
  });
  if (geometryFingerprint(scene) !== originalGeometry) {
    throw new Error(`${id}: material restoration changed original geometry`);
  }
  let binary = await new GLTFExporter().parseAsync(scene, { binary: true });
  if (id === "soda") binary = attachSodaLabel(binary);
  // Validate the entire requested batch before replacing any working asset.
  stagedAssets.set(id, Buffer.from(binary));
  const existingIndex = report.findIndex((model) => model.id === id);
  if (existingIndex !== -1) report.splice(existingIndex, 1);
  report.push({ id, source: entry.source, sourceSha256: createHash("sha256").update(source).digest("hex"),
    triangles, bytes: binary.byteLength, originalGeometry, geometry: "original, unsimplified", requiresRig: !!entry.requiresRig });
  console.log(`${id}: ${triangles} original triangles`);
}
for (const [id, binary] of stagedAssets) {
  await fs.writeFile(new URL(`${id}.glb`, output), binary);
}
const catalogOrder = Object.keys(MODEL_CATALOG);
report.sort((a, b) => catalogOrder.indexOf(a.id) - catalogOrder.indexOf(b.id));
await fs.writeFile(new URL("report.json", output), JSON.stringify(report, null, 2) + "\n");
