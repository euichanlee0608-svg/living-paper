/* Minimal view helpers. No framework: the app is small enough that a
 * tagged template plus event delegation is less code than a runtime, and
 * it keeps the security-critical files free of third-party JS. */

/* Values that are already safe markup. `html` returns one of these, so a
 * template composed of other templates nests without double-escaping —
 * while every plain interpolation still gets escaped by default. */
class Html {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}

export const raw = (s) => new Html(String(s));
export const isHtml = (v) => v instanceof Html;

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function fmt(v) {
  if (v == null || v === false) return '';
  if (v instanceof Html) return v.s;
  if (Array.isArray(v)) return v.map(fmt).join('');
  return esc(v);
}

/** Escapes every interpolation unless it is itself an `html` result or raw(). */
export const html = (strings, ...vals) =>
  new Html(strings.reduce((out, s, i) => out + s + (i < vals.length ? fmt(vals[i]) : ''), ''));

export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Delegated listener: survives re-renders, so views can replace innerHTML
 *  freely. Returns an unbind — a view that re-renders must drop its old
 *  listeners or every click fires once per render. */
export function on(root, event, selector, handler) {
  const fn = (e) => {
    const t = e.target.closest(selector);
    if (t && root.contains(t)) handler(e, t);
  };
  root.addEventListener(event, fn);
  return () => root.removeEventListener(event, fn);
}

/** A view's listener scope. Call clear() at the top of render() and from
 *  teardown(), and nothing can accumulate across navigations. */
export function scope() {
  const offs = [];
  return {
    on(root, event, selector, handler) {
      offs.push(on(root, event, selector, handler));
    },
    listen(target, event, handler) {
      target.addEventListener(event, handler);
      offs.push(() => target.removeEventListener(event, handler));
    },
    clear() { while (offs.length) offs.pop()(); },
  };
}

export function toast(msg, { icon = null, ms = 2600 } = {}) {
  let host = qs('.toasts');
  if (!host) {
    host = document.createElement('div');
    host.className = 'toasts';
    document.body.appendChild(host);
  }
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = String(html`${icon ? raw(icon) : ''}<span>${msg}</span>`);
  host.appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 260);
  }, ms);
}

/* ---------- sheet (bottom sheet on phones, centred dialog on desktop) ---------- */
let sheetEls = null;

function ensureSheet() {
  if (sheetEls) return sheetEls;
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.innerHTML = `
    <div class="sheet-head">
      <h3 id="sheet-title"></h3>
      <button class="icon-btn" data-sheet-close aria-label="닫기">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
          <path d="M5 5l10 10M15 5L5 15"/></svg>
      </button>
    </div>
    <div class="sheet-body"></div>`;
  sheet.setAttribute('aria-labelledby', 'sheet-title');
  document.body.append(scrim, sheet);
  scrim.addEventListener('click', closeSheet);
  sheet.addEventListener('click', (e) => { if (e.target.closest('[data-sheet-close]')) closeSheet(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });
  sheetEls = { scrim, sheet, body: sheet.querySelector('.sheet-body'), title: sheet.querySelector('h3') };
  return sheetEls;
}

let lastFocus = null;

export function openSheet(title, bodyHTML, onMount) {
  const { scrim, sheet, body, title: t } = ensureSheet();
  lastFocus = document.activeElement;
  t.textContent = title;
  body.innerHTML = String(bodyHTML);
  body.scrollTop = 0;
  scrim.classList.add('on');
  sheet.classList.add('on');
  onMount?.(body);
  sheet.querySelector('[data-sheet-close]')?.focus();
  return body;
}

export function closeSheet() {
  if (!sheetEls) return;
  sheetEls.scrim.classList.remove('on');
  sheetEls.sheet.classList.remove('on');
  lastFocus?.focus?.();
  lastFocus = null;
}

export function copy(text, label = '복사했습니다') {
  const done = () => toast(label);
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => fallback(text, done));
  } else fallback(text, done);
}

function fallback(text, done) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;opacity:0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); done(); } catch { toast('복사에 실패했습니다'); }
  ta.remove();
}

export function buzz(ms = 12) {
  try { navigator.vibrate?.(ms); } catch { /* unsupported: silent */ }
}

export const relTime = (ts) => {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return '방금';
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  return new Date(ts).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' });
};
