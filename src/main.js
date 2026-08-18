/* Entry point. Boots the crypto identity, ensures a lab exists, mounts the shell. */
import { boot, state, createDemoLab } from './app.js';
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
  } catch (e) {
    console.error(e);
    fatal('초기화 중 오류가 발생했습니다. 브라우저 저장소를 지우고 다시 시도해 보세요.', e.message);
  }
})();
