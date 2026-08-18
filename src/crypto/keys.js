/* Device identity.
 *
 * Every device (a browser profile, or the lab node) owns two P-256 keypairs:
 *   - ENC (ECDH)  : receives wrapped content keys
 *   - SIG (ECDSA) : proves who authored an envelope
 *
 * Private keys are generated non-extractable and stored as live CryptoKey
 * objects in IndexedDB. There is no code path — here or anywhere else in
 * this repo — that can serialise a private key out of the browser.
 * That is the property the whole zero-knowledge claim rests on.
 */
import { toB64u, fromB64u, sha256, canonicalJSON, te, assert } from './base.js';

const ENC_ALG = { name: 'ECDH', namedCurve: 'P-256' };
const SIG_ALG = { name: 'ECDSA', namedCurve: 'P-256' };
const SIG_PARAMS = { name: 'ECDSA', hash: 'SHA-256' };

/** Generate a fresh device identity. Private halves are non-extractable. */
export async function generateIdentity() {
  const enc = await crypto.subtle.generateKey(ENC_ALG, false, ['deriveBits']);
  const sig = await crypto.subtle.generateKey(SIG_ALG, false, ['sign', 'verify']);
  const encPubJwk = await crypto.subtle.exportKey('jwk', enc.publicKey);
  const sigPubJwk = await crypto.subtle.exportKey('jwk', sig.publicKey);
  const kid = await keyId(encPubJwk);
  return {
    kid,
    encPriv: enc.privateKey, encPub: enc.publicKey,
    sigPriv: sig.privateKey, sigPub: sig.publicKey,
    pub: publicBundle(kid, encPubJwk, sigPubJwk),
  };
}

/** The only thing ever published to the relay. */
export function publicBundle(kid, encPubJwk, sigPubJwk) {
  return {
    kid,
    enc: { kty: encPubJwk.kty, crv: encPubJwk.crv, x: encPubJwk.x, y: encPubJwk.y },
    sig: { kty: sigPubJwk.kty, crv: sigPubJwk.crv, x: sigPubJwk.x, y: sigPubJwk.y },
  };
}

/** kid = first 16 bytes of SHA-256 over the canonical public JWK.
 *  Stable across devices, so both sides derive the same id. */
export async function keyId(jwk) {
  const canon = canonicalJSON({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y });
  const digest = await sha256(te.encode(canon));
  return toB64u(new Uint8Array(digest).slice(0, 16));
}

export async function importEncPub(jwk) {
  return crypto.subtle.importKey('jwk', { ...jwk, ext: true }, ENC_ALG, true, []);
}

export async function importSigPub(jwk) {
  return crypto.subtle.importKey('jwk', { ...jwk, ext: true }, SIG_ALG, true, ['verify']);
}

export async function sign(sigPriv, bytes) {
  return new Uint8Array(await crypto.subtle.sign(SIG_PARAMS, sigPriv, bytes));
}

export async function verify(sigPubJwk, signature, bytes) {
  const key = await importSigPub(sigPubJwk);
  return crypto.subtle.verify(SIG_PARAMS, key, signature, bytes);
}

/** ECDH → raw shared secret. Never used directly as a key; always fed to HKDF. */
export async function agree(myEncPriv, theirEncPubJwk) {
  const pub = await importEncPub(theirEncPubJwk);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: pub }, myEncPriv, 256));
}

/** HKDF-SHA256. `info` binds the derived key to its purpose and to both
 *  parties, so a key agreed for one job can't be replayed into another. */
export async function hkdf(secret, { salt = new Uint8Array(32), info, bits = 256 }) {
  const base = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveBits']);
  const out = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info: te.encode(info) }, base, bits,
  );
  return new Uint8Array(out);
}

export async function aesKey(raw, usages = ['encrypt', 'decrypt']) {
  assert(raw.byteLength === 32, 'AES key must be 256-bit');
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, false, usages);
}
