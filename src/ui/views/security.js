/* 개인정보 · 보안 — the detail page behind 설정.
 *
 * Not a tab anymore: day-to-day use never needs this screen, so it stays
 * out of the way. But everything on it is live state, not marketing copy —
 * fingerprints computed from the real keys in this browser, and the relay
 * log is the actual audit trail of what the relay stored this session.
 * A hospital IT reviewer can still verify every claim here.
 */
import { state, verifyNode, resetEverything, reissueRecovery, fmtBytes, bus } from '../../app.js';
import { safetyNumber } from '../../crypto/fingerprint.js';
import { html, raw, scope, toast, copy, openSheet, closeSheet } from '../dom.js';
import { ico } from '../icons.js';
import { relayPeek } from '../components/relaypeek.js';

const S = scope();
let nav = () => {};

export function render(root, go) {
  S.clear();
  nav = go || nav;
  draw(root);
  S.listen(window, 'lp:relay-log', () => draw(root));
  S.listen(bus, 'connection', () => draw(root));

  S.on(root, 'click', '[data-back]', () => nav('settings'));
  S.on(root, 'click', '[data-peek]', (e, el) => relayPeek(el.dataset.peek));

  S.on(root, 'click', '[data-verify]', async () => {
    const sn = await safetyNumber(state.identity.pub, state.node.pub);
    openSheet('노드 대면 확인', html`
      <div class="stack">
        <p class="tiny mut" style="line-height:1.7">
          릴레이가 공개키를 바꿔치기하면 모든 내용을 읽을 수 있습니다. 이를 막는 방법은
          <b style="color:var(--text)">릴레이를 거치지 않는 경로</b>로 아래 숫자를 맞춰보는 것뿐입니다.
          서버 앞에 가서, 또는 전화로 확인하세요.
        </p>
        <div class="fp">
          <div class="fp-emoji">${sn.emoji.join(' ')}</div>
          <div class="fp-hex">${sn.digits}</div>
        </div>
        <p class="tiny mut">노드 화면에 뜬 숫자와 같습니까?</p>
        <button class="btn btn-primary btn-block" data-verify-yes>${raw(ico('check'))} 같습니다 · 확인 완료</button>
        <button class="btn btn-block" data-sheet-close>다릅니다 / 나중에</button>
      </div>`);
  });

  S.on(document.body, 'click', '[data-verify-yes]', async () => {
    await verifyNode();
    closeSheet();
    toast('노드를 확인했습니다', { icon: ico('check') });
    draw(root);
  });

  S.on(root, 'click', '[data-recovery]', async () => {
    // The code exists only in memory, from the moment it was generated. After a
    // reload there is nothing to show, so the only honest option is a new one.
    let code = state.recoveryCode, fresh = false;
    if (!code) {
      try { code = await reissueRecovery(); fresh = true; }
      catch (e) { return toast(e.message, { icon: ico('alert') }); }
    }
    openSheet('복구 키트', html`
      <div class="stack">
        <div class="notice">${raw(ico('alert'))}
          <span>이 코드는 <b>다시 볼 수 없습니다</b>. 모든 기기를 잃으면 이 코드만이 랩 데이터를 되살립니다.
          클라우드에는 복구 수단이 없습니다 — 그것이 이 구조의 대가입니다.</span></div>
        ${fresh ? html`<div class="notice" style="background:var(--surface-2);border-color:var(--line);color:var(--text-2)">
          ${raw(ico('refresh'))}<span>새 코드를 발급했습니다. <b>이전 코드는 더 이상 동작하지 않습니다.</b></span></div>` : ''}
        <div class="recovery">${code}</div>
        <button class="btn btn-primary btn-block" data-copy-code="${code}">${raw(ico('copy'))} 복사</button>
        <button class="btn btn-block" onclick="window.print()">인쇄해서 보관</button>
      </div>`);
  });

  S.on(document.body, 'click', '[data-copy-code]', (e, el) => copy(el.dataset.copyCode, '복구 코드를 복사했습니다'));
  S.on(root, 'click', '[data-copy-fp]', (e, el) => copy(el.dataset.copyFp, '지문을 복사했습니다'));

  S.on(root, 'click', '[data-wipe]', () => {
    openSheet('이 기기에서 모두 삭제', html`
      <div class="stack">
        <div class="notice" style="background:var(--coral-dim);border-color:var(--coral-line);color:var(--coral)">
          ${raw(ico('alert'))}
          <span>기기 키, 미팅 기록, 받은 설명이 모두 지워집니다. 되돌릴 수 없습니다.</span>
        </div>
        <button class="btn btn-danger btn-block" data-wipe-yes>${raw(ico('trash'))} 전부 삭제</button>
        <button class="btn btn-block" data-sheet-close>취소</button>
      </div>`);
  });
  S.on(document.body, 'click', '[data-wipe-yes]', () => resetEverything());
}

export function teardown() { S.clear(); }

function draw(root) {
  const me = state.identity;
  const node = state.node;
  const log = state.relay?.log || [];
  const lastJob = [...state.jobs.values()]
    .filter((j) => j.relaySees)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];

  root.innerHTML = html`
    <div class="view">
      <button class="btn btn-quiet btn-sm" data-back
              style="margin-bottom:var(--s3);margin-left:-6px">
        <span style="display:inline-flex;transform:rotate(180deg)">${raw(ico('chevron'))}</span> 설정</button>
      <div class="view-head">
        <h1 class="h-view">개인정보 · 보안</h1>
        <p class="sub-view">지금 이 브라우저의 실제 키와 실제 통신 기록입니다.</p>
      </div>

      <!-- data path -->
      <div class="card card-pad">
        <div class="sec-label">데이터가 지나가는 길</div>
        <div class="flow">
          <div class="flow-node">
            <div class="n">${raw(ico('phone'))} 내 기기</div>
            <div class="d">여기서 봉인<br>개인키 반출 불가</div>
          </div>
          <div class="flow-arrow">${raw(ico('arrowRight'))}<span>암호문</span></div>
          <div class="flow-node blind">
            <div class="n">${raw(ico('cloud'))} 클라우드 릴레이</div>
            <div class="d">전달·인증만<br><b style="color:var(--iris)">내용 열람 불가</b></div>
          </div>
          <div class="flow-arrow">${raw(ico('arrowRight'))}<span>암호문</span></div>
          <div class="flow-node">
            <div class="n">${raw(ico('server'))} 원내 노드</div>
            <div class="d">복호화 · LLM 연산<br>병원 네트워크 안</div>
          </div>
        </div>
        <p class="tiny mut" style="line-height:1.7">
          릴레이가 알 수 있는 것: <b style="color:var(--text-2)">누가 언제 몇 바이트를 보냈는지</b>.
          알 수 없는 것: 그 안의 모든 내용. 메타데이터까지 감추지는 못한다는 점을 숨기지 않습니다.
        </p>
      </div>

      <!-- keys -->
      <div class="card card-pad" style="margin-top:var(--s4)">
        <div class="between" style="margin-bottom:var(--s4)">
          <div class="sec-label" style="margin:0">내 기기 키</div>
          <span class="chip chip-ok">${raw(ico('lock'))} 반출 불가</span>
        </div>
        <div class="fp">
          <div class="fp-emoji">${me?.fingerprint?.emoji.join(' ') || ''}</div>
          <div class="fp-hex">${me?.fingerprint?.hex || ''}</div>
        </div>
        <div class="row wrap" style="margin-top:11px;gap:7px">
          <span class="chip">ECDH P-256 · 수신</span>
          <span class="chip">ECDSA P-256 · 서명</span>
          <button class="btn btn-sm" data-copy-fp="${me?.fingerprint?.hex || ''}">
            ${raw(ico('copy'))} 지문 복사</button>
        </div>
        <p class="tiny mut" style="margin-top:11px;line-height:1.7">
          개인키는 <code class="mono">non-extractable</code> 로 생성되어 IndexedDB에 있습니다.
          이 사이트의 코드조차 키 값을 읽어낼 수 없습니다.
        </p>
      </div>

      <!-- node -->
      <div class="card card-pad" style="margin-top:var(--s4)">
        <div class="between" style="margin-bottom:var(--s4)">
          <div class="sec-label" style="margin:0">랩 노드</div>
          ${node?.verified
            ? html`<span class="chip chip-ok">${raw(ico('check'))} 대면 확인됨</span>`
            : html`<span class="chip chip-warn">${raw(ico('alert'))} 미확인</span>`}
        </div>
        ${node ? html`
          <div class="status" style="margin-bottom:var(--s4)">
            <span class="led ${node.verified ? '' : 'warn'}"></span>
            <span><b>${node.label}</b> · ${state.mode === 'demo' ? '브라우저 내 시뮬레이션' : '연결됨'}</span>
          </div>
          <div class="fp">
            <div class="fp-emoji">${node.fingerprint.emoji.join(' ')}</div>
            <div class="fp-hex">${node.fingerprint.hex}</div>
          </div>
          ${!node.verified ? html`
            <button class="btn btn-primary btn-block" data-verify style="margin-top:var(--s4)">
              ${raw(ico('shield'))} 대면으로 확인하기
            </button>
            <p class="tiny mut" style="margin-top:9px;line-height:1.7">
              확인 전까지는 릴레이가 키를 바꿔치기했을 가능성을 배제할 수 없습니다.
            </p>` : ''}`
        : html`<p class="tiny mut">연결된 노드가 없습니다.</p>`}
      </div>

      <!-- relay log -->
      <div class="card card-pad" style="margin-top:var(--s4)">
        <div class="between" style="margin-bottom:var(--s3)">
          <div class="sec-label" style="margin:0">릴레이 감사 로그</div>
          <span class="tiny mut">${log.length}건</span>
        </div>
        <p class="tiny mut" style="margin-bottom:var(--s4);line-height:1.7">
          이 세션에서 릴레이가 실제로 저장한 전부입니다. 압수수색이 들어와도 나오는 것이 이것뿐이어야 합니다.
        </p>
        ${log.length ? html`
          <div>
            ${log.slice(0, 12).map((l) => html`
              <div class="logline">
                <span class="op">${l.op}</span>
                <span class="rest">${l.detail?.aad
                  ? `${l.detail.aad.type} · ${l.detail.aad.jobId} · ${fmtBytes(l.bytes)} · ct=${String(l.detail.ct || '').slice(0, 28)}…`
                  : JSON.stringify(l.detail).slice(0, 90)}</span>
              </div>`)}
          </div>` : html`<p class="tiny mut">아직 기록이 없습니다.</p>`}
        ${lastJob ? html`
          <button class="btn btn-block" data-peek="${lastJob.jobId}" style="margin-top:var(--s4)">
            ${raw(ico('eye'))} 릴레이가 본 것 직접 열어보기
          </button>` : ''}
      </div>

      <!-- recovery + wipe -->
      <div class="card card-pad" style="margin-top:var(--s4)">
        <div class="sec-label" style="margin-bottom:var(--s3)">복구와 삭제</div>
        <div class="stack">
          <button class="btn btn-block" data-recovery>${raw(ico('key'))} 복구 키트 보기</button>
          <button class="btn btn-danger btn-block" data-wipe>${raw(ico('trash'))} 이 기기에서 모두 삭제</button>
        </div>
      </div>

      <p class="tiny mut" style="margin-top:var(--s5);line-height:1.8;text-align:center">
        상세한 위협 모델과 한계는 저장소의
        <a href="https://github.com/euichanlee0608-svg/living-paper/blob/main/docs/THREAT_MODEL.md" target="_blank" rel="noopener">THREAT_MODEL.md</a>
        에 적어 두었습니다.
      </p>
    </div>`;
}
