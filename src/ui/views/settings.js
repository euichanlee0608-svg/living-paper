/* 설정 — members first, then appearance, then the plumbing.
 *
 * Ordered by how often a user actually needs each thing: inviting a
 * teammate is common, switching relays is rare, and auditing keys is a
 * once-per-deployment event — so security lives behind one quiet row
 * that opens the full detail page (#/security) for those who want it.
 */
import {
  state, bus, testRelay, setRelay, useDemoMode,
  createInvite, inviteToText, parseInvite, grantLabKey,
} from '../../app.js';
import { generateIdentity } from '../../crypto/keys.js';
import { qrSVG } from '../components/qr.js';
import { html, raw, scope, esc, toast, copy, openSheet, closeSheet, relTime } from '../dom.js';
import { ico } from '../icons.js';

const S = scope();
let nav = () => {};

export function render(root, go) {
  S.clear();
  nav = go || nav;
  draw(root);
  S.listen(bus, 'connection', () => draw(root));
  S.listen(bus, 'members', () => draw(root));

  S.on(root, 'click', '[data-security]', () => nav('security'));

  S.on(root, 'click', '[data-test]', async () => {
    const url = root.querySelector('#relay-url')?.value.trim();
    const token = root.querySelector('#relay-token')?.value.trim();
    const out = root.querySelector('#relay-out');
    if (!url) return toast('릴레이 주소를 입력하세요');
    out.textContent = '확인 중…';
    out.style.color = 'var(--text-4)';
    try {
      const info = await testRelay(url, token);
      out.innerHTML = String(html`<b style="color:var(--green)">연결됨</b> — ${info.service || 'relay'} ·
        아는 것: ${info.knows || 'routing metadata only'}`);
      root.querySelector('[data-connect]').disabled = false;
    } catch (e) {
      out.innerHTML = String(html`<b style="color:var(--coral)">실패</b> — ${e.message}`);
      root.querySelector('[data-connect]').disabled = true;
    }
  });

  S.on(root, 'click', '[data-connect]', async () => {
    const url = root.querySelector('#relay-url').value.trim();
    const token = root.querySelector('#relay-token').value.trim();
    try {
      await setRelay({ url, token: token || null });
      toast('실서버 모드로 전환했습니다', { icon: ico('check') });
      draw(root);
    } catch (e) { toast(e.message, { icon: ico('alert') }); }
  });

  S.on(root, 'click', '[data-demo-mode]', async () => {
    await useDemoMode();
    toast('데모 모드로 돌아왔습니다', { icon: ico('check') });
    draw(root);
  });

  S.on(root, 'click', '[data-invite]', () => openInvite(root));
  S.on(root, 'click', '[data-theme]', (e, el) => {
    const next = el.dataset.theme;
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('lp-theme', next);
    draw(root);
  });
}

export function teardown() { S.clear(); }

/* ---------- invite ---------- */
async function openInvite(root) {
  const invite = await createInvite();
  const text = inviteToText(invite);

  const body = openSheet('멤버 초대', html`
    <div class="stack">
      <p class="tiny" style="color:var(--text-3);line-height:1.7;margin:0">
        팀원에게 이 QR을 보여주세요. 스캔하면 바로 우리 랩에 참여합니다.
        초대는 <b style="color:var(--text)">24시간</b> 동안 유효합니다.
      </p>

      <div class="qr-wrap">${raw(qrSVG(text))}</div>

      <div class="row" style="gap:6px">
        <button class="btn grow" data-copy-invite>${raw(ico('copy'))} 링크로 공유</button>
        <button class="btn btn-primary grow" data-sim-join>${raw(ico('users'))} 참여 시연</button>
      </div>
      <p class="tiny mut" style="margin:0">
        “참여 시연”은 팀원이 이 QR을 스캔했을 때의 과정을 이 자리에서 미리 보여줍니다.
      </p>
      <div id="join-out"></div>
    </div>`);

  body.querySelector('[data-copy-invite]').addEventListener('click', () => copy(text, '초대 코드를 복사했습니다'));
  body.querySelector('[data-sim-join]').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    const out = body.querySelector('#join-out');
    const step = (msg, ok = true) => {
      out.insertAdjacentHTML('beforeend', String(html`
        <div class="status" style="margin-top:6px">
          <span class="led ${ok ? '' : 'warn'}"></span><span>${msg}</span></div>`));
    };
    try {
      const parsed = parseInvite(text);
      step(`초대 확인 — ${parsed.labName}`);

      const joiner = await generateIdentity();
      step('팀원 기기를 등록했습니다');

      await grantLabKey(joiner.pub);
      step('랩 접근 권한을 안전하게 전달했습니다');
      toast('멤버를 추가했습니다', { icon: ico('check') });
      draw(root);
    } catch (err) {
      step(err.message, false);
    }
  });
}

/* ---------- view ---------- */
function draw(root) {
  const connected = state.mode === 'connected';
  const theme = document.documentElement.getAttribute('data-theme') || 'dark';

  root.innerHTML = String(html`
    <div class="view">
      <div class="view-head">
        <h1 class="h-view">설정</h1>
        <p class="sub-view">랩 구성원 · 화면 · 연결</p>
      </div>

      <!-- members: the thing people actually come here for -->
      <div class="card card-pad" style="margin-bottom:var(--s4)">
        <div class="between" style="margin-bottom:var(--s4)">
          <div class="sec-label" style="margin:0">랩 구성원</div>
          <span class="tiny mut">${state.members.length + 1}명</span>
        </div>

        <div class="status" style="margin-bottom:var(--s3)">
          <span class="led"></span>
          <span><b>이 기기</b> · 관리자</span>
        </div>
        ${state.members.map((m) => html`
          <div class="status" style="margin-bottom:var(--s3)">
            <span class="led"></span>
            <span><b>멤버</b> · ${relTime(m.at)} 참여</span>
          </div>`)}

        <button class="btn btn-primary btn-block" data-invite style="margin-top:var(--s2)">
          ${raw(ico('users'))} QR로 초대하기
        </button>
      </div>

      <!-- appearance -->
      <div class="card card-pad" style="margin-bottom:var(--s4)">
        <div class="sec-label">화면</div>
        <div class="row" style="gap:6px">
          <button class="btn grow ${theme === 'dark' ? 'btn-primary' : ''}" data-theme="dark">어두운 화면</button>
          <button class="btn grow ${theme === 'light' ? 'btn-primary' : ''}" data-theme="light">밝은 화면</button>
        </div>
        <p class="tiny mut" style="margin-top:var(--s3)">
          기본값은 어두운 화면입니다 — 미팅은 대개 조명을 낮춘 방에서 열립니다.
        </p>
      </div>

      <!-- connection -->
      <div class="card card-pad" style="margin-bottom:var(--s4)">
        <div class="between" style="margin-bottom:var(--s4)">
          <div class="sec-label" style="margin:0">연결</div>
          ${connected
            ? html`<span class="chip chip-ok">${raw(ico('cloud'))} 실서버</span>`
            : html`<span class="chip chip-accent">${raw(ico('server'))} 데모</span>`}
        </div>

        <div class="status" style="margin-bottom:var(--s4)">
          <span class="led ${connected ? 'live' : ''}"></span>
          <span>${connected
            ? html`릴레이 <b>${state.relayCfg?.url || ''}</b> 에 연결됨`
            : html`데모 모드 — 모든 것이 <b>이 브라우저 안에서</b> 실행됩니다`}</span>
        </div>

        ${connected ? html`
          <button class="btn btn-block" data-demo-mode>${raw(ico('refresh'))} 데모 모드로 되돌리기</button>
        ` : html`
          <div class="stack">
            <div>
              <label class="field-label" for="relay-url">릴레이 주소</label>
              <input id="relay-url" class="field" placeholder="https://relay.example.workers.dev"
                     autocomplete="off" spellcheck="false">
            </div>
            <div>
              <label class="field-label" for="relay-token">접근 토큰 (선택)</label>
              <input id="relay-token" class="field" type="password" placeholder="Bearer 토큰"
                     autocomplete="off">
            </div>
            <div class="row" style="gap:6px">
              <button class="btn grow" data-test>${raw(ico('refresh'))} 연결 확인</button>
              <button class="btn btn-primary grow" data-connect disabled>
                ${raw(ico('arrowRight'))} 전환</button>
            </div>
            <div id="relay-out" class="tiny mut"></div>
          </div>`}
      </div>

      <!-- privacy & security: one quiet row, full detail one tap away -->
      <div class="card card-pad">
        <div class="between">
          <div class="grow">
            <div style="font-weight:var(--w-strong);color:var(--text);font-size:14px">개인정보 · 보안</div>
            <div class="tiny mut" style="margin-top:3px">
              키 확인 · 복구 키트 · 데이터 삭제 · 통신 기록
            </div>
          </div>
          <button class="btn btn-sm" data-security>자세히 ${raw(ico('chevron'))}</button>
        </div>
      </div>
    </div>`);
}
