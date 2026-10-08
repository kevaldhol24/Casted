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
  star: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.6l2.8 6 6.5.7-4.9 4.4 1.4 6.4L12 16.8l-5.8 3.3 1.4-6.4-4.9-4.4 6.5-.7z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>',
  hand: '<svg viewBox="0 0 64 64"><circle cx="30" cy="20" r="10" fill="rgba(255,246,232,0.25)"/><path d="M27 20v20l-5-5c-2-2-5 0-4 3l9 12c2 3 5 6 11 6h4c6 0 9-5 9-11V31c0-2-3-3-4-1v-2c0-3-4-3-4 0v-2c0-3-4-3-4 0V20c0-3-8-3-8 0z" fill="#fff6e8" stroke="#2b1a08" stroke-width="2.5" stroke-linejoin="round"/></svg>',
};
