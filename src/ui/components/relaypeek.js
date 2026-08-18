/* "릴레이가 본 것" — the inspector that makes the architecture checkable
 * instead of merely claimed.
 *
 * It renders the exact bytes the relay stored, next to the plaintext the
 * user typed, and lets them grep the ciphertext for their own words. A
 * hospital IT reviewer can run this on their own phone in ten seconds,
 * which is worth more than any diagram in the pitch deck.
 */
import { state, fmtBytes } from '../../app.js';
import { html, raw, esc, openSheet, copy, toast } from '../dom.js';
import { ico } from '../icons.js';

/**
 * @param {string|null} jobId  a question job, or null when inspecting…
 * @param {object} [direct]    …any other sealed payload: { relaySees, sizeBytes, label }
 */
export function relayPeek(jobId, direct = null) {
  const job = jobId ? state.jobs.get(jobId) : null;
  if (!job && !direct) return toast('전송 기록을 찾을 수 없습니다');

  const seen = (job ? job.relaySees : direct.relaySees) || {};
  const sizeBytes = job ? job.sizeBytes : direct.sizeBytes;
  const probe = job ? job.keyword : direct.label;
  const pretty = JSON.stringify(seen, null, 2);
  const moment = job ? state.moments.find((m) => m.id === job.momentId) : null;
  const plain = job
    ? { keyword: job.keyword, note: moment?.note || '', atSec: moment?.atSec }
    : { document: direct.label, note: '문서 조각들이 이 봉투 안에 들어 있습니다' };

  const body = openSheet('릴레이가 본 것', html`
    <div class="stack">
      <div class="notice" style="background:var(--iris-dim);border-color:var(--iris-line);color:var(--iris)">
        ${raw(ico('lock'))}
        <span>아래가 클라우드 릴레이의 디스크에 실제로 저장된 전부입니다.
        복호화 키는 이 기기와 원내 노드에만 있습니다.</span>
      </div>

      <div>
        <div class="sec-label" style="margin-bottom:7px">① 내가 보낸 내용 (이 기기 안)</div>
        <div class="ct-view"><span class="ok">${JSON.stringify(plain, null, 2)}</span></div>
      </div>

      <div>
        <div class="sec-label" style="margin-bottom:7px">
          ② 릴레이에 저장된 것 · ${fmtBytes(sizeBytes)}
        </div>
        <div class="ct-view" id="ct-dump">${pretty}</div>
        <div class="tiny mut" style="margin-top:8px;line-height:1.7">
          <b style="color:var(--text-2)">labId · jobId · type · ts</b> 는 배달에 필요해 일부러 열어 둔 값입니다
          (누가 언제 요청했는지는 릴레이가 압니다).
          <b style="color:var(--text-2)">ct</b> 는 본문, <b style="color:var(--text-2)">ek</b> 는 수신자별로 감싼 콘텐츠 키입니다.
        </div>
      </div>

      <div class="card card-pad">
        <div class="sec-label" style="margin-bottom:9px">③ 직접 확인해 보세요</div>
        <p class="tiny mut" style="margin-bottom:10px">
          방금 입력한 단어를 넣어 암호문 안에서 찾아보세요. 하나도 나오지 않아야 정상입니다.
        </p>
        <input class="field" id="grep" placeholder="${esc(probe || '검색할 단어')}" autocomplete="off">
        <div id="grep-out" class="tiny" style="margin-top:10px;color:var(--text-4)">단어를 입력하면 검색합니다.</div>
      </div>

      <button class="btn btn-block" id="copy-env">
        ${raw(ico('copy'))} 봉인된 원문 JSON 복사
      </button>
    </div>`);

  const grep = body.querySelector('#grep');
  const out = body.querySelector('#grep-out');
  const hay = pretty;

  const run = () => {
    const q = grep.value.trim();
    if (!q) { out.textContent = '단어를 입력하면 검색합니다.'; out.style.color = 'var(--text-4)'; return; }
    const n = hay.toLowerCase().split(q.toLowerCase()).length - 1;
    if (n === 0) {
      out.innerHTML = html`<b style="color:var(--green)">0건</b> — “${q}” 는 릴레이가 저장한 데이터 어디에도 없습니다.`;
      out.style.color = 'var(--green)';
    } else {
      out.innerHTML = html`<b style="color:var(--coral)">${n}건</b> — “${q}” 가 발견되었습니다. 라우팅 메타데이터를 확인하세요.`;
      out.style.color = 'var(--coral)';
    }
  };
  grep.addEventListener('input', run);
  setTimeout(() => { grep.value = probe || ''; run(); }, 260);

  body.querySelector('#copy-env')?.addEventListener('click', () => copy(pretty, '봉인 JSON을 복사했습니다'));
}
