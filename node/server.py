"""Living Paper on-prem node — reference implementation.

This is the machine inside the lab/hospital boundary. It is the ONLY
place where envelopes are opened and the only place a language model
ever sees plaintext.

    browser ── sealed envelope ──> relay ──> this node
    this node ── sealed answer ──> relay ──> browser

Message types handled:
    explain-request -> explain-answer   (a question about a meeting moment)
    kb-ingest       -> kb-ingest-ack    (document chunks for the knowledge base)

Pipeline per request:
    poll relay → open envelope (ECDH → HKDF → AES-GCM, verify ECDSA)
    → retrieve from the lab knowledge base → generate with a local LLM
    (Ollama) → seal the answer back to the requester.

The crypto here mirrors src/crypto/*.js operation for operation; the two
implementations are kept interoperable by tests/crypto.test.html vectors.
Nothing in this file talks to any host except RELAY_URL and localhost
Ollama — that property is the product.

Run:
    pip install cryptography requests
    ollama pull qwen2.5:14b-instruct-q4_K_M     # or any local model
    LP_RELAY_URL=https://relay.example.workers.dev \
    LP_RELAY_TOKEN=... \
    python node/server.py

State (./node-state/):
    identity.json   this node's keypairs (PKCS8; protect the directory)
    kb.sqlite       lab knowledge base, AES-GCM encrypted per row
"""
from __future__ import annotations

import base64
import hashlib
import json
import os
import sqlite3
import time
from dataclasses import dataclass
from pathlib import Path

import requests
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import (
    decode_dss_signature, encode_dss_signature)
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.exceptions import InvalidSignature

RELAY_URL = os.environ.get("LP_RELAY_URL", "http://127.0.0.1:8787")
RELAY_TOKEN = os.environ.get("LP_RELAY_TOKEN", "")
OLLAMA_URL = os.environ.get("LP_OLLAMA_URL", "http://127.0.0.1:11434")
MODEL = os.environ.get("LP_MODEL", "qwen2.5:14b-instruct-q4_K_M")
STATE_DIR = Path(os.environ.get("LP_STATE_DIR", "node-state"))
POLL_SECONDS = float(os.environ.get("LP_POLL_SECONDS", "2.5"))
DEVICE_LABEL = os.environ.get("LP_DEVICE_LABEL", "lab-node-01")


# ---------------------------------------------------------------- b64url
def b64u(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def unb64u(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def canonical(value) -> str:
    """Must byte-match canonicalJSON() in src/crypto/base.js: sorted keys,
    no whitespace. It is used as AES-GCM AAD, so divergence = decrypt failure."""
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


# ---------------------------------------------------------------- identity
@dataclass
class Identity:
    kid: str
    enc_priv: ec.EllipticCurvePrivateKey
    sig_priv: ec.EllipticCurvePrivateKey

    @property
    def pub_bundle(self) -> dict:
        return {
            "kid": self.kid,
            "enc": _jwk(self.enc_priv.public_key()),
            "sig": _jwk(self.sig_priv.public_key()),
        }


def _jwk(pub: ec.EllipticCurvePublicKey) -> dict:
    nums = pub.public_numbers()
    return {
        "kty": "EC", "crv": "P-256",
        "x": b64u(nums.x.to_bytes(32, "big")),
        "y": b64u(nums.y.to_bytes(32, "big")),
    }


def _kid_of(enc_jwk: dict) -> str:
    canon = canonical({"kty": enc_jwk["kty"], "crv": enc_jwk["crv"],
                       "x": enc_jwk["x"], "y": enc_jwk["y"]})
    return b64u(hashlib.sha256(canon.encode()).digest()[:16])


def load_or_create_identity() -> Identity:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    path = STATE_DIR / "identity.json"
    if path.exists():
        raw = json.loads(path.read_text())
        enc = serialization.load_pem_private_key(raw["enc"].encode(), password=None)
        sig = serialization.load_pem_private_key(raw["sig"].encode(), password=None)
        return Identity(raw["kid"], enc, sig)

    enc = ec.generate_private_key(ec.SECP256R1())
    sig = ec.generate_private_key(ec.SECP256R1())
    kid = _kid_of(_jwk(enc.public_key()))
    pem = lambda k: k.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption()).decode()
    path.write_text(json.dumps({"kid": kid, "enc": pem(enc), "sig": pem(sig)}))
    try:
        path.chmod(0o600)
    except OSError:
        pass  # Windows: directory ACLs are the boundary instead
    print(f"[node] new identity {kid}")
    return Identity(kid, enc, sig)


# ---------------------------------------------------------------- envelope
WRAP_INFO = "LP1|wrap|ECDH-ES+A256GCMKW|{sender}|{recipient}|{job}"


def _hkdf(secret: bytes, info: str) -> bytes:
    return HKDF(algorithm=hashes.SHA256(), length=32, salt=b"\x00" * 32,
                info=info.encode()).derive(secret)


def _pub_from_jwk(jwk: dict) -> ec.EllipticCurvePublicKey:
    return ec.EllipticCurvePublicNumbers(
        int.from_bytes(unb64u(jwk["x"]), "big"),
        int.from_bytes(unb64u(jwk["y"]), "big"),
        ec.SECP256R1()).public_key()


def open_envelope(env: dict, me: Identity, sender_pub: dict | None) -> dict:
    """Mirror of envelope.open(): verify signature, unwrap CEK, decrypt."""
    assert env.get("v") == 1, "unsupported envelope version"
    slot = next((r for r in env["recipients"] if r["kid"] == me.kid), None)
    assert slot, "this node is not a recipient"

    header = {k: env[k] for k in ("v", "alg", "enc", "sender", "aad", "recipients")}
    header_bytes = canonical(header).encode()
    iv, ct = unb64u(env["iv"]), unb64u(env["ct"])

    if sender_pub is not None:
        assert sender_pub["kid"] == env["sender"], "sender kid mismatch"
        sig = unb64u(env["sig"])
        r = int.from_bytes(sig[:32], "big")
        s = int.from_bytes(sig[32:], "big")
        try:
            _pub_from_jwk(sender_pub["sig"]).verify(
                encode_dss_signature(r, s), header_bytes + iv + ct,
                ec.ECDSA(hashes.SHA256()))
        except InvalidSignature as e:
            raise AssertionError("signature verification failed") from e

    shared = me.enc_priv.exchange(ec.ECDH(), _pub_from_jwk(slot["epk"]))
    kek = _hkdf(shared, WRAP_INFO.format(
        sender=env["sender"], recipient=me.kid, job=env["aad"]["jobId"]))
    cek = AESGCM(kek).decrypt(unb64u(slot["iv"]), unb64u(slot["ek"]), None)
    plaintext = AESGCM(cek).decrypt(iv, ct, header_bytes)
    return json.loads(plaintext)


def seal_envelope(payload: dict, me: Identity, recipients: list[dict], aad: dict) -> dict:
    cek = os.urandom(32)
    iv = os.urandom(12)

    wrapped = []
    for r in recipients:
        eph = ec.generate_private_key(ec.SECP256R1())
        shared = eph.exchange(ec.ECDH(), _pub_from_jwk(r["enc"]))
        kek = _hkdf(shared, WRAP_INFO.format(
            sender=me.kid, recipient=r["kid"], job=aad["jobId"]))
        w_iv = os.urandom(12)
        wrapped.append({
            "kid": r["kid"], "epk": _jwk(eph.public_key()),
            "iv": b64u(w_iv), "ek": b64u(AESGCM(kek).encrypt(w_iv, cek, None)),
        })

    header = {"v": 1, "alg": "ECDH-ES+A256GCMKW", "enc": "A256GCM",
              "sender": me.kid, "aad": aad, "recipients": wrapped}
    header_bytes = canonical(header).encode()
    ct = AESGCM(cek).encrypt(iv, json.dumps(payload, ensure_ascii=False).encode(), header_bytes)

    der = me.sig_priv.sign(header_bytes + iv + ct, ec.ECDSA(hashes.SHA256()))
    r, s = decode_dss_signature(der)
    sig = r.to_bytes(32, "big") + s.to_bytes(32, "big")  # raw r‖s, matching WebCrypto

    return {**header, "iv": b64u(iv), "ct": b64u(ct), "sig": b64u(sig)}


# ---------------------------------------------------------------- knowledge base
def kb_connect() -> sqlite3.Connection:
    con = sqlite3.connect(STATE_DIR / "kb.sqlite")
    con.execute("""CREATE TABLE IF NOT EXISTS kb (
        id TEXT PRIMARY KEY, lab_id TEXT, kind TEXT,
        iv BLOB, ct BLOB)""")  # rows AES-GCM encrypted under the lab key
    return con


def kb_search(con: sqlite3.Connection, lab_key: bytes, lab_id: str, query: str, k: int = 4):
    """MVP retrieval: decrypt rows for the lab, rank by token overlap.
    The seam to upgrade is exactly here — swap for embeddings + a vector
    index without touching the crypto or the wire format."""
    rows = con.execute("SELECT id, kind, iv, ct FROM kb WHERE lab_id=?", (lab_id,)).fetchall()
    q_tokens = set(query.lower().split())
    scored = []
    for rid, kind, iv, ct in rows:
        try:
            doc = json.loads(AESGCM(lab_key).decrypt(iv, ct, rid.encode()))
        except Exception:
            continue  # wrong key or corrupt row: skip, never guess
        text = f"{doc.get('term', '')} {doc.get('text', '')} {' '.join(doc.get('aliases', []))}"
        score = sum(1 for t in q_tokens if t and t in text.lower())
        if score:
            scored.append((score, {"id": rid, "kind": kind, **doc}))
    scored.sort(key=lambda x: -x[0])
    return [d for _, d in scored[:k]]


# ---------------------------------------------------------------- LLM
PROMPT = """당신은 이 연구실 소속 연구원에게 답하는 조교입니다. 규칙:
- 반드시 아래 '랩 문서'에 있는 내용만 근거로 답하십시오.
- 문서에 없는 내용은 "랩 문서에 근거가 없습니다"라고 말하고 추측하지 마십시오.
- 구조: (1) 한 줄 정의 (2) 우리 랩에서는 — 랩 고유의 수치/규약/이력 (3) 근거 문서명.

랩 문서:
{context}

질문 키워드: {keyword}
질문자가 미팅 중 남긴 메모: {note}"""


def generate(keyword: str, note: str, docs: list[dict]) -> str:
    context = "\n\n".join(
        f"[{d.get('kind', 'doc')}] {d.get('term') or d.get('title')}\n{d.get('text', '')}"
        for d in docs) or "(검색된 문서 없음)"
    resp = requests.post(f"{OLLAMA_URL}/api/generate", json={
        "model": MODEL,
        "prompt": PROMPT.format(context=context, keyword=keyword, note=note or "(없음)"),
        "stream": False,
        "options": {"temperature": 0.2, "num_predict": 640},
    }, timeout=180)
    resp.raise_for_status()
    return resp.json()["response"].strip()


# ---------------------------------------------------------------- relay client
def relay(method: str, path: str, **kw):
    headers = kw.pop("headers", {})
    if RELAY_TOKEN:
        headers["authorization"] = f"Bearer {RELAY_TOKEN}"
    r = requests.request(method, RELAY_URL + path, headers=headers, timeout=30, **kw)
    r.raise_for_status()
    return r.json() if r.content else None


def fetch_sender(kid: str) -> dict | None:
    try:
        return relay("GET", f"/devices/{kid}")
    except requests.HTTPError:
        return None


# ---------------------------------------------------------------- main loop
def kb_store(con: sqlite3.Connection, lab_key: bytes, lab_id: str, doc: dict) -> int:
    """Write chunks encrypted under the lab key, row id as AAD so a row
    cannot be moved to a different id without failing decryption."""
    n = 0
    for i, chunk in enumerate(doc.get("chunks", [])):
        rid = f"{doc['docId']}#{i}"
        payload = json.dumps({
            "term": doc.get("title", ""),
            "text": chunk.get("text", ""),
            "title": chunk.get("title", ""),
            "updated": time.strftime("%Y-%m-%d"),
        }, ensure_ascii=False).encode()
        iv = os.urandom(12)
        ct = AESGCM(lab_key).encrypt(iv, payload, rid.encode())
        con.execute("INSERT OR REPLACE INTO kb VALUES (?,?,?,?,?)",
                    (rid, lab_id, doc.get("kind", "doc"), iv, ct))
        n += 1
    con.commit()
    return n


def handle_ingest(env: dict, me: Identity, con: sqlite3.Connection, lab_key: bytes):
    aad = env["aad"]
    sender_pub = fetch_sender(env["sender"])
    if sender_pub is None:
        print(f"[node] {aad['jobId']}: unknown sender - ingest dropped")
        return
    try:
        doc = open_envelope(env, me, sender_pub)
    except AssertionError as e:
        print(f"[node] {aad['jobId']}: ingest rejected ({e})")
        return

    n = kb_store(con, lab_key, aad["labId"], doc)
    print(f"[node] {aad['jobId']}: indexed {n} chunks from {doc.get('title')!r}")

    ack = seal_envelope(
        {"docId": doc["docId"], "chunks": n, "indexed": True},
        me, [sender_pub],
        {"labId": aad["labId"], "jobId": aad["jobId"],
         "type": "kb-ingest-ack", "ts": int(time.time() * 1000)})
    relay("POST", "/envelopes", json=ack)


def handle(env: dict, me: Identity, con: sqlite3.Connection, lab_key: bytes):
    aad = env["aad"]
    if aad.get("type") == "kb-ingest":
        return handle_ingest(env, me, con, lab_key)
    if aad.get("type") != "explain-request":
        return
    t0 = time.time()

    sender_pub = fetch_sender(env["sender"])
    if sender_pub is None:
        print(f"[node] {aad['jobId']}: unknown sender {env['sender']} — dropped")
        return

    try:
        req = open_envelope(env, me, sender_pub)
    except AssertionError as e:
        print(f"[node] {aad['jobId']}: rejected ({e})")
        return

    keyword = req.get("keyword", "")
    docs = kb_search(con, lab_key, aad["labId"], f"{keyword} {req.get('note', '')}")
    try:
        text = generate(keyword, req.get("note", ""), docs)
        grounded = bool(docs)
    except requests.RequestException as e:
        text, grounded = f"로컬 모델 호출 실패: {e}", False

    answer = {
        "term": keyword,
        "grounded": grounded,
        "confidence": 0.9 if grounded else 0.3,
        "oneLine": text,
        "inThisLab": None,          # the browser renders `oneLine` whole for the MVP node
        "whyItCameUp": req.get("note", ""),
        "citations": [{"docId": d["id"], "title": d.get("term") or d.get("title", ""),
                       "kind": d.get("kind", "doc"), "updated": d.get("updated", ""),
                       "quote": d.get("text", "")[:180]} for d in docs],
        "followUps": [],
        "simulated": False,
        "meta": {"model": MODEL, "device": DEVICE_LABEL,
                 "ms": int((time.time() - t0) * 1000), "retrieved": len(docs)},
    }
    back = seal_envelope(
        answer, me, [sender_pub],
        {"labId": aad["labId"], "jobId": aad["jobId"],
         "type": "explain-answer", "ts": int(time.time() * 1000)})
    relay("POST", "/envelopes", json=back)
    print(f"[node] {aad['jobId']}: answered ({answer['meta']['ms']} ms, {len(docs)} docs)")


def main():
    me = load_or_create_identity()
    con = kb_connect()
    # MVP: lab key provisioned as a file dropped during setup. The real
    # pairing flow (wrapLabKeyFor → envelope) replaces this file.
    key_path = STATE_DIR / "lab.key"
    if not key_path.exists():
        key_path.write_bytes(os.urandom(32))
        print("[node] generated new lab key (provision KB rows with it)")
    lab_key = key_path.read_bytes()

    relay("POST", "/devices", json={"pub": me.pub_bundle,
                                    "meta": {"role": "lab-node", "label": DEVICE_LABEL}})
    print(f"[node] {me.kid} polling {RELAY_URL} every {POLL_SECONDS}s — model {MODEL}")

    while True:
        try:
            for env in (relay("GET", f"/envelopes?to={me.kid}") or {}).get("envelopes", []):
                handle(env, me, con, lab_key)
        except requests.RequestException as e:
            print(f"[node] relay unreachable: {e}")
        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()
