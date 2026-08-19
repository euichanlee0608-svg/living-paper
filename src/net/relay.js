/* Relay client.
 *
 * The relay is a dumb pipe: it accepts sealed envelopes, files them by
 * recipient key id, and hands them over when that recipient asks. It runs
 * in the cloud and is assumed hostile — see docs/THREAT_MODEL.md.
 *
 * Two transports share one interface:
 *   MockRelay — runs in this tab, for the public demo. Deliberately keeps
 *               an audit log of everything it stored, which the Security
 *               screen renders verbatim. If the architecture leaked
 *               plaintext, that screen is where it would show.
 *   HttpRelay — talks to relay/worker.js over HTTPS.
 */
import { relayView, envelopeSize } from '../crypto/envelope.js';

const nowIso = () => new Date().toISOString();

class RelayBase {
  constructor() { this._subs = new Map(); }

  _fanout(kid, env) {
    for (const cb of this._subs.get(kid) || []) {
      try { cb(env); } catch (e) { console.error('[relay] subscriber threw', e); }
    }
  }

  subscribe(kid, cb) {
    if (!this._subs.has(kid)) this._subs.set(kid, new Set());
    this._subs.get(kid).add(cb);
    return () => this._subs.get(kid)?.delete(cb);
  }
}

export class MockRelay extends RelayBase {
  constructor() {
    super();
    this.devices = new Map();   // kid -> public bundle
    this.queues = new Map();    // kid -> envelope[]
    this.log = [];              // what a subpoena of the relay would return
    this.latencyMs = 380;       // enough that the pipeline animation reads as real work
  }

  async registerDevice(pub, meta = {}) {
    this.devices.set(pub.kid, { pub, meta });
    this._audit('device.register', { kid: pub.kid, role: meta.role || 'unknown' }, 0);
    return { ok: true };
  }

  async getDevice(kid) { return this.devices.get(kid)?.pub || null; }

  async listNodes() {
    return [...this.devices.values()].filter((d) => d.meta?.role === 'lab-node');
  }

  async postEnvelope(env) {
    await this._delay();
    this._audit('envelope.store', relayView(env), envelopeSize(env));
    for (const r of env.recipients) {
      if (!this.queues.has(r.kid)) this.queues.set(r.kid, []);
      this.queues.get(r.kid).push(env);
      this._fanout(r.kid, env);
    }
    return { ok: true, jobId: env.aad.jobId };
  }

  async pull(kid) {
    const q = this.queues.get(kid) || [];
    this.queues.set(kid, []);
    return q;
  }

  _audit(op, detail, bytes) {
    this.log.unshift({ at: nowIso(), op, bytes, detail });
    if (this.log.length > 60) this.log.pop();
    window.dispatchEvent(new CustomEvent('lp:relay-log'));
  }

  _delay() {
    const jitter = this.latencyMs * (0.7 + Math.random() * 0.6);
    return new Promise((r) => setTimeout(r, jitter));
  }
}

export class HttpRelay extends RelayBase {
  constructor(baseUrl, token) {
    super();
    this.base = baseUrl.replace(/\/$/, '');
    this.token = token;
    this.log = [];
    this._timer = null;
  }

  get _headers() {
    return {
      'content-type': 'application/json',
      ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
    };
  }

  async registerDevice(pub, meta = {}) {
    return this._json('POST', '/devices', { pub, meta });
  }

  async getDevice(kid) {
    try { return await this._json('GET', `/devices/${encodeURIComponent(kid)}`); }
    catch { return null; }
  }

  async listNodes() {
    const r = await this._json('GET', '/nodes');
    return r.nodes || [];
  }

  async postEnvelope(env) {
    return this._json('POST', '/envelopes', env);
  }

  async pull(kid) {
    const r = await this._json('GET', `/envelopes?to=${encodeURIComponent(kid)}`);
    return r.envelopes || [];
  }

  /** Long-poll fallback for browsers/proxies that block WebSockets — the
   *  hospital-network case this product is built for. */
  startPolling(kid, intervalMs = 2500) {
    this.stopPolling();
    const tick = async () => {
      try {
        for (const env of await this.pull(kid)) this._fanout(kid, env);
      } catch (e) { /* offline: the next tick retries */ }
    };
    this._timer = setInterval(tick, intervalMs);
    tick();
  }

  stopPolling() { if (this._timer) clearInterval(this._timer); this._timer = null; }

  async _json(method, path, body) {
    const res = await fetch(this.base + path, {
      method, headers: this._headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`relay ${method} ${path} → ${res.status}`);
    return res.status === 204 ? null : res.json();
  }
}
