/* Application core: state and actions. No DOM in this file.
 *
 * The flow the product is built around, in four steps:
 *   capture  — one tap during the meeting, nothing else
 *   tag      — keywords afterwards, when you are not also listening
 *   seal     — envelope leaves the device already encrypted
 *   explain  — the on-prem node answers with lab context and citations
 */
import * as db from './data/db.js';
import { STORES, uid } from './data/db.js';
import { generateIdentity } from './crypto/keys.js';
import { seal, open, relayView, envelopeSize } from './crypto/envelope.js';
import {
  createLabKey, generateRecoveryCode, sealWithRecoveryCode, wrapLabKeyFor,
} from './crypto/labkey.js';
import { fingerprint } from './crypto/fingerprint.js';
import { toB64u, fromB64u, te, td } from './crypto/base.js';
import { MockRelay, HttpRelay } from './net/relay.js';
import { NodeSimulator } from './net/nodesim.js';
import { DEMO_LAB, DEMO_MEETING, DEMO_MOMENTS, GLOSSARY, DOCS } from './data/seed.js';

export const bus = new EventTarget();
export const emit = (name, detail) => bus.dispatchEvent(new CustomEvent(name, { detail }));

export const state = {
  ready: false,
  mode: 'demo',          // 'demo' | 'connected'
  identity: null,
  lab: null,
  node: null,            // { pub, label, verified, fingerprint }
  relay: null,
  nodeSim: null,
  meeting: null,         // active meeting
  moments: [],
  jobs: new Map(),       // jobId -> { status, stage, momentId, envelope, sizeBytes }
  answers: new Map(),    // jobId -> answer
  meetings: [],
  recoveryCode: null,    // shown once, at lab creation
  ingested: [],          // documents pushed into the lab KB from this device
  relayCfg: null,        // { url, token } when connected to a real relay
  members: [],           // devices granted the lab key from here
};

/* ---------------- boot ---------------- */

export async function boot() {
  await db.openDB();

  let idRow = await db.get(STORES.identity, 'me');
  if (!idRow) {
    const id = await generateIdentity();
    idRow = {
      id: 'me', kid: id.kid, pub: id.pub,
      encPriv: id.encPriv, encPub: id.encPub, sigPriv: id.sigPriv, sigPub: id.sigPub,
      createdAt: Date.now(),
    };
    await db.put(STORES.identity, idRow);
  }
  state.identity = {
    kid: idRow.kid, pub: idRow.pub,
    encPriv: idRow.encPriv, encPub: idRow.encPub,
    sigPriv: idRow.sigPriv, sigPub: idRow.sigPub,
  };
  state.identity.fingerprint = await fingerprint(idRow.pub);

  const labs = await db.all(STORES.labs);
  state.lab = labs[0] || null;

  state.meetings = (await db.all(STORES.meetings)).sort((a, b) => b.startedAt - a.startedAt);
  // Reopen whatever the user was last working on: a reload in the middle of
  // a meeting must not look like the meeting never happened.
  if (state.meetings.length) {
    state.meeting = state.meetings[0];
    state.moments = (await db.byIndex(STORES.moments, 'byMeeting', state.meeting.id))
      .sort((a, b) => a.atSec - b.atSec);
  }
  for (const a of await db.all(STORES.answers)) state.answers.set(a.jobId, a.answer);
  for (const j of await db.all(STORES.jobs)) {
    state.jobs.set(j.jobId, { ...j, stage: j.status === 'answered' ? 'done' : j.stage });
  }

  await connect();
  state.ready = true;
  emit('ready');
}

/** Demo mode wires a relay and a node inside this tab. Connected mode
 *  points the same client at a real relay and a real on-prem node. */
export async function connect() {
  const cfg = await db.getSetting('relay', null);
  state.relayCfg = cfg?.url ? cfg : null;
  if (cfg?.url) {
    state.mode = 'connected';
    state.relay = new HttpRelay(cfg.url, cfg.token);
    await state.relay.registerDevice(state.identity.pub, { role: 'member' });
    state.relay.subscribe(state.identity.kid, onEnvelope);
    state.relay.startPolling(state.identity.kid);
  } else {
    state.mode = 'demo';
    state.relay = new MockRelay();
    await state.relay.registerDevice(state.identity.pub, { role: 'member' });
    state.relay.subscribe(state.identity.kid, onEnvelope);

    const sim = new NodeSimulator(state.relay);
    const nodePub = await sim.start();
    sim.trust(state.identity.pub);
    sim.onStage = (jobId, stage, label, done) => {
      const j = state.jobs.get(jobId);
      if (!j) return;
      j.stage = stage; j.stageLabel = label; j.stageDone = done;
      emit('job', { jobId });
    };
    state.nodeSim = sim;
    state.node = {
      pub: nodePub, label: sim.deviceLabel, verified: false,
      fingerprint: await fingerprint(nodePub),
    };
  }
  emit('connection');
}

/* ---------------- lab ---------------- */

export async function createDemoLab() {
  const lmk = createLabKey();
  const code = generateRecoveryCode();
  const recovery = await sealWithRecoveryCode(lmk, code, DEMO_LAB.labId);
  const lmkEnvelope = await seal({ lmk: [...lmk] }, {
    sender: state.identity,
    recipients: [state.identity.pub],
    aad: { labId: DEMO_LAB.labId, jobId: `lmk:${DEMO_LAB.labId}`, type: 'lab-key-at-rest', ts: Date.now() },
  });
  lmk.fill(0);

  const lab = { ...DEMO_LAB, createdAt: Date.now(), lmkEnvelope, recovery, nodeKid: state.node?.pub.kid || null };
  await db.put(STORES.labs, lab);
  state.lab = lab;
  state.recoveryCode = code;

  for (const g of GLOSSARY) await db.put(STORES.kb, { ...g, labId: lab.labId, source: 'glossary' });
  for (const d of DOCS) await db.put(STORES.kb, { ...d, labId: lab.labId, source: 'doc' });

  emit('lab');
  return { lab, code };
}

/** Re-issue the recovery kit.
 *
 * The code itself is never stored — that is the point of it — so a reload
 * loses the string. Re-issuing unwraps the lab key from the envelope
 * sealed to this device, then re-seals it under a fresh code. The old
 * code stops working the moment this returns.
 */
export async function reissueRecovery() {
  if (!state.lab?.lmkEnvelope) throw new Error('랩 키를 찾을 수 없습니다');
  const { lmk } = await open(state.lab.lmkEnvelope, state.identity, state.identity.pub);
  const bytes = new Uint8Array(lmk);
  const code = generateRecoveryCode();
  state.lab.recovery = await sealWithRecoveryCode(bytes, code, state.lab.labId);
  state.lab.recoveryIssuedAt = Date.now();
  bytes.fill(0);
  await db.put(STORES.labs, state.lab);
  state.recoveryCode = code;
  emit('lab');
  return code;
}

export async function verifyNode() {
  if (!state.node) return;
  state.node.verified = true;
  if (state.lab) {
    state.lab.nodeVerifiedAt = Date.now();
    await db.put(STORES.labs, state.lab);
  }
  emit('connection');
}

/* ---------------- meeting capture ---------------- */

export async function startMeeting(title) {
  const m = {
    id: uid('mtg'),
    title: title?.trim() || `랩미팅 ${new Date().toLocaleDateString('ko-KR')}`,
    startedAt: Date.now(), endedAt: null, labId: state.lab?.labId || DEMO_LAB.labId,
  };
  await db.put(STORES.meetings, m);
  state.meeting = m;
  state.moments = [];
  state.meetings.unshift(m);
  emit('meeting');
  return m;
}

export async function markMoment(note = '') {
  if (!state.meeting) return null;
  const atSec = Math.round((Date.now() - state.meeting.startedAt) / 1000);
  const moment = {
    id: uid('mom'), meetingId: state.meeting.id, atSec, note,
    keyword: '', status: 'captured', createdAt: Date.now(),
  };
  await db.put(STORES.moments, moment);
  state.moments.push(moment);
  emit('moment', { moment });
  return moment;
}

export async function updateMoment(id, patch) {
  const i = state.moments.findIndex((m) => m.id === id);
  if (i < 0) return;
  state.moments[i] = { ...state.moments[i], ...patch };
  await db.put(STORES.moments, state.moments[i]);
  emit('moment', { moment: state.moments[i] });
}

export async function endMeeting() {
  if (!state.meeting) return;
  state.meeting.endedAt = Date.now();
  await db.put(STORES.meetings, state.meeting);
  emit('meeting');
}

export async function loadMoments(meetingId) {
  state.moments = (await db.byIndex(STORES.moments, 'byMeeting', meetingId))
    .sort((a, b) => a.atSec - b.atSec);
  emit('moment', {});
  return state.moments;
}

/** Seeds a finished meeting so a first-time visitor has something to tag. */
export async function seedDemoMeeting() {
  const startedAt = Date.now() - DEMO_MEETING.durationMin * 60000;
  const m = {
    id: DEMO_MEETING.id, title: DEMO_MEETING.title,
    startedAt, endedAt: Date.now(), labId: DEMO_LAB.labId,
    attendees: DEMO_MEETING.attendees, agenda: DEMO_MEETING.agenda, demo: true,
  };
  await db.put(STORES.meetings, m);
  if (!state.meetings.some((x) => x.id === m.id)) state.meetings.unshift(m);

  const existing = await db.byIndex(STORES.moments, 'byMeeting', m.id);
  if (!existing.length) {
    for (const d of DEMO_MOMENTS) {
      await db.put(STORES.moments, {
        id: uid('mom'), meetingId: m.id, atSec: d.atSec, note: d.note,
        keyword: d.keyword, status: 'captured', createdAt: Date.now(),
      });
    }
  }
  state.meeting = m;
  await loadMoments(m.id);
  emit('meeting');
  return m;
}

/* ---------------- ask the node ---------------- */

export async function askAbout(moment) {
  const keyword = (moment.keyword || '').trim();
  if (!keyword) throw new Error('키워드를 입력해 주세요');
  if (!state.node?.pub) throw new Error('연결된 랩 노드가 없습니다');

  const jobId = uid('job');
  const meeting = state.meetings.find((m) => m.id === moment.meetingId) || state.meeting;

  const envelope = await seal(
    {
      keyword, note: moment.note, atSec: moment.atSec,
      meeting: { id: meeting?.id, title: meeting?.title, agenda: meeting?.agenda },
      replyTo: state.identity.pub,
    },
    {
      sender: state.identity,
      recipients: [state.node.pub, state.identity.pub], // node answers; we keep our own copy
      aad: { labId: state.lab?.labId || DEMO_LAB.labId, jobId, type: 'explain-request', ts: Date.now() },
    },
  );

  const job = {
    jobId, momentId: moment.id, meetingId: moment.meetingId, keyword,
    status: 'sent', stage: 'receive', stageLabel: '전송 중',
    sizeBytes: envelopeSize(envelope), envelope, relaySees: relayView(envelope),
    createdAt: Date.now(),
  };
  state.jobs.set(jobId, job);
  await db.put(STORES.jobs, job);
  await updateMoment(moment.id, { status: 'sent', jobId });
  emit('job', { jobId });

  await state.relay.postEnvelope(envelope);
  return jobId;
}

async function onEnvelope(env) {
  if (env.aad.type === 'kb-ingest-ack') {
    let ack;
    try { ack = await open(env, state.identity, state.node?.pub || null); } catch { return; }
    const doc = state.ingested.find((d) => d.docId === ack.docId);
    if (doc) { doc.status = 'indexed'; doc.chunks = ack.chunks; }
    emit('ingest', { docId: ack.docId });
    return;
  }
  if (env.aad.type !== 'explain-answer') return;
  const jobId = env.aad.jobId;
  const job = state.jobs.get(jobId);
  const senderPub = state.node?.pub?.kid === env.sender ? state.node.pub : null;

  let answer;
  try {
    answer = await open(env, state.identity, senderPub);
  } catch (e) {
    if (job) { job.status = 'failed'; job.error = e.message; emit('job', { jobId }); }
    return;
  }

  state.answers.set(jobId, answer);
  await db.put(STORES.answers, { jobId, meetingId: job?.meetingId, answer, at: Date.now() });
  if (job) {
    job.status = 'answered'; job.stage = 'done'; job.answeredAt = Date.now();
    await db.put(STORES.jobs, { ...job, envelope: undefined });
    await updateMoment(job.momentId, { status: 'answered' });
  }
  emit('answer', { jobId });
  emit('job', { jobId });
}

/* ---------------- knowledge base ingestion ---------------- */

/** Chunk locally, seal, hand to the node. The file itself never leaves
 *  the device unsealed, and the relay only ever sees the envelope. */
export async function ingestDocument({ title, kind, chunks, bytes }) {
  if (!state.node?.pub) throw new Error('연결된 랩 노드가 없습니다');
  const docId = uid('doc');
  const jobId = uid('ing');

  const envelope = await seal(
    { docId, title, kind, chunks, replyTo: state.identity.pub },
    {
      sender: state.identity,
      recipients: [state.node.pub],
      aad: { labId: state.lab?.labId || DEMO_LAB.labId, jobId, type: 'kb-ingest', ts: Date.now() },
    },
  );

  const record = {
    docId, title, kind, bytes, chunks: chunks.length,
    status: 'sending', at: Date.now(), sizeBytes: envelopeSize(envelope),
    relaySees: relayView(envelope),
  };
  state.ingested.unshift(record);
  emit('ingest', { docId });

  await state.relay.postEnvelope(envelope);
  return docId;
}

/* ---------------- membership ---------------- */

/** An invite carries only public material: which lab, which relay, and
 *  the inviter's key fingerprint so the joiner can verify who they are
 *  talking to. The lab key is never in here — it is wrapped to the
 *  joiner's device key only after their public bundle comes back. */
export async function createInvite() {
  if (!state.lab) throw new Error('랩이 없습니다');
  const fp = await fingerprint(state.identity.pub);
  return {
    v: 1,
    lab: state.lab.labId,
    labName: state.lab.name,
    relay: state.relayCfg?.url || 'demo',
    by: state.identity.kid,
    fp: fp.short,
    exp: Date.now() + 24 * 3600 * 1000,
  };
}

// btoa() is Latin-1 only, and lab names are Korean — encode the UTF-8
// bytes instead of the string.
export const inviteToText = (invite) =>
  `lp1:${toB64u(te.encode(JSON.stringify(invite)))}`;

export function parseInvite(text) {
  const raw = String(text).trim().replace(/^lp1:/, '');
  const invite = JSON.parse(td.decode(fromB64u(raw)));
  if (invite.v !== 1) throw new Error('지원하지 않는 초대 형식입니다');
  if (invite.exp && invite.exp < Date.now()) throw new Error('만료된 초대입니다');
  return invite;
}

/** Grant a joiner the lab key by wrapping it to their device public key. */
export async function grantLabKey(memberPub) {
  const { lmk } = await open(state.lab.lmkEnvelope, state.identity, state.identity.pub);
  const bytes = new Uint8Array(lmk);
  const env = await wrapLabKeyFor(bytes, memberPub, state.identity, state.lab.labId);
  bytes.fill(0);
  const fp = await fingerprint(memberPub);
  state.members.push({ kid: memberPub.kid, fp, at: Date.now() });
  await state.relay.postEnvelope(env);
  emit('members');
  return env;
}

/* ---------------- relay connection ---------------- */

export async function testRelay(url, token) {
  const base = url.replace(/\/$/, '');
  const res = await fetch(base + '/health', {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`상태 코드 ${res.status}`);
  return res.json();
}

export async function setRelay(cfg) {
  await db.setSetting('relay', cfg);
  state.relayCfg = cfg;
  if (state.relay?.stopPolling) state.relay.stopPolling();
  state.nodeSim?.stop();
  state.nodeSim = null;
  state.node = null;
  await connect();
}

export async function useDemoMode() {
  await db.setSetting('relay', null);
  state.relayCfg = null;
  if (state.relay?.stopPolling) state.relay.stopPolling();
  await connect();
}

/* ---------------- misc ---------------- */

export const fmtTime = (sec) =>
  `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

export const fmtBytes = (n) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`);

export async function resetEverything() {
  await db.wipeEverything();
  location.reload();
}
