/* The sealed envelope — the only shape in which user content ever leaves
 * the device.
 *
 *   confidentiality : ECDH-ES (ephemeral-static P-256) + A256GCMKW per recipient
 *   integrity/auth  : ECDSA P-256 over header‖iv‖ciphertext
 *   content         : AES-256-GCM, header bound in as additional data
 *
 * Splitting confidentiality from authenticity is deliberate. ECDH-ES is
 * anonymous, so the sender's long-term key never takes part in the key
 * agreement — a stolen device key cannot retroactively decrypt captured
 * traffic. Identity is asserted separately, by signature.
 *
 * The `aad` block is the ONLY part the relay can read. It carries exactly
 * what routing needs and nothing else, and it is authenticated: a relay
 * that rewrites a labId or jobId invalidates both the GCM tag and the
 * signature. See docs/THREAT_MODEL.md.
 */
import {
  toB64u, fromB64u, concat, randomBytes, canonicalJSON, te, td, assert,
} from './base.js';
import { agree, hkdf, aesKey, sign, verify, keyId } from './keys.js';

export const ENVELOPE_VERSION = 1;
const ALG = 'ECDH-ES+A256GCMKW';
const ENC = 'A256GCM';

const wrapInfo = (senderKid, recipientKid, jobId) =>
  `LP1|wrap|${ALG}|${senderKid}|${recipientKid}|${jobId}`;

/**
 * @param {object}   payload     arbitrary JSON — the actual secret
 * @param {object}   sender      { kid, encPriv, sigPriv }  (encPriv unused: ECDH-ES is anonymous)
 * @param {object[]} recipients  public bundles from keys.publicBundle()
 * @param {object}   aad         routing metadata, authenticated but NOT encrypted
 */
export async function seal(payload, { sender, recipients, aad }) {
  assert(recipients?.length, 'seal() needs at least one recipient');
  assert(aad?.jobId, 'seal() needs aad.jobId');

  const cekRaw = randomBytes(32);
  const iv = randomBytes(12);

  // one ephemeral keypair per recipient — never reused, never stored
  const wrapped = [];
  for (const r of recipients) {
    const eph = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
    const epkJwk = await crypto.subtle.exportKey('jwk', eph.publicKey);
    const epk = { kty: epkJwk.kty, crv: epkJwk.crv, x: epkJwk.x, y: epkJwk.y };
    const shared = await agree(eph.privateKey, r.enc);
    const kek = await hkdf(shared, { info: wrapInfo(sender.kid, r.kid, aad.jobId) });
    const kekKey = await aesKey(kek, ['encrypt']);
    const wIv = randomBytes(12);
    const ek = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: wIv }, kekKey, cekRaw));
    wrapped.push({ kid: r.kid, epk, iv: toB64u(wIv), ek: toB64u(ek) });
  }

  const header = {
    v: ENVELOPE_VERSION, alg: ALG, enc: ENC,
    sender: sender.kid, aad, recipients: wrapped,
  };
  const headerBytes = te.encode(canonicalJSON(header));

  const cek = await aesKey(cekRaw, ['encrypt']);
  const plaintext = te.encode(JSON.stringify(payload));
  const ct = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: headerBytes, tagLength: 128 }, cek, plaintext,
  ));

  const sig = await sign(sender.sigPriv, concat(headerBytes, iv, ct));
  cekRaw.fill(0); // best-effort scrub; JS gives no guarantee, and we say so in the docs

  return { ...header, iv: toB64u(iv), ct: toB64u(ct), sig: toB64u(sig) };
}

/**
 * @param {object} env        the sealed envelope
 * @param {object} me         { kid, encPriv }
 * @param {object} [senderPub] public bundle of the claimed sender; when supplied
 *                             the signature is verified and a mismatch throws.
 */
export async function open(env, me, senderPub) {
  assert(env?.v === ENVELOPE_VERSION, `unsupported envelope version ${env?.v}`);
  assert(env.alg === ALG && env.enc === ENC, 'unsupported algorithms');

  const slot = env.recipients.find((r) => r.kid === me.kid);
  assert(slot, 'this device is not a recipient of the envelope');

  const header = {
    v: env.v, alg: env.alg, enc: env.enc,
    sender: env.sender, aad: env.aad, recipients: env.recipients,
  };
  const headerBytes = te.encode(canonicalJSON(header));
  const iv = fromB64u(env.iv);
  const ct = fromB64u(env.ct);

  if (senderPub) {
    assert(senderPub.kid === env.sender, 'sender key id does not match the envelope');
    const ok = await verify(senderPub.sig, fromB64u(env.sig), concat(headerBytes, iv, ct));
    assert(ok, 'signature verification failed — envelope was tampered with or forged');
  }

  const shared = await agree(me.encPriv, slot.epk);
  const kek = await hkdf(shared, { info: wrapInfo(env.sender, me.kid, env.aad.jobId) });
  const kekKey = await aesKey(kek, ['decrypt']);
  const cekRaw = new Uint8Array(await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64u(slot.iv) }, kekKey, fromB64u(slot.ek),
  ));

  const cek = await aesKey(cekRaw, ['decrypt']);
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, additionalData: headerBytes, tagLength: 128 }, cek, ct,
  );
  cekRaw.fill(0);
  return JSON.parse(td.decode(pt));
}

/** Exactly what a compromised relay would hold. Used by the in-app
 *  "what the relay sees" inspector, so the claim is demonstrable
 *  rather than asserted. */
export function relayView(env) {
  return {
    v: env.v, alg: env.alg, enc: env.enc,
    sender: env.sender,
    aad: env.aad,
    recipients: env.recipients.map((r) => ({ kid: r.kid, epk: '(ephemeral pubkey)', ek: r.ek })),
    iv: env.iv,
    ct: env.ct,
    sig: env.sig,
  };
}

export function envelopeSize(env) {
  return new Blob([JSON.stringify(env)]).size;
}
