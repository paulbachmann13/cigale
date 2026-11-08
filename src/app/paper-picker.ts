/**
 * Choix d'un papier avec aperçu : une grille de vignettes (dessinées avec les mêmes formes que le PDF) et la couleur du papier.
 */
import { type PaperColor, type PaperTemplate, PAPER_COLORS, PAPER_COLOR_NAMES, PAPER_TEMPLATES, paperPrims } from '../data/paper';
import { t } from '../i18n/fr';
import { h } from './dom';

const css = (c: readonly number[]) => `rgb(${Math.round(c[0] * 255)} ${Math.round(c[1] * 255)} ${Math.round(c[2] * 255)})`;

/** Dessine l'aperçu d'un papier dans un canevas (largeur en pixels CSS donnée, hauteur selon la page). */
export function drawPaperPreview(canvas: HTMLCanvasElement, template: PaperTemplate, color: PaperColor, pageW: number, pageH: number, cssWidth: number): void {
  if (!(pageW > 0 && pageH > 0)) [pageW, pageH] = [595.28, 841.89]; // taille illisible : A4
  const dpr = window.devicePixelRatio || 1;
  const cssHeight = Math.round((cssWidth * pageH) / pageW);
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);
  const g = canvas.getContext('2d');
  if (!g) return;
  const k = (cssWidth / pageW) * dpr; // points PDF → pixels
  g.fillStyle = css(PAPER_COLORS[color]);
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.lineCap = 'butt';
  for (const p of paperPrims(template, pageW, pageH)) {
    g.strokeStyle = g.fillStyle = css(p.c);
    if (p.k === 'line') {
      g.lineWidth = Math.max(0.5 * dpr, p.w * k);
      g.beginPath();
      g.moveTo(p.x1 * k, canvas.height - p.y1 * k);
      g.lineTo(p.x2 * k, canvas.height - p.y2 * k);
      g.stroke();
    } else {
      g.beginPath();
      g.arc(p.x * k, canvas.height - p.y * k, Math.max(0.6 * dpr, p.r * k), 0, Math.PI * 2);
      g.fill();
    }
  }
}

export interface PaperPicker {
  el: HTMLElement;
  value(): { template: PaperTemplate; color: PaperColor };
  /** Redessine les aperçus (la taille ou l'orientation de la page a changé). */
  refresh(): void;
}

/** `pageSize()` : taille de la page en points (portrait ou paysage, selon le choix en cours). */
export function paperPicker(initial: { template: PaperTemplate; color?: PaperColor }, pageSize: () => [number, number], idPrefix = 'paper'): PaperPicker {
  let template = initial.template;
  let color: PaperColor = initial.color ?? 'white';
  const cards = new Map<PaperTemplate, { btn: HTMLButtonElement; canvas: HTMLCanvasElement }>();
  const grid = h('div', { class: 'paper-grid', role: 'radiogroup', 'aria-label': t.notebook.paper });
  for (const k of PAPER_TEMPLATES) {
    const canvas = h('canvas', { class: 'paper-thumb', 'aria-hidden': 'true' });
    const btn = h(
      'button',
      {
        type: 'button',
        class: 'paper-card',
        role: 'radio',
        'data-paper': k,
        id: `${idPrefix}-${k}`,
        onclick: () => {
          template = k;
          sync();
        },
      },
      canvas,
      h('span', { class: 'paper-name' }, t.notebook.papers[k]),
    );
    cards.set(k, { btn, canvas });
    grid.append(btn);
  }
  const swatches = new Map<PaperColor, HTMLButtonElement>();
  const colors = h('div', { class: 'paper-colors', role: 'radiogroup', 'aria-label': t.notebook.colorLabel });
  for (const c of PAPER_COLOR_NAMES) {
    const b = h('button', {
      type: 'button',
      class: 'paper-color',
      role: 'radio',
      'data-color': c,
      title: t.notebook.colors[c],
      'aria-label': t.notebook.colors[c],
      onclick: () => {
        color = c;
        sync();
        repaint();
      },
    });
    b.style.background = css(PAPER_COLORS[c]);
    swatches.set(c, b);
    colors.append(b);
  }
  const sync = () => {
    for (const [k, c] of cards) {
      c.btn.setAttribute('aria-checked', String(k === template));
      c.btn.classList.toggle('on', k === template);
    }
    for (const [k, b] of swatches) {
      b.setAttribute('aria-checked', String(k === color));
      b.classList.toggle('on', k === color);
    }
  };
  const repaint = () => {
    const [w, hh] = pageSize();
    // même hauteur de vignette pour tous : la largeur s'adapte au format (portrait ou paysage)
    const cssH = 112;
    const cssW = Math.round((cssH * w) / hh);
    for (const [k, c] of cards) drawPaperPreview(c.canvas, k, color, w, hh, Math.min(cssW, 150));
  };
  sync();
  repaint();
  return { el: h('div', { class: 'paper-picker' }, grid, h('div', { class: 'form-row' }, h('span', {}, t.notebook.colorLabel), colors)), value: () => ({ template, color }), refresh: repaint };
}
