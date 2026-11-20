// Draws the app's icons (spec §22). Run by hand when a drawing changes:
//   node desktop/icons/make-icons.mjs
// It writes beside itself the menu-bar icon, menuBarTemplate.png (18 points) and
// menuBarTemplate@2x.png: a ring with a needle, black on clear, which the Mac tints for a
// light or a dark menu bar. And appIcon.png, 1024 across, the downloaded app's icon: the same
// ring with the needle in the Time accent, on a rounded square of the sidebar's cream.
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

/**
 * How much of the app icon's rounded square covers the pixel at (x, y), 0 to 1. The square
 * leaves the margin a Mac's icons keep, and `inset` draws a smaller one inside it.
 */
function squareCoverage(x, y, size, inset) {
  const half = size * 0.402 - inset;
  const corner = size * 0.18 - inset;
  const centre = size / 2;
  let hit = 0;
  for (let i = 0; i < 4; i += 1) {
    for (let j = 0; j < 4; j += 1) {
      const px = Math.abs(x + (i + 0.5) / 4 - centre);
      const py = Math.abs(y + (j + 0.5) / 4 - centre);
      if (px > half || py > half) continue;
      const cx = px - (half - corner);
      const cy = py - (half - corner);
      if (cx > 0 && cy > 0 && Math.hypot(cx, cy) > corner) continue;
      hit += 1;
    }
  }
  return hit / 16;
}

/** The needle's share of the pixel alone, for the app icon's second color. */
function needleCoverage(x, y, size) {
  const centre = size / 2;
  const needle = size * 0.25;
  const waist = size * 0.085;
  let hit = 0;
  for (let i = 0; i < 4; i += 1) {
    for (let j = 0; j < 4; j += 1) {
      const px = x + (i + 0.5) / 4 - centre;
      const py = y + (j + 0.5) / 4 - centre;
      const along = (px - py) / Math.SQRT2;
      const across = (px + py) / Math.SQRT2;
      if (Math.abs(along) / needle + Math.abs(across) / waist <= 1) hit += 1;
    }
  }
  return hit / 16;
}

const mix = (under, over, share) => under.map((value, k) => Math.round(value + (over[k] - value) * share));

// The design system's own colors (DS §2): --primary-300, --primary-100, --primary-700 and
// the Time accent.
const EDGE = [0xe5, 0xdc, 0xc8];
const CREAM = [0xf6, 0xf1, 0xe7];
const RING = [0x7b, 0x5e, 0x3b];
const NEEDLE = [0xf4, 0x84, 0x5f];

/** The menu-bar icon's pixel: black, as opaque as the drawing covers it. */
function templatePixel(x, y, size) {
  return [0, 0, 0, Math.round(coverage(x, y, size) * 255)];
}

/** The app icon's pixel: the drawing at 60% of the icon's size, on the rounded square. */
function appPixel(x, y, size) {
  const square = squareCoverage(x, y, size, 0);
  if (square === 0) return [0, 0, 0, 0];
  const drawing = size * 0.6;
  const offset = (size - drawing) / 2;
  let color = mix(EDGE, CREAM, squareCoverage(x, y, size, size * 0.006));
  color = mix(color, RING, coverage(x - offset, y - offset, drawing));
  color = mix(color, NEEDLE, needleCoverage(x - offset, y - offset, drawing));
  return [...color, Math.round(square * 255)];
}

function png(size, pixel) {
  const row = 1 + size * 4;
  const raw = Buffer.alloc(row * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      raw.set(pixel(x, y, size), y * row + 1 + x * 4);
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

fs.writeFileSync(path.join(HERE, "menuBarTemplate.png"), png(18, templatePixel));
fs.writeFileSync(path.join(HERE, "menuBarTemplate@2x.png"), png(36, templatePixel));
fs.writeFileSync(path.join(HERE, "appIcon.png"), png(1024, appPixel));
console.log("Wrote menuBarTemplate.png, menuBarTemplate@2x.png and appIcon.png.");
