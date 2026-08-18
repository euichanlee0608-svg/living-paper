/* 설정 — where the demo becomes a deployment.
 *
 * Two switches live here: which relay this device talks to, and who else
 * is in the lab. Both are the moments where the architecture stops being
 * a diagram, so both show their consequences plainly — including that
 * connecting to a real relay hands it your metadata, and that inviting
 * someone hands them the lab key.
 */
import {
  state, bus, testRelay, setRelay, useDemoMode,
  createInvite, inviteToText, parseInvite, grantLabKey,
} from '../../app.js';
import { generateIdentity } from '../../crypto/keys.js';
import { fingerprint } from '../../crypto/fingerprint.js';
import { qrSVG } from '../components/qr.js';
import { html, raw, scope, esc, toast, copy, openSheet, closeSheet, relTime } from '../dom.js';
import { ico } from '../icons.js';

const S = scope();

export function render(root) {
  S.clear();
  draw(root);
  S.listen(bus, 'connection', () => draw(root));
  S.listen(bus, 'members', () => draw(root));

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
      <div class="notice notice-lock">${raw(ico('lock'))}
        <span>이 코드에는 <b>랩 키가 들어있지 않습니다.</b> 어느 랩·어느 릴레이인지와
        제 키 지문만 담깁니다. 랩 키는 상대의 공개키가 도착한 뒤에야 그 키로 감싸서 전달됩니다.</span></div>

      <div class="qr-wrap">${raw(qrSVG(text))}</div>

      <div>
        <div class="sec-label">초대 코드</div>
        <div class="ct-view" style="max-height:110px">${text}</div>
      </div>

      <div class="row" style="gap:6px">
        <button class="btn grow" data-copy-invite>${raw(ico('copy'))} 코드 복사</button>
        <button class="btn btn-primary grow" data-sim-join>${raw(ico('users'))} 참여 시연</button>
      </div>
      <p class="tiny mut">
        “참여 시연”은 두 번째 기기가 이 QR을 스캔한 상황을 이 탭 안에서 재현합니다 —
        새 신원을 만들고, 지문을 확인하고, 랩 키를 감싸 전달하는 전 과정이 실제 암호로 실행됩니다.
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
      step(`초대 확인 — ${parsed.labName} · 초대자 지문 ${parsed.fp}`);

      const joiner = await generateIdentity();
      const jfp = await fingerprint(joiner.pub);
      step(`새 기기 신원 생성 — ${jfp.short}`);

      await grantLabKey(joiner.pub);
      step('랩 키를 상대 공개키로 감싸 릴레이에 전달했습니다');
      step('상대 기기만 이 봉투를 열 수 있습니다 — 릴레이는 불가');
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
        <p class="sub-view">연결 대상과 랩 구성원</p>
      </div>

      <!-- mode -->
      <div class="card card-pad" style="margin-bottom:var(--s4)">
        <div class="between" style="margin-bottom:var(--s4)">
          <div class="sec-label" style="margin:0">동작 모드</div>
          ${connected
            ? html`<span class="chip chip-ok">${raw(ico('cloud'))} 실서버</span>`
            : html`<span class="chip chip-accent">${raw(ico('server'))} 데모</span>`}
        </div>

        <div class="status" style="margin-bottom:var(--s4)">
          <span class="led ${connected ? 'live' : ''}"></span>
          <span>${connected
            ? html`릴레이 <b>${state.relayCfg?.url || ''}</b> 에 연결됨`
            : html`릴레이와 원내 노드가 <b>이 탭 안에서</b> 시뮬레이션 중 — 네트워크 전송 없음`}</span>
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
            <div class="notice">${raw(ico('alert'))}
              <span>전환하면 이 기기의 요청이 실제 릴레이를 거칩니다. 릴레이는 내용을 볼 수 없지만
              <b>누가 언제 몇 바이트를 보냈는지</b>는 기록됩니다.</span></div>
          </div>`}
      </div>

      <!-- members -->
      <div class="card card-pad" style="margin-bottom:var(--s4)">
        <div class="between" style="margin-bottom:var(--s4)">
          <div class="sec-label" style="margin:0">랩 구성원</div>
          <span class="tiny mut">${state.members.length + 1}명</span>
        </div>

        <div class="status" style="margin-bottom:var(--s3)">
          <span class="led"></span>
          <span><b>이 기기</b> · ${state.identity?.fingerprint?.short || ''} · 관리자</span>
        </div>
        ${state.members.map((m) => html`
          <div class="status" style="margin-bottom:var(--s3)">
            <span class="led"></span>
            <span><b>${m.fp.short}</b> · 랩 키 전달됨 · ${relTime(m.at)}</span>
          </div>`)}

        <button class="btn btn-primary btn-block" data-invite style="margin-top:var(--s2)">
          ${raw(ico('users'))} QR로 초대하기
        </button>
      </div>

      <!-- appearance -->
      <div class="card card-pad">
        <div class="sec-label">화면</div>
        <div class="row" style="gap:6px">
          <button class="btn grow ${theme === 'dark' ? 'btn-primary' : ''}" data-theme="dark">어두운 화면</button>
          <button class="btn grow ${theme === 'light' ? 'btn-primary' : ''}" data-theme="light">밝은 화면</button>
        </div>
        <p class="tiny mut" style="margin-top:var(--s3)">
          기본값은 어두운 화면입니다 — 미팅은 대개 조명을 낮춘 방에서 열립니다.
        </p>
      </div>
    </div>`);
}
