/* 설명 — the answers that came back from the on-prem node.
 *
 * Card order is deliberate: the general definition first so the reader
 * gets their footing, then "우리 랩에서는" — the block that a general
 * model cannot produce and the only one wearing the accent colour.
 * Citations follow, because an answer a researcher cannot trace is an
 * answer they will not use.
 */
import { state, bus, fmtTime } from '../../app.js';
import { html, raw, scope, toast, copy, relTime } from '../dom.js';
import { ico } from '../icons.js';

const S = scope();

export function render(root, go) {
  S.clear();
  draw(root);
  for (const ev of ['answer', 'job']) S.listen(bus, ev, () => draw(root));

  S.on(root, 'click', '[data-copy]', (e, el) => {
    const a = state.answers.get(el.dataset.copy);
    if (!a) return;
    copy([
      `# ${a.term}`, '', a.oneLine, '',
      a.inThisLab ? `## 우리 랩에서는\n${a.inThisLab}` : '',
      a.citations?.length ? `\n## 근거\n${a.citations.map((c) => `- ${c.title} (${c.updated}): ${c.quote}`).join('\n')}` : '',
    ].filter(Boolean).join('\n'), '설명을 복사했습니다');
  });
  S.on(root, 'click', '[data-followup]', () => toast('후속 질문은 다음 배포에서 열립니다', { icon: ico('sparkles') }));
  S.on(root, 'click', '[data-goreview]', () => go('review'));
}

export function teardown() { S.clear(); }

function draw(root) {
  const entries = [...state.answers.entries()]
    .map(([jobId, a]) => ({ jobId, a, job: state.jobs.get(jobId) }))
    .sort((x, y) => (y.job?.answeredAt || 0) - (x.job?.answeredAt || 0));

  const pending = [...state.jobs.values()].filter((j) => j.status === 'sent').length;

  root.innerHTML = html`
    <div class="view">
      <div class="view-head">
        <h1 class="h-view">설명</h1>
        <p class="sub-view">
          ${entries.length ? `${entries.length}개의 설명` : '아직 받은 설명이 없습니다'}${pending ? ` · ${pending}개 처리 중` : ''}
        </p>
      </div>

      ${entries.length === 0 ? html`
        <div class="card card-pad empty">
          ${raw(ico('sparkles'))}
          <b>설명이 아직 없습니다</b>
          정리 탭에서 키워드를 넣고 설명을 요청하면 여기에 쌓입니다.
          <div style="margin-top:var(--s4)">
            <button class="btn" data-goreview>정리하러 가기</button>
          </div>
        </div>` : entries.map(({ jobId, a, job }) => answerHTML(jobId, a, job))}
    </div>`;
}

function answerHTML(jobId, a, job) {
  const conf = Math.round((a.confidence || 0) * 100);
  const low = !a.grounded;

  return html`
    <div class="card answer" style="margin-bottom:var(--s4)">
      <div class="answer-head">
        <div class="between wrap" style="align-items:flex-start">
          <div class="grow">
            <div class="answer-term">${a.term}</div>
            <div class="tiny mut" style="margin-top:5px">
              ${job?.answeredAt ? relTime(job.answeredAt) : ''} ·
              ${a.meta?.device || '원내 노드'}
            </div>
          </div>
          <div class="conf" title="근거 문서 기반 신뢰도">
            <span class="tiny mut">신뢰도</span>
            <span class="conf-bar ${low ? 'low' : ''}"><i style="width:${conf}%"></i></span>
            <span class="tiny" style="color:${low ? 'var(--amber)' : 'var(--accent)'};font-weight:700">${conf}%</span>
          </div>
        </div>
        <div class="row wrap" style="margin-top:11px;gap:6px">
          ${a.grounded
            ? html`<span class="chip chip-ok">${raw(ico('check'))} 랩 문서 근거 있음</span>`
            : html`<span class="chip chip-warn">${raw(ico('alert'))} 랩 근거 없음</span>`}
          ${a.simulated ? html`<span class="chip">데모 · 모의 응답</span>` : ''}
        </div>
      </div>

      <div class="answer-body">
        <div class="blk">
          <div class="sec-label">한 줄 정의</div>
          <p>${a.oneLine}</p>
        </div>

        ${a.inThisLab ? html`
          <div class="blk lab-blk">
            <div class="sec-label">우리 랩에서는</div>
            <p>${a.inThisLab}</p>
          </div>` : ''}

        ${a.notice ? html`
          <div class="blk"><div class="notice">${raw(ico('alert'))}<span>${a.notice}</span></div></div>` : ''}

        ${a.whyItCameUp ? html`
          <div class="blk">
            <div class="sec-label">이 미팅에서</div>
            <p class="tiny" style="color:var(--text-4);font-size:13.5px">${a.whyItCameUp}</p>
          </div>` : ''}

        ${a.citations?.length ? html`
          <div class="blk">
            <div class="sec-label">근거 문서</div>
            ${a.citations.map((c) => html`
              <div class="cite">
                <span class="k">${c.kind}</span>
                <div class="grow">
                  <div class="t">${c.title}</div>
                  <div class="q">${c.quote}</div>
                  <div class="d">${c.updated} 갱신</div>
                </div>
              </div>`)}
          </div>` : ''}

        ${a.followUps?.length ? html`
          <div class="blk">
            <div class="sec-label">이어서 물어보기</div>
            <div class="followups">
              ${a.followUps.map((q) => html`
                <button data-followup>${raw(ico('arrowRight'))}<span>${q}</span></button>`)}
            </div>
          </div>` : ''}

        <div class="divider"></div>
        <div style="display:flex;justify-content:flex-end">
          <button class="btn btn-sm" data-copy="${jobId}">${raw(ico('copy'))} 복사</button>
        </div>
      </div>
    </div>`;
}
