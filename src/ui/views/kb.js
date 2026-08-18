/* 지식베이스 — the lab's vocabulary, documents, and the ingestion path.
 *
 * Answers are only as good as this list, so the screen shows exactly what
 * the model is allowed to know — and lets you add to it. Parsing and
 * chunking happen on this device; only sealed chunks reach the node.
 */
import { state, bus, ingestDocument } from '../../app.js';
import { GLOSSARY, DOCS, DEMO_LAB } from '../../data/seed.js';
import { extractText, chunkText, guessKind, fmtSize, SUPPORTED } from '../../data/ingest.js';
import { html, raw, scope, esc, toast, openSheet } from '../dom.js';
import { ico } from '../icons.js';

let query = '';
const S = scope();

export function render(root) {
  S.clear();
  draw(root);
  S.listen(bus, 'ingest', () => draw(root));

  S.on(root, 'input', '#kbq', (e, el) => { query = el.value; draw(root, true); });
  S.on(root, 'click', '[data-add]', () => openIngest(root));
}

export function teardown() { S.clear(); }

/* ---------- ingestion sheet ---------- */
function openIngest(root) {
  const body = openSheet('문서 추가', html`
    <div class="stack">
      <p class="tiny" style="color:var(--text-3);line-height:1.7;margin:0">
        랩 SOP, 실험노트, 프로토콜을 추가할수록 설명이 <b style="color:var(--text)">우리 랩 기준으로</b>
        정확해집니다. 추가한 문서는 바로 근거로 인용됩니다.
      </p>

      <label class="drop" id="drop">
        ${raw(ico('doc'))}
        <b>파일을 끌어다 놓거나 눌러서 선택</b>
        <span>txt · md · csv · json · pdf (텍스트 기반)</span>
        <input type="file" id="file" accept="${esc(SUPPORTED)}" multiple hidden>
      </label>

      <div id="stage"></div>

      <p class="tiny mut" style="margin:0">문서는 우리 랩 밖으로 나가지 않습니다.</p>
    </div>`);

  const drop = body.querySelector('#drop');
  const input = body.querySelector('#file');
  const stage = body.querySelector('#stage');

  const stop = (e) => { e.preventDefault(); e.stopPropagation(); };
  ['dragenter', 'dragover'].forEach((t) =>
    drop.addEventListener(t, (e) => { stop(e); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((t) =>
    drop.addEventListener(t, (e) => { stop(e); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => handle([...e.dataTransfer.files], stage, root));
  input.addEventListener('change', () => handle([...input.files], stage, root));
}

async function handle(files, stage, root) {
  if (!files.length) return;
  for (const file of files) {
    const id = 'f' + Math.random().toString(36).slice(2, 8);
    stage.insertAdjacentHTML('beforeend', String(html`
      <div class="file-row" id="${id}">
        <span class="fn">${file.name}</span>
        <span class="fm">${fmtSize(file.size)}</span>
      </div>
      <div class="bar" id="${id}-b"><i style="width:8%"></i></div>`));
    const rowEl = stage.querySelector('#' + id);
    const barEl = stage.querySelector('#' + id + '-b i');
    const setBar = (pct) => { if (barEl) barEl.style.width = pct + '%'; };

    try {
      setBar(25);
      const { text, note } = await extractText(file);
      if (note) {
        rowEl.insertAdjacentHTML('afterend', String(html`
          <div class="notice notice-warn" style="margin:6px 0 10px">
            ${raw(ico('alert'))}<span>${note}</span></div>`));
        setBar(100);
        barEl.style.background = 'var(--amber)';
        continue;
      }
      setBar(55);
      const chunks = chunkText(text, { title: file.name.replace(/\.[^.]+$/, '') });
      if (!chunks.length) throw new Error('내용이 너무 짧습니다');

      setBar(75);
      await ingestDocument({
        title: file.name.replace(/\.[^.]+$/, ''),
        kind: guessKind(file.name),
        chunks,
        bytes: file.size,
      });
      setBar(100);
      rowEl.insertAdjacentHTML('beforeend', String(html`
        <span class="chip chip-ok">${raw(ico('check'))} 추가됨</span>`));
      toast(`${file.name} 을(를) 지식베이스에 추가했습니다`, { icon: ico('check') });
    } catch (e) {
      setBar(100);
      barEl.style.background = 'var(--coral)';
      rowEl.insertAdjacentHTML('beforeend', String(html`<span class="chip chip-bad">${e.message}</span>`));
    }
  }
  draw(root);
}

/* ---------- main view ---------- */
function draw(root, keepFocus = false) {
  const q = query.trim().toLowerCase();
  const terms = GLOSSARY.filter((g) => !q
    || [g.term, ...g.aliases, g.general, g.lab].join(' ').toLowerCase().includes(q));
  const docs = DOCS.filter((d) => !q || `${d.title} ${d.excerpt} ${d.kind}`.toLowerCase().includes(q));
  const mine = state.ingested.filter((d) => !q || d.title.toLowerCase().includes(q));

  root.innerHTML = String(html`
    <div class="view">
      <div class="view-head">
        <div class="between">
          <div>
            <h1 class="h-view">지식베이스</h1>
            <p class="sub-view">${state.lab?.name || DEMO_LAB.name} · 용어 ${GLOSSARY.length} ·
              문서 ${DOCS.length + state.ingested.length}</p>
          </div>
          <button class="btn btn-primary" data-add>${raw(ico('plus'))} 문서 추가</button>
        </div>
      </div>

      <div style="position:relative;margin-bottom:var(--s4)">
        <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);
                     width:15px;height:15px;color:var(--text-4)">${raw(ico('search'))}</span>
        <input id="kbq" class="field" style="padding-left:32px" value="${esc(query)}"
               placeholder="${esc('용어, 문서, 내용 검색')}" autocomplete="off">
      </div>

      ${mine.length ? html`
        <div class="sec-label">내가 추가한 문서</div>
        <div class="card" style="margin-bottom:var(--s6)">
          ${mine.map((d) => html`
            <div class="kb-item">
              <div class="between">
                <div class="grow">
                  <div class="t">${d.title}</div>
                  <div class="g">${d.kind} · ${fmtSize(d.bytes)}</div>
                </div>
                ${d.status === 'indexed'
                  ? html`<span class="chip chip-ok">${raw(ico('check'))} 검색 가능</span>`
                  : html`<span class="chip">${raw(ico('refresh'))} 추가 중</span>`}
              </div>
            </div>`)}
        </div>` : ''}

      ${terms.length ? html`
        <div class="sec-label">랩 용어</div>
        <div class="card" style="margin-bottom:var(--s6)">
          ${terms.map((g) => html`
            <div class="kb-item">
              <div class="t">${g.term}</div>
              <div class="g">${g.general}</div>
              <div class="l">${g.lab}</div>
              <div class="kb-tags">
                ${(g.tags || []).map((t) => html`<span class="chip">${t}</span>`)}
                <span class="chip chip-accent">${raw(ico('doc'))} 근거 ${g.docs.length}</span>
              </div>
            </div>`)}
        </div>` : ''}

      ${docs.length ? html`
        <div class="sec-label">랩 문서</div>
        <div class="card">
          ${docs.map((d) => html`
            <div class="kb-item">
              <div class="row" style="gap:8px;align-items:flex-start">
                <span class="chip chip-accent">${d.kind}</span>
                <div class="grow">
                  <div class="t">${d.title}</div>
                  <div class="g">${d.excerpt}</div>
                  <div class="tiny mut mono" style="margin-top:6px">${d.updated} 갱신</div>
                </div>
              </div>
            </div>`)}
        </div>` : ''}

      ${!terms.length && !docs.length && !mine.length ? html`
        <div class="card card-pad empty">
          ${raw(ico('search'))}
          <b>검색 결과가 없습니다</b>
          <span>“${query}” 관련 항목이 이 랩에 없습니다. 없는 내용은 지어내지 않고 “근거 없음”으로 답합니다.</span>
        </div>` : ''}
    </div>`);

  if (keepFocus) {
    const el = root.querySelector('#kbq');
    el?.focus();
    el?.setSelectionRange(el.value.length, el.value.length);
  }
}
