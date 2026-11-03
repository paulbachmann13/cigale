/** Petits utilitaires DOM : tout le texte vient de fr.ts ou est inséré avec textContent (jamais innerHTML). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Attrs = Record<string, string | number | boolean | undefined | ((...args: any[]) => unknown)>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Node | string | null | undefined)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (typeof v === 'function' || (k in el && typeof v !== 'string')) (el as unknown as Record<string, unknown>)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c != null) el.append(c);
  return el;
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

let toastTimer: number | undefined;
export function toast(message: string, action?: { label: string; run: () => void }): void {
  let el = document.getElementById('toast');
  if (!el) {
    el = h('div', { id: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(el);
  }
  clear(el);
  el.append(h('span', {}, message));
  if (action) el.append(h('button', { class: 'link', onclick: action.run }, action.label));
  el.classList.add('show');
  window.clearTimeout(toastTimer);
  if (!action) toastTimer = window.setTimeout(() => el!.classList.remove('show'), 5000);
}
