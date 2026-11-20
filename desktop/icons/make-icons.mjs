// Draws the menu-bar icon (spec §22): a ring with a needle, black on clear, which the Mac
// tints for a light or a dark menu bar. Run by hand when the drawing changes:
//   node desktop/icons/make-icons.mjs
// It writes menuBarTemplate.png (18 points) and menuBarTemplate@2x.png beside itself.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

function crc(bytes) {
  let c = ~0;
  for (const byte of bytes) {
    c ^= byte;
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc(body));
  return Buffer.concat([head, body, tail]);
}

/** How much of the pixel at (x, y) the drawing covers, 0 to 1, sampled 4 by 4. */
function coverage(x, y, size) {
  const centre = size / 2;
  const outer = size * 0.44;
  const inner = size * 0.36;
  const needle = size * 0.25;
  const waist = size * 0.085;
  let hit = 0;
  for (let i = 0; i < 4; i += 1) {
    for (let j = 0; j < 4; j += 1) {
      const px = x + (i + 0.5) / 4 - centre;
      const py = y + (j + 0.5) / 4 - centre;
      const far = Math.hypot(px, py);
      const onRing = far <= outer && far >= inner;
      // The needle is a diamond lying along the line from lower left to upper right.
      const along = (px - py) / Math.SQRT2;
      const across = (px + py) / Math.SQRT2;
      const onNeedle = Math.abs(along) / needle + Math.abs(across) / waist <= 1;
      if (onRing || onNeedle) hit += 1;
    }
  }
  return hit / 16;
}

function png(size) {
  const row = 1 + size * 4;
  const raw = Buffer.alloc(row * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      raw[y * row + 1 + x * 4 + 3] = Math.round(coverage(x, y, size) * 255);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

fs.writeFileSync(path.join(HERE, "menuBarTemplate.png"), png(18));
fs.writeFileSync(path.join(HERE, "menuBarTemplate@2x.png"), png(36));
console.log("Wrote menuBarTemplate.png and menuBarTemplate@2x.png.");
