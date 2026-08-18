/* App shell: side rail on desktop, bottom tabs on phones.
 * Routing is hash-based so every screen is linkable and the browser's
 * back button behaves the way people expect on mobile. */
import { state, bus } from '../app.js';
import { html, raw, qs } from './dom.js';
import { ico } from './icons.js';

import * as capture from './views/capture.js';
import * as review from './views/review.js';
import * as answers from './views/answers.js';
import * as kb from './views/kb.js';
import * as security from './views/security.js';
import * as settings from './views/settings.js';

/* Five tabs, all of them about the user's own work. Security is real but
 * it is not a destination — it lives as a detail page under 설정
 * (#/security still routes there for the people who want to audit). */
const TABS = [
  { id: 'capture',  label: '미팅',    icon: 'mic' },
  { id: 'review',   label: '정리',    icon: 'tag' },
  { id: 'answers',  label: '설명',    icon: 'sparkles' },
  { id: 'kb',       label: '지식',    icon: 'book' },
  { id: 'settings', label: '설정',    icon: 'server' },
];

/* Not in the tab bar, but still routable. */
const SUBPAGES = { security: { parent: 'settings', label: '개인정보 · 보안' } };

const VIEWS = { capture, review, answers, kb, security, settings };
let current = null;

export function mount(app) {
  app.innerHTML = html`
    <aside class="rail">
      <div class="brand">${raw(ico('logo'))}<span>Living Paper</span></div>
      <nav id="rail-nav"></nav>
      <div class="foot">
        <div class="status" id="conn"></div>
      </div>
    </aside>

    <div class="app-body">
      <header class="topbar">
        <div class="brand">${raw(ico('logo'))}<span>Living Paper</span></div>
        <div class="spacer"></div>
        <div id="conn-m"></div>
      </header>
      <main class="main" id="outlet"></main>
    </div>

    <nav class="tabbar" id="tabbar" aria-label="주요 화면"
         style="--tabs:${TABS.length}"></nav>`;

  paintNav();
  window.addEventListener('hashchange', route);
  bus.addEventListener('answer', paintNav);
  bus.addEventListener('job', paintNav);
  bus.addEventListener('connection', paintNav);
  bus.addEventListener('ingest', paintNav);
  route();
}

function pendingCount() {
  return [...state.jobs.values()].filter((j) => j.status === 'sent').length;
}
function unreadAnswers() {
  return state.answers.size;
}

function paintNav() {
  const id = routeId();
  const active = SUBPAGES[id]?.parent || id;   // subpages highlight their parent tab
  const badge = { review: pendingCount(), answers: unreadAnswers() };

  const rail = qs('#rail-nav');
  if (rail) {
    rail.innerHTML = TABS.map((t) => html`
      <button data-go="${t.id}" ${t.id === active ? raw('aria-current="page"') : ''}>
        ${raw(ico(t.icon))}<span>${t.label}</span>
        ${badge[t.id] ? raw('<span class="dot"></span>') : ''}
      </button>`).join('');
  }

  const bar = qs('#tabbar');
  if (bar) {
    bar.innerHTML = TABS.map((t) => html`
      <button data-go="${t.id}" ${t.id === active ? raw('aria-current="page"') : ''}>
        ${raw(ico(t.icon))}<span>${t.label}</span>
        ${badge[t.id] ? raw('<span class="dot"></span>') : ''}
      </button>`).join('');
  }

  for (const el of document.querySelectorAll('[data-go]')) {
    el.onclick = () => go(el.dataset.go);
  }

  // Quiet connection status: which mode we're in, without nagging about
  // verification state on every screen — that detail lives in 설정.
  const conn = html`
    <span class="led ${state.mode === 'demo' ? '' : 'live'}"></span>
    <span>${state.mode === 'demo' ? '데모 모드' : '랩 노드 연결됨'}</span>`;
  const c1 = qs('#conn'); if (c1) c1.innerHTML = conn;
  const c2 = qs('#conn-m');
  if (c2) {
    c2.innerHTML = html`<span class="chip">
      ${raw(ico('server'))}${state.mode === 'demo' ? '데모' : '연결됨'}</span>`;
  }
}

const routeId = () => {
  const id = (location.hash || '').replace(/^#\/?/, '').split('/')[0];
  return VIEWS[id] ? id : 'capture';
};

export function go(id) {
  if (routeId() === id) { route(); return; }
  location.hash = `#/${id}`;
}

function route() {
  const id = routeId();
  const outlet = qs('#outlet');
  if (!outlet) return;
  if (current && VIEWS[current]?.teardown) VIEWS[current].teardown();
  current = id;
  outlet.scrollTop = 0;
  window.scrollTo({ top: 0 });
  VIEWS[id].render(outlet, go);
  paintNav();
  const label = TABS.find((t) => t.id === id)?.label || SUBPAGES[id]?.label || '';
  document.title = `${label} · Living Paper`;
}
