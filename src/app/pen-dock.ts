/**
 * Barre d'outils flottante de l'écriture à la main (façon GoodNotes) : stylos, couleurs, épaisseurs, gomme, lasso, règle,
 * annuler / rétablir. On l'attrape par sa poignée et on la dépose près d'un bord de l'écran (haut, bas, gauche, droite) :
 * elle s'y colle, se met à la verticale sur les côtés, et sa place est retenue.
 */
import { COLORS, type Rgb, rgbToCss } from '../data/annotations';
import { type PenKind, PENS } from '../data/ink';
import { t } from '../i18n/fr';
import type { Tool } from './annotator';
import { h } from './dom';
import { icon } from './icons';
import { type DockPlace, loadSettings, saveSettings } from './settings';

export interface DockState {
  tool: Tool | null;
  pen: PenKind;
  color: Rgb;
  width: number;
  rulerOn: boolean;
  canUndo: boolean;
  canRedo: boolean;
}

export interface DockHost {
  state(): DockState;
  setTool(tool: Tool): void;
  setPen(pen: PenKind): void;
  setColor(color: Rgb): void;
  setWidth(width: number): void;
  toggleRuler(): void;
  undo(): void;
  redo(): void;
  openFavorites(anchor: HTMLElement): void;
  close(): void;
}

const EDGES: DockPlace['edge'][] = ['bottom', 'left', 'top', 'right'];
const MARGIN = 14;

/** Bord le plus proche d'un point du conteneur, et position (0 à 1) le long de ce bord. Pur : testé. */
export function nearestDock(x: number, y: number, width: number, height: number): DockPlace {
  const d = { left: x, right: width - x, top: y, bottom: height - y };
  const edge = (Object.keys(d) as DockPlace['edge'][]).reduce((best, k) => (d[k] < d[best] ? k : best), 'bottom' as DockPlace['edge']);
  const along = edge === 'left' || edge === 'right' ? y / height : x / width;
  return { edge, pos: Math.min(1, Math.max(0, along)) };
}

export class PenDock {
  readonly el: HTMLElement;
  private penButtons = new Map<PenKind, HTMLButtonElement>();
  private toolButtons = new Map<string, HTMLButtonElement>();
  private colorButtons: HTMLButtonElement[] = [];
  private widthBox = h('span', { class: 'dock-widths' });
  private rulerBtn: HTMLButtonElement;
  private undoBtn: HTMLButtonElement;
  private redoBtn: HTMLButtonElement;
  private favBtn: HTMLButtonElement;
  private widthsFor: PenKind | null = null;

  constructor(private parent: HTMLElement, private host: DockHost) {
    const btn = (id: string, label: string, content: Node | string, onclick: () => void) => {
      const b = h('button', { type: 'button', class: 'dock-btn', id, title: label, 'aria-label': label, onclick }, content) as HTMLButtonElement;
      return b;
    };
    const grip = h('div', { class: 'dock-grip', id: 'dock-grip', title: t.dock.move, role: 'button', 'aria-label': t.dock.move, tabindex: '0' }, icon('grip', 16));
    const pens: [PenKind, 'pen' | 'nib' | 'marker'][] = [['pen', 'pen'], ['fountain', 'nib'], ['highlighter', 'marker']];
    const penGroup = h('span', { class: 'dock-group' });
    for (const [kind, ic] of pens) {
      const b = btn(`dock-pen-${kind}`, t.annot.pens[kind], icon(ic, 20), () => host.setPen(kind));
      b.dataset.dockPen = kind;
      this.penButtons.set(kind, b);
      penGroup.append(b);
    }
    const toolGroup = h('span', { class: 'dock-group' });
    for (const [tool, ic, label] of [['eraser', 'eraser', t.annot.tools.eraser], ['lasso', 'lasso', t.annot.tools.lasso]] as const) {
      const b = btn(`dock-${tool}`, label, icon(ic, 20), () => host.setTool(tool));
      this.toolButtons.set(tool, b);
      toolGroup.append(b);
    }
    this.rulerBtn = btn('dock-ruler', t.annot.ruler, icon('ruler', 20), () => host.toggleRuler());
    toolGroup.append(this.rulerBtn);
    const colors = h('span', { class: 'dock-group dock-colors' });
    for (const c of COLORS) {
      const b = h('button', { type: 'button', class: 'dock-color', title: c.name, 'aria-label': c.name, 'data-dock-color': c.name, onclick: () => host.setColor(c.rgb) }) as HTMLButtonElement;
      b.style.setProperty('--c', rgbToCss(c.rgb));
      this.colorButtons.push(b);
      colors.append(b);
    }
    this.favBtn = btn('dock-fav', t.annot.favAdd, icon('star', 18), () => host.openFavorites(this.favBtn));
    this.undoBtn = btn('dock-undo', t.dock.undo, icon('undo', 18), () => host.undo());
    this.redoBtn = btn('dock-redo', t.dock.redo, icon('redo', 18), () => host.redo());
    const close = btn('dock-close', t.dock.close, '✕', () => host.close());
    this.el = h(
      'div',
      { class: 'pen-dock', id: 'pen-dock', role: 'toolbar', 'aria-label': t.dock.title, hidden: true },
      grip,
      penGroup,
      colors,
      this.widthBox,
      toolGroup,
      h('span', { class: 'dock-group' }, this.favBtn, this.undoBtn, this.redoBtn),
      close,
    );
    parent.append(this.el);
    this.bindDrag(grip);
    this.place(loadSettings().dock);
  }

  /** Affiche ou cache la barre. */
  show(on: boolean) {
    this.el.hidden = !on;
    if (on) this.place(loadSettings().dock);
  }

  get visible(): boolean {
    return !this.el.hidden;
  }

  /** Met la barre à jour d'après l'état de l'écriture. */
  sync() {
    const s = this.host.state();
    const writing = s.tool === 'ink';
    for (const [k, b] of this.penButtons) {
      b.classList.toggle('on', writing && s.pen === k);
      b.setAttribute('aria-pressed', String(writing && s.pen === k));
    }
    for (const [k, b] of this.toolButtons) {
      b.classList.toggle('on', s.tool === k);
      b.setAttribute('aria-pressed', String(s.tool === k));
    }
    this.rulerBtn.classList.toggle('on', s.rulerOn);
    this.rulerBtn.setAttribute('aria-pressed', String(s.rulerOn));
    this.rulerBtn.disabled = s.tool !== 'ink';
    const showStyle = s.tool === 'ink';
    this.colorButtons.forEach((b, i) => {
      b.classList.toggle('on', COLORS[i].rgb.every((c, k) => Math.abs(c - s.color[k]) < 0.01));
      b.disabled = !showStyle;
    });
    if (this.widthsFor !== s.pen) {
      this.widthsFor = s.pen;
      const widths = PENS[s.pen].widths;
      this.widthBox.replaceChildren(
        ...widths.map((w) => {
          const dot = h('span', { class: 'dock-dot' });
          const px = Math.min(18, Math.max(5, Math.round(w * 1.1 + 3)));
          dot.style.width = dot.style.height = `${px}px`;
          const b = h('button', { type: 'button', class: 'dock-width', title: `${w} pt`, 'aria-label': `${w} pt`, 'data-dock-width': String(w), onclick: () => this.host.setWidth(w) }, dot) as HTMLButtonElement;
          return b;
        }),
      );
    }
    for (const b of this.widthBox.querySelectorAll<HTMLButtonElement>('.dock-width')) {
      b.classList.toggle('on', Math.abs(Number(b.dataset.dockWidth) - s.width) < 0.01);
      b.disabled = !showStyle;
    }
    this.undoBtn.disabled = !s.canUndo;
    this.redoBtn.disabled = !s.canRedo;
    this.favBtn.disabled = !showStyle;
  }

  /** Colle la barre au bord choisi, à la position choisie le long de ce bord. */
  place(p: DockPlace) {
    const el = this.el;
    el.dataset.edge = p.edge;
    const reset = { left: '', right: '', top: '', bottom: '', transform: '' };
    Object.assign(el.style, reset);
    const along = `${p.pos * 100}%`;
    const shift = `translate${p.edge === 'left' || p.edge === 'right' ? 'Y' : 'X'}(-${along})`;
    if (p.edge === 'bottom') Object.assign(el.style, { bottom: `${MARGIN}px`, left: along, transform: shift });
    else if (p.edge === 'top') Object.assign(el.style, { top: `${MARGIN}px`, left: along, transform: shift });
    else if (p.edge === 'left') Object.assign(el.style, { left: `${MARGIN}px`, top: along, transform: shift });
    else Object.assign(el.style, { right: `${MARGIN}px`, top: along, transform: shift });
  }

  private bindDrag(grip: HTMLElement) {
    grip.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try {
        grip.setPointerCapture(e.pointerId);
      } catch {
        /* pointeur déjà terminé */
      }
      const box = this.parent.getBoundingClientRect();
      const r = this.el.getBoundingClientRect();
      const grabX = e.clientX - r.left;
      const grabY = e.clientY - r.top;
      this.el.classList.add('dragging');
      Object.assign(this.el.style, { left: `${r.left - box.left}px`, top: `${r.top - box.top}px`, right: '', bottom: '', transform: '' });
      const move = (ev: PointerEvent) => {
        const x = Math.min(Math.max(0, ev.clientX - box.left - grabX), box.width - r.width);
        const y = Math.min(Math.max(0, ev.clientY - box.top - grabY), box.height - r.height);
        Object.assign(this.el.style, { left: `${x}px`, top: `${y}px` });
      };
      const end = (ev: PointerEvent) => {
        grip.removeEventListener('pointermove', move);
        grip.removeEventListener('pointerup', end);
        grip.removeEventListener('pointercancel', end);
        this.el.classList.remove('dragging');
        // centre de la barre → bord le plus proche
        const cx = Math.min(Math.max(0, ev.clientX - box.left - grabX + r.width / 2), box.width);
        const cy = Math.min(Math.max(0, ev.clientY - box.top - grabY + r.height / 2), box.height);
        const place = nearestDock(cx, cy, box.width, box.height);
        this.place(place);
        saveSettings({ ...loadSettings(), dock: place });
      };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', end);
      grip.addEventListener('pointercancel', end);
    });
    // au clavier : Entrée ou espace fait passer la barre au bord suivant
    grip.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      const cur = loadSettings().dock;
      const next: DockPlace = { edge: EDGES[(EDGES.indexOf(cur.edge) + 1) % EDGES.length], pos: 0.5 };
      this.place(next);
      saveSettings({ ...loadSettings(), dock: next });
    });
  }
}
