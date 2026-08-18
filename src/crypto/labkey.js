/* Lab-level keys.
 *
 * A lab has one long-lived Lab Master Key (LMK, AES-256). It encrypts the
 * knowledge base at rest on the on-prem node. Nobody transmits it in the
 * clear: to add a member you wrap the LMK to that member's device key
 * using the same sealed envelope everything else uses.
 *
 * Losing every device therefore loses the lab. That is the honest cost of
 * a design where the cloud cannot help you recover — so we make the
 * recovery kit a first-class, unavoidable step in onboarding rather than
 * a setting buried three menus deep.
 */
import { toB64u, fromB64u, randomBytes, assert } from './base.js';
import { hkdf, aesKey } from './keys.js';
import { seal, open } from './envelope.js';

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // no I, L, O, U — unambiguous when hand-copied

export function createLabKey() {
  return randomBytes(32);
}

/** Wrap the LMK to a new member's device. Rides the standard envelope,
 *  so member invitations get signature verification for free. */
export async function wrapLabKeyFor(lmk, memberPub, sender, labId) {
  return seal({ lmk: toB64u(lmk) }, {
    sender,
    recipients: [memberPub],
    aad: { labId, jobId: `join:${memberPub.kid}`, type: 'lab-key-grant', ts: Date.now() },
  });
}

export async function unwrapLabKey(env, me, senderPub) {
  const { lmk } = await open(env, me, senderPub);
  return fromB64u(lmk);
}

/* ---------- recovery kit ---------- */

export function generateRecoveryCode() {
  const bytes = randomBytes(20); // 160 bits
  let bits = '';
  for (const b of bytes) bits += b.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i < bits.length; i += 5) out += CROCKFORD[parseInt(bits.slice(i, i + 5), 2)];
  return out.match(/.{1,4}/g).join('-'); // XXXX-XXXX-… 8 groups
}

export function normaliseRecoveryCode(code) {
  return code.toUpperCase().replace(/[^0-9A-Z]/g, '')
    .replace(/I/g, '1').replace(/L/g, '1').replace(/O/g, '0').replace(/U/g, 'V');
}

function recoveryBytes(code) {
  const clean = normaliseRecoveryCode(code);
  assert(clean.length === 32, 'recovery code must be 32 characters');
  let bits = '';
  for (const ch of clean) {
    const v = CROCKFORD.indexOf(ch);
    assert(v >= 0, `invalid character in recovery code: ${ch}`);
    bits += v.toString(2).padStart(5, '0');
  }
  const out = new Uint8Array(20);
  for (let i = 0; i < 20; i++) out[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  return out;
}

/** Seal the LMK under the recovery code. The result is safe to keep in the
 *  cloud: without the printed code it is 160 bits of nothing. */
export async function sealWithRecoveryCode(lmk, code, labId) {
  const salt = randomBytes(16);
  const kek = await hkdf(recoveryBytes(code), { salt, info: `LP1|recovery|${labId}` });
  const iv = randomBytes(12);
  const key = await aesKey(kek, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, lmk));
  return { v: 1, labId, salt: toB64u(salt), iv: toB64u(iv), ct: toB64u(ct) };
}

export async function openWithRecoveryCode(blob, code) {
  const kek = await hkdf(recoveryBytes(code), {
    salt: fromB64u(blob.salt), info: `LP1|recovery|${blob.labId}`,
  });
  const key = await aesKey(kek, ['decrypt']);
  const lmk = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64u(blob.iv) }, key, fromB64u(blob.ct));
  return new Uint8Array(lmk);
}
