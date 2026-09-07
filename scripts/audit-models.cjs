"use strict";

const fs = require("node:fs");
const path = require("node:path");
const directory = process.argv[2];

for (const name of fs.readdirSync(directory)) {
  if (!name.toLowerCase().endsWith(".glb")) continue;
  const bytes = fs.readFileSync(path.join(directory, name));
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  let triangles = 0;
  for (const mesh of json.meshes || []) {
    for (const primitive of mesh.primitives) {
      triangles += json.accessors[primitive.indices ?? primitive.attributes.POSITION].count / 3;
    }
  }
  console.log(JSON.stringify({
    name, bytes: bytes.length, triangles,
    meshes: json.meshes?.length, nodes: json.nodes?.length,
    materials: json.materials?.length, images: json.images?.length || 0,
    animations: json.animations?.length || 0,
    extensions: json.extensionsRequired || [],
    color: json.materials?.[0]?.pbrMetallicRoughness?.baseColorFactor,
    metalness: json.materials?.[0]?.pbrMetallicRoughness?.metallicFactor,
  }));
}
