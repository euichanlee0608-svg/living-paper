/* In-browser stand-in for the on-prem node.
 *
 * Everything here except the language model is the real thing: this
 * "node" holds its own P-256 identity, is a genuine envelope recipient,
 * verifies the requester's signature, and seals its answer back. Swap it
 * for node/server.py and the front end does not change by one line —
 * the interface is the envelope, not the implementation.
 *
 * What is faked: retrieval is a lookup over src/data/seed.js and
 * generation is a template. Marked as `simulated: true` on every answer
 * so nothing downstream can quietly present it as model output.
 */
import { generateIdentity } from '../crypto/keys.js';
import { seal, open } from '../crypto/envelope.js';
import { findGlossary, docById, DEMO_LAB } from '../data/seed.js';

const STAGES = [
  { id: 'receive',  label: '봉인 해제',      ms: [180, 320] },
  { id: 'embed',    label: '질의 임베딩',    ms: [220, 420] },
  { id: 'retrieve', label: '랩 KB 검색',     ms: [340, 620] },
  { id: 'rerank',   label: '근거 재정렬',    ms: [180, 300] },
  { id: 'generate', label: '로컬 LLM 생성',  ms: [900, 1600] },
  { id: 'seal',     label: '응답 재봉인',    ms: [140, 260] },
];

const rand = ([a, b]) => a + Math.random() * (b - a);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export class NodeSimulator {
  /** @param {object} relay  a MockRelay/HttpRelay instance */
  constructor(relay, { model = 'qwen2.5:14b-instruct-q4_K_M', deviceLabel = 'lab-node-01 (RTX 4090)' } = {}) {
    this.relay = relay;
    this.model = model;
    this.deviceLabel = deviceLabel;
    this.identity = null;
    this.senderKeys = new Map();  // kid -> public bundle, for signature checks
    this.corpus = [];             // ingested chunks
    this.docs = [];               // ingested document manifest
    this.onStage = null;          // (jobId, stageId, label, done) => void
    this._unsub = null;
  }

  async start() {
    this.identity = await generateIdentity();
    await this.relay.registerDevice(this.identity.pub, { role: 'lab-node', label: this.deviceLabel });
    this._unsub = this.relay.subscribe(this.identity.kid, (env) => this._handle(env));
    return this.identity.pub;
  }

  stop() { this._unsub?.(); this._unsub = null; }

  /** The node must know who is allowed to ask. In a real deployment this
   *  is the lab roster, provisioned at pairing time. */
  trust(pub) { this.senderKeys.set(pub.kid, pub); }

  async _handle(env) {
    if (env.aad.type === 'kb-ingest') return this._ingest(env);
    if (env.aad.type !== 'explain-request') return;
    const jobId = env.aad.jobId;
    const t0 = performance.now();

    const senderPub = this.senderKeys.get(env.sender) || null;
    let req;
    try {
      req = await open(env, this.identity, senderPub);
    } catch (e) {
      console.warn('[node] rejected envelope', jobId, e.message);
      return;
    }

    for (const s of STAGES) {
      this.onStage?.(jobId, s.id, s.label, false);
      await wait(rand(s.ms));
      this.onStage?.(jobId, s.id, s.label, true);
    }

    const answer = this._explain(req, Math.round(performance.now() - t0));
    const back = await seal(answer, {
      sender: this.identity,
      recipients: [senderPub || req.replyTo].filter(Boolean),
      aad: { labId: env.aad.labId, jobId, type: 'explain-answer', ts: Date.now() },
    });
    await this.relay.postEnvelope(back);
  }

  /** Documents arrive sealed exactly like questions do. On a real node
   *  this is where embedding + indexing happens; here we keep the chunks
   *  in memory and score them by token overlap, which is enough to show
   *  that an ingested document changes the answers. */
  async _ingest(env) {
    let doc;
    try {
      doc = await open(env, this.identity, this.senderKeys.get(env.sender) || null);
    } catch (e) {
      console.warn('[node] rejected ingest', e.message);
      return;
    }
    const stored = doc.chunks.map((c, i) => ({
      ...c, docId: doc.docId, docTitle: doc.title, kind: doc.kind, i,
    }));
    this.corpus.push(...stored);
    this.docs.push({ docId: doc.docId, title: doc.title, kind: doc.kind,
                     chunks: stored.length, at: Date.now() });

    const back = await seal(
      { docId: doc.docId, chunks: stored.length, indexed: true },
      { sender: this.identity,
        recipients: [this.senderKeys.get(env.sender) || doc.replyTo].filter(Boolean),
        aad: { labId: env.aad.labId, jobId: env.aad.jobId, type: 'kb-ingest-ack', ts: Date.now() } },
    );
    await this.relay.postEnvelope(back);
  }

  /** Score ingested chunks against the query. Deliberately dumb (token
   *  overlap): the point is the plumbing, and node/server.py is where a
   *  real embedding index goes. */
  _searchCorpus(query) {
    const q = (query || '').toLowerCase().trim();
    if (!q || !this.corpus.length) return [];
    // tokenise on the spaced query — collapsing whitespace first would
    // fuse every word into one token that matches nothing
    const terms = [...new Set(q.match(/[가-힣]{2,}|[a-z0-9]{2,}/g) || [])];
    if (!terms.length) return [];
    return this.corpus
      .map((c) => {
        const hay = c.text.toLowerCase();
        let score = 0;
        for (const t of terms) if (hay.includes(t)) score += t.length;
        return { c, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((x) => x.c);
  }

  _explain({ keyword, note, meeting, atSec }, ms) {
    const hit = findGlossary(keyword);
    const found = this._searchCorpus(`${keyword} ${note || ''}`);
    const base = {
      jobId: null, term: keyword, simulated: true,
      meta: {
        model: this.model, device: this.deviceLabel, ms,
        tokensIn: 380 + Math.floor(Math.random() * 220),
        tokensOut: 210 + Math.floor(Math.random() * 180),
        retrieved: hit ? hit.entry.docs.length : 0,
        labId: DEMO_LAB.labId,
      },
    };

    if (!hit && found.length) {
      // nothing in the curated glossary, but an uploaded document matches
      return {
        ...base,
        grounded: true,
        confidence: 0.71,
        oneLine: found[0].text.slice(0, 220) + (found[0].text.length > 220 ? '…' : ''),
        inThisLab: `업로드한 「${found[0].docTitle}」에서 이 내용을 찾았습니다. 아래 발췌를 확인하세요.`,
        whyItCameUp: this._contextLine({ note, meeting, atSec, term: keyword }),
        citations: found.map((c) => ({
          docId: c.docId, title: c.docTitle, kind: c.kind, updated: '방금 수집',
          quote: c.text.slice(0, 200) + (c.text.length > 200 ? '…' : ''),
        })),
        followUps: ['이 문서의 다른 부분도 보여주세요', '용어집에 항목으로 등록하기',
                    '관련된 이전 미팅을 찾아주세요'],
        meta: { ...base.meta, retrieved: found.length },
      };
    }

    if (!hit) {
      return {
        ...base,
        grounded: false,
        confidence: 0.28,
        oneLine: `“${keyword}”와 맞는 항목을 이 랩의 지식베이스에서 찾지 못했습니다.`,
        inThisLab: null,
        whyItCameUp: note
          ? `남기신 메모: “${note}”. 다만 이 용어를 설명할 랩 문서가 아직 없어, 맥락을 붙이지 못했습니다.`
          : '이 용어를 설명할 랩 문서가 아직 없습니다.',
        citations: [],
        followUps: [
          '이 용어가 나온 문서를 지식베이스에 추가할까요?',
          '비슷한 다른 표현으로 다시 찾아볼까요?',
          '미팅 참석자 중 누구에게 물어보면 좋을지 추천받기',
        ],
        notice: '랩 맥락 없이 일반 지식만으로 답하면 정확도를 보장할 수 없어, 추측 대신 없다고 답합니다.',
      };
    }

    const g = hit.entry;
    const cites = g.docs.map(docById).filter(Boolean).map((d) => ({
      docId: d.id, title: d.title, kind: d.kind, updated: d.updated, quote: d.excerpt,
    }));

    return {
      ...base,
      term: g.term,
      grounded: true,
      confidence: Math.min(0.94, 0.62 + hit.score * 0.32),
      oneLine: g.general,
      inThisLab: g.lab,
      whyItCameUp: this._contextLine({ note, meeting, atSec, term: g.term }),
      citations: cites,
      followUps: this._followUps(g),
      tags: g.tags,
    };
  }

  _contextLine({ note, meeting, atSec, term }) {
    const stamp = atSec != null
      ? `${String(Math.floor(atSec / 60)).padStart(2, '0')}:${String(atSec % 60).padStart(2, '0')}`
      : null;
    const where = stamp ? `미팅 ${stamp} 지점` : '이번 미팅';
    const title = meeting?.title ? `「${meeting.title}」` : '';
    const memo = note ? ` 남기신 메모는 “${note}”였습니다.` : '';
    return `${title} ${where}에서 ${term} 이야기가 나왔습니다.${memo}`;
  }

  _followUps(g) {
    const pool = {
      공정: ['이 조건을 바꿨을 때 과거 배치에서 무슨 일이 있었나요?', '현재 규약의 근거 문서를 보여주세요'],
      세포: ['검체 계대수별 예외 규칙을 정리해 주세요', '이 기준을 못 맞추면 어떻게 처리하나요?'],
      IRB: ['개정 전후로 실무에서 달라진 것만 짚어주세요', '반출 당일 체크리스트를 만들어 주세요'],
      트러블슈팅: ['같은 증상이 다른 배치에도 있었나요?', '원인 판정 근거가 된 데이터는 무엇인가요?'],
      규정: ['우리 랩이 실제로 바꾼 절차는 무엇인가요?'],
      장비: ['장비 점검 주기와 마지막 점검일을 알려주세요'],
      판정기준: ['이 기준은 언제, 왜 바뀌었나요?'],
      프로토콜: ['표준값에서 벗어난 사례를 모아 보여주세요'],
    };
    const out = [];
    for (const t of g.tags || []) for (const q of pool[t] || []) if (!out.includes(q)) out.push(q);
    out.push('이 설명을 랩 위키에 초안으로 저장하기');
    return out.slice(0, 3);
  }
}
