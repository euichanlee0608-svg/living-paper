/* Entry point. Boots the crypto identity, ensures a lab exists, mounts the shell. */
import { boot, state, bus, createDemoLab } from './app.js';
import { mount } from './ui/shell.js';
import { toast } from './ui/dom.js';

const app = document.getElementById('app');

function fatal(msg, detail) {
  app.innerHTML = `
    <div style="max-width:520px;margin:18vh auto;padding:0 24px;text-align:center">
      <h1 style="font-size:20px;margin-bottom:10px">실행할 수 없습니다</h1>
      <p style="color:#64748B;font-size:14.5px;line-height:1.7">${msg}</p>
      ${detail ? `<pre style="margin-top:16px;font-size:11.5px;color:#94A3B8;white-space:pre-wrap;text-align:left">${detail}</pre>` : ''}
    </div>`;
}

// Dark unless the user chose otherwise: meetings happen in dim rooms.
let savedTheme = null;
try { savedTheme = localStorage.getItem('lp-theme'); } catch { /* storage blocked: default */ }
document.documentElement.setAttribute('data-theme', savedTheme || 'dark');

(async () => {
  if (!window.isSecureContext || !crypto?.subtle) {
    return fatal('이 앱은 WebCrypto가 필요합니다. HTTPS 또는 localhost에서 열어 주세요.');
  }
  try {
    await boot();
    if (!state.lab) await createDemoLab();
    mount(app);
    if (state.mode === 'demo') {
      setTimeout(() => toast('데모 모드 · 랩 노드가 이 탭 안에서 돕니다'), 900);
    }
    if (state.interrupted) {
      setTimeout(() => toast(`새로고침으로 끊긴 요청 ${state.interrupted}개를 되돌렸습니다. 정리 탭에서 다시 보내 주세요`,
        { ms: 5200 }), 1600);
    }
    bus.addEventListener('job-failed', () =>
      toast('답변을 열지 못했습니다. 정리 탭에서 다시 요청할 수 있습니다', { ms: 4200 }));
  } catch (e) {
    console.error(e);
    fatal('초기화 중 오류가 발생했습니다. 브라우저 저장소를 지우고 다시 시도해 보세요.', e.message);
  }
})();
