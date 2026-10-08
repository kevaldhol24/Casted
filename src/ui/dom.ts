export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  html = '',
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (html) e.innerHTML = html;
  return e;
}

export const ICONS = {
  grid: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2"/></svg>',
  cog: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10.3 2h3.4l.5 2.6a7.8 7.8 0 0 1 1.9 1.1l2.5-.9 1.7 2.9-2 1.8a7.9 7.9 0 0 1 0 2.2l2 1.8-1.7 2.9-2.5-.9a7.8 7.8 0 0 1-1.9 1.1l-.5 2.6h-3.4l-.5-2.6a7.8 7.8 0 0 1-1.9-1.1l-2.5.9-1.7-2.9 2-1.8a7.9 7.9 0 0 1 0-2.2l-2-1.8 1.7-2.9 2.5.9a7.8 7.8 0 0 1 1.9-1.1zM12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8z" fill-rule="evenodd"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="5.5" y="4" width="4.5" height="16" rx="1.6"/><rect x="14" y="4" width="4.5" height="16" rx="1.6"/></svg>',
  soundOn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 5v14l-4.5-4.5H4z" fill="currentColor"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6"/><path d="M18.2 6.5a7.8 7.8 0 0 1 0 11"/></svg>',
  soundOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 5v14l-4.5-4.5H4z" fill="currentColor"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>',
  bulb: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5a6.8 6.8 0 0 0-4 12.3c.7.5 1 1.2 1 2V18h6v-1.2c0-.8.4-1.5 1-2A6.8 6.8 0 0 0 12 2.5z"/><rect x="9" y="19" width="6" height="2.6" rx="1.2"/></svg>',
  video: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="2.5" y="6" width="13" height="12" rx="2.5"/><path d="M16.5 10.5l5-3v9l-5-3z"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.6l2.8 6 6.5.7-4.9 4.4 1.4 6.4L12 16.8l-5.8 3.3 1.4-6.4-4.9-4.4 6.5-.7z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>',
  hand: '<svg viewBox="0 0 64 64"><circle cx="30" cy="20" r="10" fill="rgba(255,246,232,0.25)"/><path d="M27 20v20l-5-5c-2-2-5 0-4 3l9 12c2 3 5 6 11 6h4c6 0 9-5 9-11V31c0-2-3-3-4-1v-2c0-3-4-3-4 0v-2c0-3-4-3-4 0V20c0-3-8-3-8 0z" fill="#fff6e8" stroke="#2b1a08" stroke-width="2.5" stroke-linejoin="round"/></svg>',
};
