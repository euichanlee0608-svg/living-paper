/* 지식베이스 — the lab's own vocabulary and documents.
 *
 * On a real install this lives encrypted on the on-prem node and this
 * screen is a read-through view of it. The point of showing it at all is
 * that the answers are only as good as this list — so the user can see
 * exactly what the model was allowed to know, and what is missing.
 */
import { GLOSSARY, DOCS, DEMO_LAB } from '../../data/seed.js';
import { state } from '../../app.js';
import { html, raw, scope, esc, toast } from '../dom.js';
import { ico } from '../icons.js';

let query = '';
const S = scope();

export function render(root) {
  S.clear();
  draw(root);
  S.on(root, 'input', '#kbq', (e, el) => { query = el.value; draw(root, true); });
  S.on(root, 'click', '[data-add]', () =>
    toast('문서 수집은 원내 노드에서 실행됩니다 (다음 배포)', { icon: ico('server') }));
}

export function teardown() { S.clear(); }

function draw(root, keepFocus = false) {
  const q = query.trim().toLowerCase();
  const terms = GLOSSARY.filter((g) => !q
    || [g.term, ...g.aliases, g.general, g.lab].join(' ').toLowerCase().includes(q));
  const docs = DOCS.filter((d) => !q
    || `${d.title} ${d.excerpt} ${d.kind}`.toLowerCase().includes(q));

  root.innerHTML = html`
    <div class="view">
      <div class="view-head">
        <h1 class="h-view">지식베이스</h1>
        <p class="sub-view">${state.lab?.name || DEMO_LAB.name} · 용어 ${GLOSSARY.length}개 · 문서 ${DOCS.length}개</p>
      </div>

      <div class="row" style="margin-bottom:var(--sp-4);gap:8px">
        <div class="grow" style="position:relative">
          <span style="position:absolute;left:13px;top:50%;transform:translateY(-50%);
                       width:17px;height:17px;color:var(--mut)">${raw(ico('search'))}</span>
          <input id="kbq" class="field" style="padding-left:38px" value="${esc(query)}"
                 placeholder="${esc('용어, 문서, 내용 검색')}" autocomplete="off">
        </div>
        <button class="btn btn-ghost" data-add title="문서 추가">${raw(ico('plus'))}</button>
      </div>

      <div class="status" style="margin-bottom:var(--sp-4)">
        ${raw(ico('server'))}
        <span>이 목록은 <b>원내 노드에 암호화되어</b> 저장됩니다. 답변 품질은 여기 담긴 내용까지가 한계입니다.</span>
      </div>

      ${terms.length ? html`
        <div class="label" style="margin:var(--sp-5) 0 10px">랩 용어</div>
        <div class="card">
          ${terms.map((g) => html`
            <div class="kb-item">
              <div class="t">${g.term}</div>
              <div class="g">${g.general}</div>
              <div class="l">${g.lab}</div>
              <div class="kb-tags">
                ${(g.tags || []).map((t) => html`<span class="chip">${t}</span>`)}
                <span class="chip chip-accent">${raw(ico('doc'))} 근거 ${g.docs.length}건</span>
              </div>
            </div>`)}
        </div>` : ''}

      ${docs.length ? html`
        <div class="label" style="margin:var(--sp-5) 0 10px">문서</div>
        <div class="card">
          ${docs.map((d) => html`
            <div class="kb-item">
              <div class="row" style="gap:9px;align-items:flex-start">
                <span class="chip chip-accent">${d.kind}</span>
                <div class="grow">
                  <div class="t">${d.title}</div>
                  <div class="g">${d.excerpt}</div>
                  <div class="tiny mut mono" style="margin-top:7px">${d.updated} 갱신</div>
                </div>
              </div>
            </div>`)}
        </div>` : ''}

      ${!terms.length && !docs.length ? html`
        <div class="card card-pad empty">
          ${raw(ico('search'))}
          <b>검색 결과가 없습니다</b>
          이 랩의 지식베이스에 “${query}” 관련 항목이 없습니다.
          없는 내용은 지어내지 않고 “근거 없음”으로 답합니다.
        </div>` : ''}
    </div>`;

  if (keepFocus) {
    const el = root.querySelector('#kbq');
    el?.focus();
    el?.setSelectionRange(el.value.length, el.value.length);
  }
}
