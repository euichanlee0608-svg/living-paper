/* Living Paper relay — Cloudflare Worker reference implementation.
 *
 * The relay's entire job description:
 *   1. hold device public bundles (a directory, not a CA)
 *   2. accept sealed envelopes and queue them per recipient kid
 *   3. hand queued envelopes to the recipient that asks
 *
 * It cannot decrypt anything it stores — it never holds key material —
 * and the client treats it as hostile: envelope integrity is verified
 * end-to-end (AES-GCM tag + ECDSA signature), and key substitution is
 * caught by out-of-band fingerprint verification. See docs/THREAT_MODEL.md.
 *
 * Deploy:
 *   wrangler kv namespace create LP_KV
 *   wrangler deploy relay/worker.js
 * Then in the app: 설정 탭 → 연결 → this worker's URL.
 *
 * KV layout:
 *   dev:<kid>            → public bundle JSON        (no TTL)
 *   q:<kid>:<ts>:<rand>  → envelope JSON             (TTL 7 days)
 *
 * The queue is drained on read. At MVP scale (a lab, not a fleet) KV
 * list+get is fine; the moment this needs ordering guarantees or fan-out,
 * swap the storage for a Durable Object per lab and keep the API.
 */

const JSON_HEADERS = {
  'content-type': 'application/json',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type, authorization',
};

const ok = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
const err = (message, status) => ok({ error: message }, status);

/** Envelope shape check — structural only. The relay cannot (and must not
 *  try to) validate contents; it just refuses obvious garbage. */
function looksLikeEnvelope(e) {
  return e && e.v === 1
    && typeof e.sender === 'string'
    && e.aad && typeof e.aad.jobId === 'string' && typeof e.aad.type === 'string'
    && Array.isArray(e.recipients) && e.recipients.length >= 1
    && e.recipients.every((r) => typeof r.kid === 'string' && typeof r.ek === 'string')
    && typeof e.iv === 'string' && typeof e.ct === 'string' && typeof e.sig === 'string';
}

const MAX_ENVELOPE_BYTES = 64 * 1024;   // a keyword request is ~2 KB; 64 KB is generous
const QUEUE_TTL_SECONDS = 7 * 24 * 3600;

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: JSON_HEADERS });

    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, '');

    // Static bearer token per lab: enough for an MVP pilot, and honest
    // about being an availability control, not a confidentiality one —
    // confidentiality never depends on the relay.
    if (env.RELAY_TOKEN) {
      const got = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
      if (got !== env.RELAY_TOKEN) return err('unauthorized', 401);
    }

    try {
      if (req.method === 'POST' && path === '/devices') {
        const { pub, meta } = await req.json();
        if (!pub?.kid || !pub.enc || !pub.sig) return err('malformed device bundle', 400);
        // First write wins. A kid is the hash of the key itself, so an
        // overwrite could only ever be an impersonation attempt.
        const existing = await env.LP_KV.get(`dev:${pub.kid}`);
        if (existing && existing !== JSON.stringify({ pub, meta })) {
          return err('kid already registered with different material', 409);
        }
        await env.LP_KV.put(`dev:${pub.kid}`, JSON.stringify({ pub, meta }));
        return ok({ ok: true });
      }

      if (req.method === 'GET' && path.startsWith('/devices/')) {
        const kid = decodeURIComponent(path.slice('/devices/'.length));
        const row = await env.LP_KV.get(`dev:${kid}`, 'json');
        return row ? ok(row.pub) : err('unknown device', 404);
      }

      if (req.method === 'POST' && path === '/envelopes') {
        const body = await req.text();
        if (body.length > MAX_ENVELOPE_BYTES) return err('envelope too large', 413);
        let envlp;
        try { envlp = JSON.parse(body); } catch { return err('not JSON', 400); }
        if (!looksLikeEnvelope(envlp)) return err('malformed envelope', 400);

        const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
        await Promise.all(envlp.recipients.map((r) =>
          env.LP_KV.put(`q:${r.kid}:${stamp}`, body, { expirationTtl: QUEUE_TTL_SECONDS })));
        return ok({ ok: true, jobId: envlp.aad.jobId });
      }

      if (req.method === 'GET' && path === '/envelopes') {
        const kid = url.searchParams.get('to');
        if (!kid) return err('missing ?to=<kid>', 400);
        const list = await env.LP_KV.list({ prefix: `q:${kid}:` });
        const envelopes = [];
        for (const k of list.keys) {
          const v = await env.LP_KV.get(k.name, 'json');
          if (v) envelopes.push(v);
          await env.LP_KV.delete(k.name);   // drained on read
        }
        return ok({ envelopes });
      }

      if (req.method === 'GET' && path === '/health') {
        return ok({ ok: true, service: 'living-paper-relay', knows: 'routing metadata only' });
      }

      return err('not found', 404);
    } catch (e) {
      return err(`relay error: ${e.message}`, 500);
    }
  },
};
