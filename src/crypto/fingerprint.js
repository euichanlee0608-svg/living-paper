/* Out-of-band verification.
 *
 * A relay that can swap public keys can read everything. The only defence
 * is for humans to compare key fingerprints over a channel the relay does
 * not control — walking to the server room, or a phone call.
 *
 * So the fingerprint has to be genuinely comparable on a phone screen:
 * an emoji row for the two-second glance, hex underneath for the careful
 * check. Both derive from the same digest.
 */
import { canonicalJSON, sha256, te, toHex } from './base.js';

const EMOJI = [
  '🐙','🦊','🐢','🦉','🐝','🦋','🐳','🦜','🌵','🍄','🌻','🍋','🍇','🌶️','🥑','🍿',
  '⚓','🎈','🎸','🎺','🔭','🧭','⏳','🔑','🧲','🕯️','📎','🪁','🎲','🧩','🚲','🚂',
  '🛰️','🚀','⛵','🗿','🗼','⛩️','🏔️','🌋','🏝️','🌊','☂️','❄️','⚡','🌈','🔥','💎',
  '🎯','🥁','📻','💡','🔔','🧊','🪵','🌰','🐞','🦔','🦩','🦕','🪸','🧿','🎪','🪞',
];

async function digestOf(pub) {
  const canon = canonicalJSON({ enc: pub.enc, sig: pub.sig });
  return new Uint8Array(await sha256(te.encode(canon)));
}

/** Fingerprint of a single identity. */
export async function fingerprint(pub) {
  const d = await digestOf(pub);
  const hex = toHex(d.slice(0, 16)).toUpperCase().match(/.{4}/g).join(' ');
  const emoji = [...d.slice(0, 6)].map((b) => EMOJI[b & 63]);
  return { hex, emoji, short: hex.slice(0, 9) };
}

/** Pairwise safety number: identical on both screens regardless of who
 *  looks first, because the two digests are sorted before hashing. */
export async function safetyNumber(pubA, pubB) {
  const [a, b] = [await digestOf(pubA), await digestOf(pubB)];
  const [lo, hi] = toHex(a) < toHex(b) ? [a, b] : [b, a];
  const joined = new Uint8Array(lo.length + hi.length);
  joined.set(lo); joined.set(hi, lo.length);
  const d = new Uint8Array(await sha256(joined));
  const digits = [...d.slice(0, 15)].map((x) => (x % 10).toString()).join('');
  return {
    digits: digits.match(/.{5}/g).join(' '),
    emoji: [...d.slice(0, 6)].map((x) => EMOJI[x & 63]),
  };
}
