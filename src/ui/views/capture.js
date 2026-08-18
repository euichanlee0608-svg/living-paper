/* 미팅 — the capture screen.
 *
 * Deliberately the emptiest screen in the app. The interviews said
 * real-time assistance breaks concentration (30% wanted it, 95% wanted
 * security), so during the meeting the product does exactly one thing:
 * records that you lost the thread, and gets out of the way.
 *
 * One tap. No typing, no reading, no AI. Everything else waits.
 */
import { state, startMeeting, markMoment, endMeeting, seedDemoMeeting, fmtTime } from '../../app.js';
import { html, raw, scope, toast, buzz, esc } from '../dom.js';
import { ico } from '../icons.js';

let timer = null;
const S = scope();

export function render(root, go) {
  S.clear();
  clearInterval(timer);
  const live = state.meeting && !state.meeting.endedAt;
  root.innerHTML = live ? liveHTML() : idleHTML();

  if (live) {
    timer = setInterval(() => {
      const el = root.querySelector('.capture-timer');
      if (el && state.meeting) el.textContent = fmtTime((Date.now() - state.meeting.startedAt) / 1000);
    }, 500);
  }

  S.on(root, 'click', '[data-start]', async () => {
    const title = root.querySelector('#mtitle')?.value || '';
    await startMeeting(title);
    render(root, go);
  });

  S.on(root, 'click', '[data-demo]', async () => {
    await seedDemoMeeting();
    toast('예시 미팅을 불러왔습니다', { icon: ico('check') });
    go('review');
  });

  S.on(root, 'click', '[data-miss]', async (e, btn) => {
    buzz(14);
    btn.classList.remove('pulse');
    void btn.offsetWidth;               // restart the ping animation
    btn.classList.add('pulse');
    const m = await markMoment();
    if (!m) return;
    const marks = root.querySelector('.marks');
    if (marks) {
      marks.insertAdjacentHTML('afterbegin',
        html`<span class="mark-chip">${raw(ico('tag'))}${fmtTime(m.atSec)}</span>`);
      const n = root.querySelector('[data-count]');
      if (n) n.textContent = state.moments.length;
    }
  });

  S.on(root, 'click', '[data-end]', async () => {
    await endMeeting();
    clearInterval(timer);
    toast(state.moments.length
      ? `${state.moments.length}개 지점을 정리할 차례입니다`
      : '표시한 지점이 없습니다', { icon: ico('check') });
    go('review');
  });
}

export function teardown() { S.clear(); clearInterval(timer); }

function idleHTML() {
  const recent = state.meetings.slice(0, 3);
  return html`
    <div class="view">
      <div class="view-head">
        <h1 class="h-view">미팅</h1>
        <p class="sub-view">회의 중에는 놓친 순간만 눌러 두세요. 정리는 끝나고 합니다.</p>
      </div>

      <div class="card card-pad stack">
        <div>
          <label class="sec-label" for="mtitle">미팅 이름</label>
          <input id="mtitle" class="field" style="margin-top:7px"
                 placeholder="${esc('예: 4월 정기 랩미팅')}" autocomplete="off">
        </div>
        <button class="btn btn-primary btn-block" data-start>
          ${raw(ico('mic'))} 미팅 시작
        </button>
        <p class="tiny mut" style="text-align:center">
          마이크나 녹음 권한은 요청하지 않습니다. 시간만 셉니다.
        </p>
      </div>

      <div class="card card-pad" style="margin-top:var(--s4)">
        <div class="between">
          <div>
            <div style="font-weight:700;color:var(--text);font-size:15px">처음이신가요?</div>
            <div class="tiny mut" style="margin-top:3px">
              실제 랩미팅 하나를 예시로 넣어 두었습니다. 바로 정리 단계부터 볼 수 있습니다.
            </div>
          </div>
        </div>
        <button class="btn btn-block" data-demo style="margin-top:var(--s4)">
          ${raw(ico('sparkles'))} 예시 미팅으로 둘러보기
        </button>
      </div>

      ${recent.length ? html`
        <div style="margin-top:var(--s6)">
          <div class="sec-label" style="margin-bottom:10px">지난 미팅</div>
          <div class="card">
            ${recent.map((m) => html`
              <div class="moment" style="align-items:center">
                <div class="grow">
                  <div style="font-weight:650;color:var(--text);font-size:14.5px">${m.title}</div>
                  <div class="tiny mut" style="margin-top:3px">
                    ${new Date(m.startedAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>`)}
          </div>
        </div>` : ''}
    </div>`;
}

function liveHTML() {
  const n = state.moments.length;
  return html`
    <div class="view capture">
      <div class="capture-head">
        <div class="t">${state.meeting.title}</div>
        <div class="capture-timer" style="margin-top:8px">${fmtTime((Date.now() - state.meeting.startedAt) / 1000)}</div>
        <div class="tiny mut" style="margin-top:6px">표시한 지점 <b data-count style="color:var(--accent)">${n}</b>개</div>
      </div>

      <button class="miss-btn" data-miss aria-label="지금 순간을 표시">
        <span class="big">놓쳤어요</span>
        <span class="small">눌러서 이 순간 표시</span>
      </button>

      <div class="marks">
        ${state.moments.slice().reverse().map((m) => html`
          <span class="mark-chip">${raw(ico('tag'))}${fmtTime(m.atSec)}</span>`)}
      </div>

      <button class="btn" data-end style="min-width:190px">미팅 종료하고 정리하기</button>
    </div>`;
}
