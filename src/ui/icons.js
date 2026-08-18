/* Inline icon set — 24×24, 1.7 stroke, currentColor. Inlined rather than
 * loaded from a sprite or CDN so the app makes zero network requests. */
const s = (d, extra = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
        stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}${extra}</svg>`;

export const icons = {
  logo: `<svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <rect x="1.5" y="1.5" width="29" height="29" rx="8" fill="#0F172A"/>
    <path d="M9 22V10" stroke="#38BDF8" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M9 22h7.5" stroke="#38BDF8" stroke-width="2.4" stroke-linecap="round"/>
    <circle cx="21" cy="12.5" r="3.2" stroke="#7DD3FC" stroke-width="2"/>
    <path d="M21 17.2v4.6" stroke="#7DD3FC" stroke-width="2" stroke-linecap="round"/>
  </svg>`,

  mic: s('<path d="M12 3.5a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0v-5a3 3 0 0 1 3-3z"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0"/><path d="M12 17.5V21"/>'),
  hand: s('<path d="M12 4.5v7"/><path d="M9 6.5v5"/><path d="M15 7.5v4"/><path d="M6 10v3.5a6 6 0 0 0 6 6h.6a6 6 0 0 0 5.4-5.97V10"/>'),
  tag: s('<path d="M3.5 11.2V4.5A1 1 0 0 1 4.5 3.5h6.7a1 1 0 0 1 .7.3l8.3 8.3a1 1 0 0 1 0 1.4l-6.7 6.7a1 1 0 0 1-1.4 0l-8.3-8.3a1 1 0 0 1-.3-.7z"/><circle cx="8" cy="8" r="1.3" fill="currentColor" stroke="none"/>'),
  sparkles: s('<path d="M12 3.5 13.6 8 18 9.6 13.6 11.2 12 15.7 10.4 11.2 6 9.6 10.4 8z"/><path d="M18.5 15.5l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7z"/>'),
  book: s('<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10a2.5 2.5 0 0 1 2 1 2.5 2.5 0 0 1 2-1h4.5A1.5 1.5 0 0 1 20 5.5v11a1.5 1.5 0 0 1-1.5 1.5H14a2.5 2.5 0 0 0-2 1 2.5 2.5 0 0 0-2-1H5.5A1.5 1.5 0 0 1 4 16.5z"/><path d="M12 5v14"/>'),
  shield: s('<path d="M12 3.2 19 6v5.4c0 4.2-2.9 7.6-7 9.4-4.1-1.8-7-5.2-7-9.4V6z"/><path d="M9.3 12.2l1.9 1.9 3.6-3.7"/>'),
  lock: s('<rect x="4.5" y="10.5" width="15" height="9.5" rx="2.2"/><path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7"/>'),
  key: s('<circle cx="8" cy="12" r="3.6"/><path d="M11.6 12H21"/><path d="M17.5 12v3.2"/><path d="M20 12v2.2"/>'),
  server: s('<rect x="3.5" y="4.5" width="17" height="6" rx="1.8"/><rect x="3.5" y="13.5" width="17" height="6" rx="1.8"/><path d="M7 7.5h.01M7 16.5h.01"/>'),
  cloud: s('<path d="M7.2 18.5A4.2 4.2 0 0 1 7 10.1a5.6 5.6 0 0 1 10.8-1.3A3.9 3.9 0 0 1 17.6 18.5z"/>'),
  phone: s('<rect x="6.5" y="2.8" width="11" height="18.4" rx="2.4"/><path d="M10.6 18.4h2.8"/>'),
  arrowRight: s('<path d="M4.5 12h14"/><path d="M13.2 6.5 18.7 12l-5.5 5.5"/>'),
  arrowDown: s('<path d="M12 4.5v14"/><path d="M6.5 12.8 12 18.3l5.5-5.5"/>'),
  check: s('<path d="M5 12.5 9.5 17 19 7"/>'),
  x: s('<path d="M6 6l12 12M18 6L6 18"/>'),
  plus: s('<path d="M12 5.5v13M5.5 12h13"/>'),
  clock: s('<circle cx="12" cy="12" r="8.3"/><path d="M12 7.5V12l3 1.8"/>'),
  eye: s('<path d="M2.6 12S6 5.8 12 5.8 21.4 12 21.4 12 18 18.2 12 18.2 2.6 12 2.6 12z"/><circle cx="12" cy="12" r="2.7"/>'),
  alert: s('<path d="M12 4.3 21 19.7H3z"/><path d="M12 10v3.6"/><path d="M12 16.6h.01"/>'),
  trash: s('<path d="M4.5 6.8h15"/><path d="M9.2 6.8V5.2a1.4 1.4 0 0 1 1.4-1.4h2.8a1.4 1.4 0 0 1 1.4 1.4v1.6"/><path d="M6.5 6.8 7.4 19a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4l.9-12.2"/>'),
  copy: s('<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 5.5a2 2 0 0 0-2-2h-7a3 3 0 0 0-3 3v7a2 2 0 0 0 2 2"/>'),
  search: s('<circle cx="10.8" cy="10.8" r="6.3"/><path d="M15.4 15.4 20 20"/>'),
  send: s('<path d="M20.5 3.5 11 13"/><path d="M20.5 3.5 14.4 20.5l-3.4-7.5-7.5-3.4z"/>'),
  refresh: s('<path d="M20 11.5a8 8 0 1 0-.7 4.5"/><path d="M20 4.8v6.7h-6.7"/>'),
  chevron: s('<path d="M9 5.5 15.5 12 9 18.5"/>'),
  home: s('<path d="M4 10.4 12 4l8 6.4V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z"/><path d="M9.5 20.5v-6h5v6"/>'),
  users: s('<circle cx="9.2" cy="8.4" r="3.4"/><path d="M3.2 19.4a6 6 0 0 1 12 0"/><path d="M16.5 5.3a3.4 3.4 0 0 1 0 6.2"/><path d="M18 14.4a6 6 0 0 1 2.8 5"/>'),
  doc: s('<path d="M13.5 3.5H7a1.6 1.6 0 0 0-1.6 1.6v13.8A1.6 1.6 0 0 0 7 20.5h10a1.6 1.6 0 0 0 1.6-1.6V8.6z"/><path d="M13.5 3.5V8.6h5.1"/><path d="M8.6 13h6.8M8.6 16.3h4.4"/>'),
};

export const ico = (name) => icons[name] || '';
