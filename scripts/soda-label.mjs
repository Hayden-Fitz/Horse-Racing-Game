import { deflateSync } from "node:zlib";

// Small, seamless red/white wave label. A texture changes only the finish of
// the original exported wrapper; no cylinder or replacement geometry is added.
export function sodaLabelPng() {
  const width = 256;
  const height = 512;
  const pixels = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const center = 0.5 + 0.21 * Math.sin(x / width * Math.PI * 4);
      const white = Math.abs(y / height - center) < 0.105;
      const offset = y * (width * 4 + 1) + 1 + x * 4;
      pixels.set(white ? [238, 242, 242, 255] : [233, 29, 45, 255], offset);
    }
  }
  const chunk = (name, data) => {
    const type = Buffer.from(name);
    let crc = 0xffffffff;
    for (const byte of Buffer.concat([type, data])) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    const header = Buffer.alloc(4);
    header.writeUInt32BE(data.length);
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([header, type, data, tail]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header), chunk("IDAT", deflateSync(pixels)), chunk("IEND", Buffer.alloc(0)),
  ]);
}

export function attachSodaLabel(binary) {
  const original = Buffer.from(binary);
  const jsonLength = original.readUInt32LE(12);
  const json = JSON.parse(original.subarray(20, 20 + jsonLength));
  json.images = [{ uri: `data:image/png;base64,${sodaLabelPng().toString("base64")}` }];
  json.samplers = [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 33071 }];
  json.textures = [{ source: 0, sampler: 0 }];
  const wrapper = json.materials.find((material) => material.name === "Soda printed wrapper");
  wrapper.pbrMetallicRoughness.baseColorTexture = { index: 0 };
  const encoded = Buffer.from(JSON.stringify(json));
  const padded = Buffer.alloc(Math.ceil(encoded.length / 4) * 4, 32);
  encoded.copy(padded);
  const header = Buffer.from(original.subarray(0, 20));
  const remainder = original.subarray(20 + jsonLength);
  header.writeUInt32LE(20 + padded.length + remainder.length, 8);
  header.writeUInt32LE(padded.length, 12);
  return Buffer.concat([header, padded, remainder]);
}
