/**
 * A minimal PNG encoder, built on node's own zlib.
 *
 * Why not a library: procedural backgrounds are the cheapest thing this skill
 * makes, and they should not drag in an image dependency to exist. Writing RGBA
 * scanlines is about forty lines, needs nothing installed, and keeps the
 * generated colour exactly the brand hex rather than whatever a codec rounds it
 * to.
 */
import { deflateSync } from "zlib";

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/**
 * @param {number} width
 * @param {number} height
 * @param {Buffer|Uint8Array} rgba  width*height*4 bytes
 * @returns {Buffer} a complete PNG
 */
export function encodePNG(width, height, rgba) {
  const expected = width * height * 4;
  if (rgba.length !== expected) {
    throw new Error(`Pixel buffer is ${rgba.length} bytes, expected ${expected} for ${width}x${height} RGBA`);
  }

  // Each scanline is prefixed with its filter byte. Filter 0 (None) keeps this
  // simple; these images are smooth gradients and noise, where fancier filters
  // buy little and cost clarity.
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    const from = y * width * 4;
    const to = y * (width * 4 + 1);
    raw[to] = 0;
    Buffer.from(rgba.buffer ?? rgba, rgba.byteOffset ?? 0, rgba.length).copy(
      raw, to + 1, from, from + width * 4,
    );
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // colour type: RGBA
  ihdr[10] = 0;  // deflate
  ihdr[11] = 0;  // adaptive filtering
  ihdr[12] = 0;  // no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
