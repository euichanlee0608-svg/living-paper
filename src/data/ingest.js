/* Document ingestion: file → text → chunks.
 *
 * Runs entirely in the browser, before anything is sealed. The lab's
 * documents are the whole basis of the product's answers, so the path a
 * PDF takes into the knowledge base has to be inspectable — no upload to
 * a parsing service, no third-party worker, no CDN.
 *
 * PDF text extraction is deliberately modest: uncompress FlateDecode
 * streams with the platform's own DecompressionStream and read the text
 * operators. That covers digitally-generated PDFs (SOPs, exported notes)
 * and openly fails on scans and exotic font encodings rather than
 * quietly feeding mojibake into the knowledge base.
 */

const DEC = new TextDecoder('utf-8', { fatal: false });
const LATIN = new TextDecoder('latin1');

export const SUPPORTED = '.txt,.md,.markdown,.csv,.json,.pdf';

export async function extractText(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf')) return extractPDF(await file.arrayBuffer());
  const text = await file.text();
  return { text, kind: 'text', note: null };
}

/* ---------- PDF ---------- */

async function inflate(bytes) {
  // Try raw deflate and zlib-wrapped; PDFs use both in the wild.
  for (const fmt of ['deflate', 'deflate-raw']) {
    try {
      const ds = new DecompressionStream(fmt);
      const stream = new Blob([bytes]).stream().pipeThrough(ds);
      return new Uint8Array(await new Response(stream).arrayBuffer());
    } catch { /* try the next format */ }
  }
  return null;
}

async function extractPDF(buf) {
  const bytes = new Uint8Array(buf);
  const raw = LATIN.decode(bytes);          // byte-preserving view for offset math
  const chunks = [];

  const re = /stream\r?\n?/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    const start = m.index + m[0].length;
    const end = raw.indexOf('endstream', start);
    if (end < 0) continue;

    // look back at the stream's dictionary to see how it is encoded
    const dict = raw.slice(Math.max(0, m.index - 400), m.index);
    if (/\/Image|\/DCTDecode|\/JPXDecode|\/CCITTFaxDecode/.test(dict)) continue;

    let data = bytes.subarray(start, end);
    if (/\/FlateDecode/.test(dict)) {
      const out = await inflate(data);
      if (!out) continue;
      data = out;
    } else if (!/\/Length/.test(dict)) {
      continue;
    }
    const piece = readTextOperators(LATIN.decode(data));
    if (piece.trim()) chunks.push(piece);
  }

  const text = chunks.join('\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!text || text.replace(/\s/g, '').length < 24) {
    return {
      text: '',
      kind: 'pdf',
      note: '이 PDF에서는 텍스트를 찾지 못했습니다. 스캔 이미지이거나 글꼴 인코딩이 특수한 경우입니다 — .txt 또는 .md로 저장해 다시 넣어 주세요.',
    };
  }
  return { text, kind: 'pdf', note: null };
}

/** Pull literal strings out of the content stream's text-showing operators. */
function readTextOperators(content) {
  let out = '';
  const re = /(\((?:\\.|[^\\()])*\)|<[0-9A-Fa-f\s]+>)\s*(Tj|TJ|'|")|\[((?:[^\][]|\\.)*)\]\s*TJ|\bT\*|\bTd\b|\bTD\b|\bET\b/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    if (m[1]) out += decodePdfString(m[1]);
    else if (m[3] !== undefined) {
      const inner = /(\((?:\\.|[^\\()])*\)|<[0-9A-Fa-f\s]+>)/g;
      let s;
      while ((s = inner.exec(m[3])) !== null) out += decodePdfString(s[1]);
    } else {
      out += m[0] === 'ET' ? '\n' : ' ';
    }
  }
  return out;
}

function decodePdfString(token) {
  if (token.startsWith('<')) {
    const hex = token.slice(1, -1).replace(/\s+/g, '');
    let s = '';
    // UTF-16BE is the common case for hex strings
    for (let i = 0; i + 3 < hex.length; i += 4) {
      s += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
    }
    return s;
  }
  return token.slice(1, -1)
    .replace(/\\([nrtbf()\\])/g, (_, c) => ({ n: '\n', r: '\n', t: '\t', b: '', f: '\n' }[c] ?? c))
    .replace(/\\([0-7]{1,3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)));
}

/* ---------- chunking ---------- */

const MAX = 620;   // fits a small local model's context comfortably
const OVERLAP = 90;

/** Split on structure first, then size. Overlap keeps a definition from
 *  being cut away from the sentence that qualifies it. */
export function chunkText(text, { title = '' } = {}) {
  const blocks = text.split(/\n{2,}/).map((b) => b.replace(/\s+\n/g, '\n').trim()).filter(Boolean);
  const chunks = [];
  let buf = '';

  const flush = () => {
    const t = buf.trim();
    if (t.length >= 24) chunks.push(t);
    buf = t.length > OVERLAP ? t.slice(-OVERLAP) : '';
  };

  for (const block of blocks) {
    if (block.length > MAX) {
      const sentences = block.split(/(?<=[.!?。？！])\s+|(?<=니다\.)\s*/);
      for (const s of sentences) {
        if (buf.length + s.length > MAX) flush();
        buf += (buf ? ' ' : '') + s;
      }
      flush();
    } else {
      if (buf.length + block.length > MAX) flush();
      buf += (buf ? '\n' : '') + block;
    }
  }
  flush();

  return chunks.map((text2, i) => ({
    text: text2,
    index: i,
    title: title ? `${title} · ${i + 1}` : `조각 ${i + 1}`,
  }));
}

export function guessKind(filename) {
  const n = filename.toLowerCase();
  if (/sop|규약|프로토콜|protocol/.test(n)) return 'SOP';
  if (/노트|note|log|실험/.test(n)) return '실험노트';
  if (/irb|규정|policy|정책/.test(n)) return '규정';
  if (n.endsWith('.pdf')) return '문서';
  return '메모';
}

export const fmtSize = (n) =>
  n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`;
