/* QR Code encoder — byte mode, ECC level M, versions 1–20.
 *
 * Written out rather than pulled from npm for the same reason as
 * everything else here: this app ships to air-gapped hospital networks
 * and makes zero external requests. An invite QR that needs a CDN is an
 * invite QR that fails in the exact room where it matters.
 *
 * Verified module-for-module against the Python `qrcode` reference
 * implementation — see tests/qr.verify.html and tests/gen-qr-reference.py.
 */

/* ---------- GF(256) arithmetic, generator 0x11D ---------- */
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(function initGF() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

const gfMul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

function rsGenerator(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gfMul(poly[j], 1);
      next[j + 1] ^= gfMul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly;
}

function rsEncode(data, ecLen) {
  const gen = rsGenerator(ecLen);
  const res = new Uint8Array(data.length + ecLen);
  res.set(data);
  for (let i = 0; i < data.length; i++) {
    const factor = res[i];
    if (factor === 0) continue;
    for (let j = 0; j < gen.length; j++) res[i + j] ^= gfMul(gen[j], factor);
  }
  return res.slice(data.length);
}

/* ---------- version tables (ECC level M) ----------
   [total codewords, ec codewords per block, group1 blocks, group2 blocks] */
const VERSIONS = [
  null,
  [26, 10, 1, 0], [44, 16, 1, 0], [70, 26, 1, 0], [100, 18, 2, 0],
  [134, 24, 2, 0], [172, 16, 4, 0], [196, 18, 4, 0], [242, 22, 2, 2],
  [292, 22, 3, 2], [346, 26, 4, 1], [404, 30, 1, 4], [466, 22, 6, 2],
  [532, 22, 8, 1], [581, 24, 4, 5], [655, 24, 5, 5], [733, 28, 7, 3],
  [815, 28, 10, 1], [901, 26, 9, 4], [991, 26, 3, 11], [1085, 26, 3, 13],
];

const ALIGN = [
  [], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
  [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50], [6, 30, 54],
  [6, 32, 58], [6, 34, 62], [6, 26, 46, 66], [6, 26, 48, 70],
  [6, 26, 50, 74], [6, 30, 54, 78], [6, 30, 56, 82], [6, 30, 58, 86],
  [6, 34, 62, 90],
];

function capacityBytes(version) {
  const [total, ecLen, g1, g2] = VERSIONS[version];
  const blocks = g1 + g2;
  const dataCodewords = total - ecLen * blocks;
  const lenBits = version < 10 ? 8 : 16;
  return dataCodewords - 2 - Math.ceil(lenBits / 8); // mode nibble + length + terminator slack
}

/* ---------- bit buffer ---------- */
class Bits {
  constructor() { this.bytes = []; this.len = 0; }
  push(value, width) {
    for (let i = width - 1; i >= 0; i--) {
      const bit = (value >>> i) & 1;
      const bytePos = this.len >>> 3;
      if (this.bytes.length <= bytePos) this.bytes.push(0);
      if (bit) this.bytes[bytePos] |= 0x80 >>> (this.len & 7);
      this.len++;
    }
  }
}

/* ---------- encode payload to codewords ---------- */
function encodeData(text, version) {
  const utf8 = new TextEncoder().encode(text);
  const [total, ecLen, g1, g2] = VERSIONS[version];
  const blocks = g1 + g2;
  const dataCodewords = total - ecLen * blocks;
  const lenBits = version < 10 ? 8 : 16;

  const bits = new Bits();
  bits.push(0b0100, 4);              // byte mode
  bits.push(utf8.length, lenBits);
  for (const b of utf8) bits.push(b, 8);

  const capacityBits = dataCodewords * 8;
  bits.push(0, Math.min(4, capacityBits - bits.len));           // terminator
  while (bits.len % 8) bits.push(0, 1);                          // byte align
  const pad = [0xec, 0x11];
  let i = 0;
  while (bits.bytes.length < dataCodewords) bits.bytes.push(pad[i++ % 2]);

  // split into blocks, interleave data then ec (spec order)
  const g1Count = blocks - (dataCodewords % blocks === 0 ? 0 : 0);
  const shortLen = Math.floor(dataCodewords / blocks);
  const longCount = dataCodewords % blocks;
  const dataBlocks = [];
  const ecBlocks = [];
  let at = 0;
  for (let b = 0; b < blocks; b++) {
    const len = shortLen + (b >= blocks - longCount ? 1 : 0);
    const chunk = Uint8Array.from(bits.bytes.slice(at, at + len));
    at += len;
    dataBlocks.push(chunk);
    ecBlocks.push(rsEncode(chunk, ecLen));
  }

  const out = [];
  const maxData = Math.max(...dataBlocks.map((b) => b.length));
  for (let i2 = 0; i2 < maxData; i2++) {
    for (const b of dataBlocks) if (i2 < b.length) out.push(b[i2]);
  }
  for (let i2 = 0; i2 < ecLen; i2++) {
    for (const b of ecBlocks) out.push(b[i2]);
  }
  return out;
}

/* ---------- matrix ---------- */
function buildMatrix(version, codewords, mask) {
  const size = version * 4 + 17;
  const m = Array.from({ length: size }, () => new Int8Array(size).fill(-1));

  const finder = (r, c) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
        const inRing = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
        const on = inRing && (dr === 0 || dr === 6 || dc === 0 || dc === 6
          || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
        m[rr][cc] = on ? 1 : 0;
      }
    }
  };
  finder(0, 0); finder(0, size - 7); finder(size - 7, 0);

  // timing patterns
  for (let i = 8; i < size - 8; i++) {
    m[6][i] = i % 2 === 0 ? 1 : 0;
    m[i][6] = i % 2 === 0 ? 1 : 0;
  }

  // alignment patterns
  const centers = ALIGN[version];
  for (const r of centers) {
    for (const c of centers) {
      if ((r <= 8 && c <= 8) || (r <= 8 && c >= size - 9) || (r >= size - 9 && c <= 8)) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          m[r + dr][c + dc] =
            (Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0)) ? 1 : 0;
        }
      }
    }
  }

  m[size - 8][8] = 1; // dark module

  // reserve format areas
  for (let i = 0; i < 9; i++) {
    if (m[8][i] === -1) m[8][i] = 0;
    if (m[i][8] === -1) m[i][8] = 0;
  }
  for (let i = 0; i < 8; i++) {
    if (m[8][size - 1 - i] === -1) m[8][size - 1 - i] = 0;
    if (m[size - 1 - i][8] === -1) m[size - 1 - i][8] = 0;
  }

  // reserve version info (v7+)
  const reserved = version >= 7;
  if (reserved) {
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 3; j++) {
        if (m[i][size - 11 + j] === -1) m[i][size - 11 + j] = 0;
        if (m[size - 11 + j][i] === -1) m[size - 11 + j][i] = 0;
      }
    }
  }

  const isFree = (r, c) => m[r][c] === -1;

  // zigzag placement
  let bitIndex = 0;
  let up = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--;                          // skip vertical timing column
    for (let step = 0; step < size; step++) {
      const row = up ? size - 1 - step : step;
      for (const c of [col, col - 1]) {
        if (!isFree(row, c)) continue;
        const byte = codewords[bitIndex >>> 3];
        let bit = byte === undefined ? 0 : (byte >>> (7 - (bitIndex & 7))) & 1;
        bitIndex++;
        if (maskFn(mask, row, c)) bit ^= 1;
        m[row][c] = bit;
      }
    }
    up = !up;
  }
  return m;
}

function maskFn(mask, r, c) {
  switch (mask) {
    case 0: return (r + c) % 2 === 0;
    case 1: return r % 2 === 0;
    case 2: return c % 3 === 0;
    case 3: return (r + c) % 3 === 0;
    case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
    case 5: return ((r * c) % 2) + ((r * c) % 3) === 0;
    case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
    default: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
  }
}

const BCH_FORMAT = 0x537;
function formatBits(mask) {
  // ECC level M == 0b00
  const data = (0b00 << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * BCH_FORMAT);
  return ((data << 10) | rem) ^ 0x5412;
}

function applyFormat(m, mask) {
  const size = m.length;
  const bits = formatBits(mask);
  const bit = (i) => (bits >>> (14 - i)) & 1;   // i = 0 is the MSB

  // copy 1, around the top-left finder
  for (let i = 0; i < 6; i++) m[8][i] = bit(i);
  m[8][7] = bit(6);
  m[8][8] = bit(7);
  m[7][8] = bit(8);
  for (let i = 9; i < 15; i++) m[14 - i][8] = bit(i);

  // copy 2, split between the bottom-left and top-right finders
  for (let i = 0; i < 7; i++) m[size - 1 - i][8] = bit(i);
  for (let i = 7; i < 15; i++) m[8][size - 15 + i] = bit(i);

  m[size - 8][8] = 1;   // dark module, always
}

const BCH_VERSION = 0x1f25;
function applyVersion(m, version) {
  if (version < 7) return;
  const size = m.length;
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * BCH_VERSION);
  const bits = (version << 12) | rem;
  for (let i = 0; i < 18; i++) {
    const bit = (bits >>> i) & 1;
    const r = Math.floor(i / 3), c = i % 3;
    m[r][size - 11 + c] = bit;
    m[size - 11 + c][r] = bit;
  }
}

/* ---------- mask scoring (spec penalty rules) ---------- */
function penalty(m) {
  const n = m.length;
  let score = 0;

  const runScore = (line) => {
    let s = 0, run = 1;
    for (let i = 1; i < n; i++) {
      if (line[i] === line[i - 1]) run++;
      else { if (run >= 5) s += 3 + (run - 5); run = 1; }
    }
    if (run >= 5) s += 3 + (run - 5);
    return s;
  };
  for (let r = 0; r < n; r++) score += runScore(m[r]);
  for (let c = 0; c < n; c++) score += runScore(m.map((row) => row[c]));

  for (let r = 0; r < n - 1; r++)
    for (let c = 0; c < n - 1; c++)
      if (m[r][c] === m[r][c + 1] && m[r][c] === m[r + 1][c] && m[r][c] === m[r + 1][c + 1]) score += 3;

  const pat1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  const pat2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
  const hit = (arr, at, pat) => pat.every((v, i) => arr[at + i] === v);
  for (let r = 0; r < n; r++) {
    const row = m[r];
    const col = m.map((x) => x[r]);
    for (let c = 0; c + 11 <= n; c++) {
      if (hit(row, c, pat1) || hit(row, c, pat2)) score += 40;
      if (hit(col, c, pat1) || hit(col, c, pat2)) score += 40;
    }
  }

  let dark = 0;
  for (const row of m) for (const v of row) dark += v;
  const pct = (dark * 100) / (n * n);
  score += Math.floor(Math.abs(pct - 50) / 5) * 10;
  return score;
}

/* ---------- public API ---------- */
export function encodeQR(text, { mask: forceMask = null } = {}) {
  let version = 1;
  while (version < VERSIONS.length - 1 && capacityBytes(version) < new TextEncoder().encode(text).length) version++;
  if (capacityBytes(version) < new TextEncoder().encode(text).length) {
    throw new Error('QR로 담기에 내용이 너무 깁니다');
  }
  const codewords = encodeData(text, version);

  // A forced mask is only used by the reference-comparison test; normal
  // callers get the lowest-penalty mask, as the spec prescribes.
  const candidates = forceMask === null ? [0, 1, 2, 3, 4, 5, 6, 7] : [forceMask];
  let best = null;
  for (const mask of candidates) {
    const m = buildMatrix(version, codewords, mask);
    applyFormat(m, mask);
    applyVersion(m, version);
    const p = penalty(m);
    if (!best || p < best.p) best = { m, p, mask };
  }
  return { matrix: best.m, version, mask: best.mask, size: best.m.length };
}

/** Render as crisp SVG — scales to any size without blurring, and prints. */
export function qrSVG(text, { quiet = 4, dark = '#08090A', light = '#FFFFFF' } = {}) {
  const { matrix, size } = encodeQR(text);
  const dim = size + quiet * 2;
  let path = '';
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (matrix[r][c]) path += `M${c + quiet} ${r + quiet}h1v1h-1z`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" `
    + `shape-rendering="crispEdges" role="img" aria-label="초대 QR 코드">`
    + `<rect width="${dim}" height="${dim}" fill="${light}"/>`
    + `<path d="${path}" fill="${dark}"/></svg>`;
}
