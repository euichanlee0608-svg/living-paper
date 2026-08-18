/* 정리 — tag the captured moments, then send them to the lab node.
 *
 * This is where the user actually types, and it happens after the meeting
 * when they are no longer trying to listen at the same time. Keyword
 * suggestions come from the lab's own glossary, so the common case is
 * two taps and no typing at all.
 */
import { state, askAbout, updateMoment, loadMoments, fmtTime, fmtBytes, bus } from '../../app.js';
import { GLOSSARY } from '../../data/seed.js';
import { html, raw, scope, toast, esc } from '../dom.js';
import { ico } from '../icons.js';
import { relayPeek } from '../components/relaypeek.js';

const STEPS = [
  ['receive', '봉인 해제'], ['embed', '질의 임베딩'], ['retrieve', '랩 KB 검색'],
  ['rerank', '근거 재정렬'], ['generate', '로컬 LLM 생성'], ['seal', '응답 재봉인'],
];

const S = scope();

export function render(root, go) {
  S.clear();
  draw(root, go);

  for (const ev of ['job', 'answer', 'moment']) {
    S.listen(bus, ev, () => draw(root, go));
  }

  S.on(root, 'input', '[data-kw]', (e, el) => {
    updateMoment(el.dataset.kw, { keyword: el.value });
  });

  S.on(root, 'click', '[data-suggest]', (e, el) => {
    const input = root.querySelector(`[data-kw="${CSS.escape(el.dataset.for)}"]`);
    if (!input) return;
    input.value = el.dataset.suggest;
    updateMoment(el.dataset.for, { keyword: el.value = el.dataset.suggest });
    input.focus();
  });

  S.on(root, 'click', '[data-ask]', async (e, el) => {
    const m = state.moments.find((x) => x.id === el.dataset.ask);
    if (!m) return;
    try {
      await askAbout(m);
    } catch (err) {
      toast(err.message, { icon: ico('alert') });
    }
  });

  S.on(root, 'click', '[data-ask-all]', async () => {
    const pending = state.moments.filter((m) => m.keyword?.trim() && m.status !== 'answered' && m.status !== 'sent');
    if (!pending.length) return toast('보낼 항목이 없습니다');
    for (const m of pending) {
      try { await askAbout(m); } catch (err) { toast(err.message, { icon: ico('alert') }); }
    }
  });

  S.on(root, 'click', '[data-peek]', (e, el) => relayPeek(el.dataset.peek));
  S.on(root, 'click', '[data-see-answer]', () => go('answers'));
}

export function teardown() { S.clear(); }

function draw(root, go) {
  const scrollTop = root.scrollTop;
  const moments = state.moments;
  const meeting = state.meeting;

  if (!meeting) {
    root.innerHTML = html`
      <div class="view">
        <div class="view-head"><h1 class="h-view">정리</h1></div>
        <div class="card card-pad empty">
          ${raw(ico('tag'))}
          <b>정리할 미팅이 없습니다</b>
          미팅 탭에서 미팅을 시작하거나, 예시 미팅을 불러와 보세요.
        </div>
      </div>`;
    return;
  }

  const answered = moments.filter((m) => m.status === 'answered').length;
  const ready = moments.filter((m) => m.keyword?.trim() && m.status !== 'answered' && m.status !== 'sent').length;

  root.innerHTML = html`
    <div class="view">
      <div class="view-head">
        <h1 class="h-view">정리</h1>
        <p class="sub-view">${meeting.title} · 표시한 지점 ${moments.length}개${answered ? ` · 설명 완료 ${answered}개` : ''}</p>
      </div>

      ${moments.length === 0 ? html`
        <div class="card card-pad empty">
          ${raw(ico('hand'))}
          <b>표시한 지점이 없습니다</b>
          다음 미팅에서 모르는 이야기가 나오면 큰 버튼을 눌러 두세요.
        </div>` : html`

        ${ready ? html`
          <button class="btn btn-primary btn-block" data-ask-all style="margin-bottom:var(--s4)">
            ${raw(ico('send'))} 키워드 입력된 ${ready}개 한번에 요청
          </button>` : ''}

        <div class="card">
          ${moments.map((m) => momentHTML(m))}
        </div>

        <div class="status" style="margin-top:var(--s4)">
          ${raw(ico('lock'))}
          <span>키워드와 메모는 <b>기기에서 봉인된 뒤</b> 전송됩니다. 릴레이는 내용을 열 수 없습니다.</span>
        </div>`}
    </div>`;

  root.scrollTop = scrollTop;
}

function momentHTML(m) {
  const job = m.jobId ? state.jobs.get(m.jobId) : null;
  const answered = m.status === 'answered';
  const sending = m.status === 'sent' && !answered;
  const suggestions = suggestFor(m);

  return html`
    <div class="moment">
      <div class="ts">${fmtTime(m.atSec)}</div>
      <div class="body">
        <div class="note">${m.note || ''}</div>

        ${answered ? html`
          <div class="between wrap">
            <span class="chip chip-ok">${raw(ico('check'))} ${m.keyword}</span>
            <div class="row">
              ${job ? html`<button class="btn btn-sm" data-peek="${m.jobId}">
                ${raw(ico('eye'))} 릴레이가 본 것</button>` : ''}
              <button class="btn btn-sm" data-see-answer>설명 보기 ${raw(ico('chevron'))}</button>
            </div>
          </div>`
        : sending ? html`
          <div class="chip chip-lock">${raw(ico('lock'))} ${m.keyword}</div>
          ${pipelineHTML(job)}
          ${job ? html`
            <div class="row tiny mut" style="margin-top:9px;justify-content:space-between">
              <span>봉인 크기 ${fmtBytes(job.sizeBytes)}</span>
              <button class="btn btn-sm" data-peek="${m.jobId}">
                ${raw(ico('eye'))} 릴레이가 본 것</button>
            </div>` : ''}`
        : html`
          <input class="field" data-kw="${m.id}" value="${esc(m.keyword || '')}"
                 placeholder="${esc('못 알아들은 용어나 개념')}" autocomplete="off" enterkeyhint="done">
          ${suggestions.length ? html`
            <div class="suggest">
              ${suggestions.map((s) => html`
                <button data-suggest="${esc(s)}" data-for="${m.id}">${s}</button>`)}
            </div>` : ''}
          <button class="btn btn-sm btn-primary" data-ask="${m.id}" style="margin-top:11px"
                  ${m.keyword?.trim() ? '' : raw('disabled')}>
            ${raw(ico('send'))} 설명 요청
          </button>`}
      </div>
    </div>`;
}

function pipelineHTML(job) {
  if (!job) return '';
  const at = STEPS.findIndex(([id]) => id === job.stage);
  return html`
    <div class="pipe">
      ${STEPS.map(([id, label], i) => {
        const done = at > i || job.status === 'answered';
        const active = at === i && job.status !== 'answered';
        return html`<div class="pipe-step ${done ? 'done' : active ? 'active' : ''}">
          <span class="ic"></span><span>${label}</span></div>`;
      })}
      <div class="tiny mut" style="margin-top:5px">모든 단계가 원내 노드에서 실행됩니다.</div>
    </div>`;
}

/** Suggest from the lab glossary.
 *
 * Scored rather than filtered: an exact alias in the note beats a partial
 * one, and anything with no signal at all is dropped instead of padding
 * the row with arbitrary terms. Three bad chips are worse than none —
 * they make the user read instead of tap.
 */
function suggestFor(m) {
  const hay = `${m.note || ''}`.toLowerCase().replace(/\s+/g, '');
  if (!hay) return [];
  const scored = [];
  for (const g of GLOSSARY) {
    let best = 0;
    for (const cand of [g.term, ...g.aliases]) {
      const t = cand.toLowerCase().replace(/\s+/g, '');
      if (!t) continue;
      if (hay.includes(t)) best = Math.max(best, 1);
      else if (t.length >= 3 && hay.includes(t.slice(0, 3))) best = Math.max(best, 0.5);
    }
    if (best) scored.push({ term: g.term, score: best });
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .map((x) => x.term)
    .filter((t, i, arr) => arr.indexOf(t) === i && t !== m.keyword)
    .slice(0, 3);
}
