import { h } from './dom';

export interface MenuItem {
  id: string;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  separatorBefore?: boolean;
  run: () => void;
}

let current: { el: HTMLElement; off: () => void } | null = null;

export function closeMenu(): void {
  current?.off();
  current?.el.remove();
  current = null;
}

/** Affiche un menu contextuel. `at` : coin haut-gauche (écran) ou élément sous lequel l'accrocher. */
export function showMenu(items: MenuItem[], at: { x: number; y: number } | HTMLElement, onClose?: () => void): HTMLElement {
  closeMenu();
  const el = h('div', { class: 'file-menu popup-menu', role: 'menu' });
  for (const it of items) {
    if (it.separatorBefore) el.append(h('div', { class: 'file-menu-sep', role: 'separator' }));
    el.append(
      h(
        'button',
        {
          type: 'button',
          role: 'menuitem',
          'data-id': it.id,
          disabled: it.disabled,
          onclick: () => {
            closeMenu();
            onClose?.();
            it.run();
          },
        },
        h('span', {}, it.label),
        it.shortcut ? h('kbd', {}, it.shortcut) : null,
      ),
    );
  }
  document.body.append(el);
  const pos = at instanceof HTMLElement ? { x: at.getBoundingClientRect().left, y: at.getBoundingClientRect().bottom } : at;
  const { width, height } = el.getBoundingClientRect();
  el.style.left = `${Math.max(4, Math.min(pos.x, window.innerWidth - width - 4))}px`;
  el.style.top = `${Math.max(4, Math.min(pos.y, window.innerHeight - height - 4))}px`;
  const away = (e: Event) => {
    if (!el.contains(e.target as Node)) {
      closeMenu();
      onClose?.();
    }
  };
  const key = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeMenu();
      onClose?.();
    }
  };
  // différé : le clic qui ouvre le menu ne doit pas le refermer
  setTimeout(() => {
    document.addEventListener('pointerdown', away, true);
    document.addEventListener('keydown', key, true);
  });
  current = {
    el,
    off: () => {
      document.removeEventListener('pointerdown', away, true);
      document.removeEventListener('keydown', key, true);
    },
  };
  el.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  return el;
}
