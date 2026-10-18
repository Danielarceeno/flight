// Gera os ícones PNG da extensão sem depender de nenhuma lib externa
// (só node:zlib pra compressão do PNG). Rodar uma vez: node generate-icons.js
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const BLUE = [26, 115, 232, 255]; // mesma cor da marca usada no e-mail
const WHITE = [255, 255, 255, 255];
const TRANSPARENT = [0, 0, 0, 0];

function pointInTriangle(px, py, [ax, ay], [bx, by], [cx, cy]) {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

function pixel(x, y, size) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.47;
  const dx = x + 0.5 - cx;
  const dy = y + 0.5 - cy;
  if (dx * dx + dy * dy > r * r) return TRANSPARENT;

  // seta apontando pra direita (ação "ir para"), dentro do círculo azul
  const A = [size * 0.32, size * 0.28];
  const B = [size * 0.32, size * 0.72];
  const C = [size * 0.74, size * 0.5];
  if (pointInTriangle(x + 0.5, y + 0.5, A, B, C)) return WHITE;
  return BLUE;
}

function crc32(buf) {
  if (!crc32.table) {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    crc32.table = t;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = crc32.table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function makePng(size) {
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0; // sem filtro
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y, size);
      const off = y * stride + 1 + x * 4;
      raw[off] = r;
      raw[off + 1] = g;
      raw[off + 2] = b;
      raw[off + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

mkdirSync(new URL('./icons', import.meta.url), { recursive: true });
for (const size of [16, 32, 48, 128]) {
  writeFileSync(new URL(`./icons/icon${size}.png`, import.meta.url), makePng(size));
  console.log(`icons/icon${size}.png gerado`);
}
