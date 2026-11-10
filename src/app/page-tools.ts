/** Boîtes des outils de page : filigrane, en-têtes et pieds de page, recadrage. Le travail se fait dans le Web Worker (Editing). */
import { COLORS, type Rgb, rgbToCss } from '../data/annotations';
import { parseRanges, rangesToIndices } from '../data/page-ranges';
import { fmt, t } from '../i18n/fr';
import { modal } from './dialogs';
import { h } from './dom';
import type { Editing } from './editing';
import type { Session } from './session';

const MM = 72 / 25.4;

/** Choix « quelles pages ? » : toutes, page affichée, pages sélectionnées, plages. `read()` renvoie les indices (undefined = toutes), ou null si la saisie est invalide. */
export function scopeControls(s: Session, error: HTMLElement): { el: HTMLElement; read: () => number[] | undefined | null } {
  const name = `scope-${Math.random().toString(36).slice(2, 7)}`;
  const radio = (id: string, label: string, checked = false, disabled = false) => {
    const input = h('input', { type: 'radio', name, id, checked, disabled });
    return { input, el: h('label', { class: 'check' }, input, label) };
  };
  const all = radio('scope-all', t.docTools.scopeAll, true);
  const current = radio('scope-current', fmt(t.docTools.scopeCurrent, { n: s.view.page }));
  const selected = radio('scope-selected', fmt(t.docTools.scopeSelected, { n: s.selection.length }), false, s.selection.length === 0);
  const custom = radio('scope-range', t.docTools.scopeRange);
  const range = h('input', { type: 'text', id: 'scope-range-text', placeholder: '1-3, 5', 'aria-label': t.docTools.scopeRange });
  range.addEventListener('focus', () => (custom.input.checked = true));
  const el = h('fieldset', { class: 'scope' }, h('legend', {}, t.docTools.scope), all.el, current.el, selected.el, h('div', { class: 'combine-tools' }, custom.el, range));
  return {
    el,
    read: () => {
      error.textContent = '';
      if (all.input.checked) return undefined;
      if (current.input.checked) return [s.view.page - 1];
      if (selected.input.checked) return s.selection;
      const r = parseRanges(range.value, s.view.pageCount);
      if (!r.ok) {
        error.textContent = fmt(t.docTools.rangeError, { token: r.token, total: s.view.pageCount });
        return null;
      }
      return rangesToIndices(r.ranges);
    },
  };
}

const field = (label: string, input: HTMLElement) => h('label', { class: 'form-row' }, label, input);
const num = (id: string, value: number, min: number, max: number, step = 1) => h('input', { type: 'number', id, value, min, max, step });

function swatches(initial: Rgb, onPick: (c: Rgb) => void): HTMLElement {
  const wrap = h('div', { class: 'swatches' });
  const buttons: HTMLButtonElement[] = [];
  const palette: { name: string; rgb: Rgb }[] = [{ name: 'Gris', rgb: [0.5, 0.5, 0.5] }, ...COLORS];
  for (const c of palette) {
    const b = h('button', { type: 'button', class: 'swatch', title: c.name, 'aria-label': c.name, 'data-color': c.name });
    b.style.background = rgbToCss(c.rgb);
    b.onclick = () => {
      onPick(c.rgb);
      buttons.forEach((x) => x.classList.toggle('on', x === b));
    };
    b.classList.toggle('on', c.rgb.every((v, i) => v === initial[i]));
    buttons.push(b);
    wrap.append(b);
  }
  return wrap;
}

// ───────────── filigrane ─────────────

export function openWatermarkDialog(s: Session, editing: Editing): void {
  let color: Rgb = [0.5, 0.5, 0.5];
  const text = h('input', { type: 'text', id: 'wm-text', value: t.docTools.wmTextDefault });
  const size = h('select', { id: 'wm-size' }, ...[36, 48, 72, 96, 120].map((n) => h('option', { value: String(n), selected: n === 72 }, `${n} pt`)));
  const opacity = h('input', { type: 'range', id: 'wm-opacity', min: 10, max: 100, value: 30 });
  const angle = h('select', { id: 'wm-angle' }, h('option', { value: '45' }, t.docTools.wmDiagonal), h('option', { value: '0' }, t.docTools.wmHorizontal));
  const error = h('p', { class: 'dialog-error', id: 'wm-error', role: 'alert' });
  const scope = scopeControls(s, error);
  modal((close) => [
    h('h2', {}, t.docTools.wmTitle),
    field(t.docTools.wmText, text),
    h('div', { class: 'form-grid' }, field(t.docTools.wmSize, size), field(t.docTools.wmAngle, angle)),
    field(t.docTools.wmOpacity, opacity),
    h('div', { class: 'form-row' }, h('span', {}, t.docTools.wmColor), swatches(color, (c) => (color = c))),
    scope.el,
    error,
    h(
      'div',
      { class: 'dialog-actions' },
      h('button', { type: 'button', id: 'tool-cancel', onclick: close }, t.docTools.cancel),
      h(
        'button',
        {
          type: 'button',
          id: 'tool-apply',
          class: 'primary',
          onclick: () => {
            const pages = scope.read();
            if (pages === null) return;
            if (!text.value.trim()) return void (error.textContent = t.docTools.wmText);
            close();
            void editing.watermark(s, { text: text.value.trim(), fontSize: Number(size.value), color, opacity: Number(opacity.value) / 100, angle: Number(angle.value), pages });
          },
        },
        t.docTools.apply,
      ),
    ),
  ]).id = 'dialog-watermark';
}

// ───────────── en-têtes, pieds de page, numérotation ─────────────

export function openHeaderFooterDialog(s: Session, editing: Editing): void {
  const input = (id: string, value = '') => h('input', { type: 'text', id, value });
  const hl = input('hf-header-left');
  const hc = input('hf-header-center');
  const hr = input('hf-header-right');
  const fl = input('hf-footer-left');
  const fc = input('hf-footer-center', t.docTools.hfFooterDefault);
  const fr = input('hf-footer-right');
  const size = h('select', { id: 'hf-size' }, ...[8, 9, 10, 11, 12, 14].map((n) => h('option', { value: String(n), selected: n === 10 }, `${n} pt`)));
  const margin = num('hf-margin', 10, 5, 50);
  const first = num('hf-first', 1, 0, 9999);
  const batesOn = h('input', { type: 'checkbox', id: 'hf-bates' }) as HTMLInputElement;
  const batesPrefix = h('input', { type: 'text', id: 'hf-bates-prefix', placeholder: 'DOSSIER-', maxlength: '30', 'aria-label': t.docTools.batesPrefix }) as HTMLInputElement;
  const batesDigits = num('hf-bates-digits', 6, 1, 12);
  const batesStart = num('hf-bates-start', 1, 0, 999999999);
  const error = h('p', { class: 'dialog-error', id: 'hf-error', role: 'alert' });
  const scope = scopeControls(s, error);
  const row = (label: string, a: HTMLElement, b: HTMLElement, c: HTMLElement) =>
    h('div', { class: 'hf-row' }, h('strong', {}, label), field(t.docTools.hfLeft, a), field(t.docTools.hfCenter, b), field(t.docTools.hfRight, c));
  modal((close) => [
    h('h2', {}, t.docTools.hfTitle),
    h('p', { class: 'hint' }, t.docTools.hfHint),
    row(t.docTools.hfHeader, hl, hc, hr),
    row(t.docTools.hfFooter, fl, fc, fr),
    h('div', { class: 'form-grid' }, field(t.docTools.hfSize, size), field(t.docTools.hfMargin, margin), field(t.docTools.hfFirst, first)),
    h('fieldset', { class: 'scope' }, h('legend', {}, t.docTools.batesTitle), h('label', { class: 'check' }, batesOn, t.docTools.batesUse), h('div', { class: 'form-grid' }, field(t.docTools.batesPrefix, batesPrefix), field(t.docTools.batesDigits, batesDigits), field(t.docTools.batesStart, batesStart)), h('p', { class: 'hint' }, t.docTools.batesHint)),
    scope.el,
    error,
    h(
      'div',
      { class: 'dialog-actions' },
      h('button', { type: 'button', id: 'tool-cancel', onclick: close }, t.docTools.cancel),
      h(
        'button',
        {
          type: 'button',
          id: 'tool-apply',
          class: 'primary',
          onclick: () => {
            const pages = scope.read();
            if (pages === null) return;
            if (batesOn.checked && ![hl, hc, hr, fl, fc, fr].some((i) => i.value.includes('{bates}'))) {
              error.textContent = t.docTools.batesMissing; // la numérotation Bates n'apparaît que si un champ contient {bates}
              return;
            }
            close();
            void editing.headerFooter(s, {
              header: { left: hl.value, center: hc.value, right: hr.value },
              footer: { left: fl.value, center: fc.value, right: fr.value },
              fontSize: Number(size.value),
              color: [0, 0, 0],
              margin: Number(margin.value) * MM,
              firstNumber: Number(first.value),
              pages,
              ...(batesOn.checked ? { bates: { prefix: batesPrefix.value, digits: Number(batesDigits.value), start: Number(batesStart.value) } } : {}),
            });
          },
        },
        t.docTools.apply,
      ),
    ),
  ]).id = 'dialog-headerfooter';
}

// ───────────── recadrage ─────────────

export function openCropDialog(s: Session, editing: Editing): void {
  const top = num('crop-top', 10, 0, 500);
  const right = num('crop-right', 10, 0, 500);
  const bottom = num('crop-bottom', 10, 0, 500);
  const left = num('crop-left', 10, 0, 500);
  const error = h('p', { class: 'dialog-error', id: 'crop-error', role: 'alert' });
  const scope = scopeControls(s, error);
  modal((close) => [
    h('h2', {}, t.docTools.cropTitle),
    h('p', { class: 'hint' }, t.docTools.cropHint),
    h('div', { class: 'form-grid' }, field(t.docTools.cropTop, top), field(t.docTools.cropRight, right), field(t.docTools.cropBottom, bottom), field(t.docTools.cropLeft, left)),
    scope.el,
    error,
    h(
      'div',
      { class: 'dialog-actions' },
      h('button', { type: 'button', id: 'tool-cancel', onclick: close }, t.docTools.cancel),
      h(
        'button',
        {
          type: 'button',
          id: 'tool-apply',
          class: 'primary',
          onclick: () => {
            const pages = scope.read();
            if (pages === null) return;
            close();
            void editing.crop(s, { top: Number(top.value) * MM, right: Number(right.value) * MM, bottom: Number(bottom.value) * MM, left: Number(left.value) * MM }, pages);
          },
        },
        t.docTools.apply,
      ),
    ),
  ]).id = 'dialog-crop';
}

// ───────────── protection par mot de passe ─────────────

export function openProtectDialog(s: Session, editing: Editing): void {
  const pw = (id: string) => h('input', { type: 'password', id, autocomplete: 'new-password' });
  const open1 = pw('pw-open');
  const open2 = pw('pw-open2');
  const owner1 = pw('pw-owner');
  const owner2 = pw('pw-owner2');
  const perm = (id: string, label: string) => {
    const input = h('input', { type: 'checkbox', id, checked: true });
    return { input, el: h('label', { class: 'check' }, input, label) };
  };
  const print = perm('perm-print', t.docTools.permPrint);
  const copy = perm('perm-copy', t.docTools.permCopy);
  const modify = perm('perm-modify', t.docTools.permModify);
  const annotate = perm('perm-annotate', t.docTools.permAnnotate);
  const error = h('p', { class: 'dialog-error', id: 'pw-error', role: 'alert' });
  modal((close) => [
    h('h2', {}, t.docTools.protectTitle),
    h('p', { class: 'hint' }, t.docTools.protectHint),
    field(t.docTools.pwOpen, open1),
    field(t.docTools.pwConfirm, open2),
    h('p', { class: 'hint' }, t.docTools.permHint),
    print.el,
    copy.el,
    modify.el,
    annotate.el,
    field(t.docTools.pwOwner, owner1),
    field(t.docTools.pwConfirm, owner2),
    h('p', { class: 'hint' }, t.docTools.protectWarn),
    error,
    h(
      'div',
      { class: 'dialog-actions' },
      h('button', { type: 'button', id: 'tool-cancel', onclick: close }, t.docTools.cancel),
      h(
        'button',
        {
          type: 'button',
          id: 'tool-apply',
          class: 'primary',
          onclick: () => {
            const restricted = !print.input.checked || !copy.input.checked || !modify.input.checked || !annotate.input.checked;
            if (open1.value !== open2.value || owner1.value !== owner2.value) return void (error.textContent = t.docTools.pwMismatch);
            if (!open1.value && !restricted) return void (error.textContent = t.docTools.pwNothing);
            if (restricted && !owner1.value) return void (error.textContent = t.docTools.pwNeedOwner);
            if (open1.value && owner1.value && open1.value === owner1.value) return void (error.textContent = t.docTools.pwSame);
            close();
            void editing.protect(s, {
              userPassword: open1.value,
              ownerPassword: owner1.value,
              permissions: {
                printing: print.input.checked ? 'highResolution' : false,
                copying: copy.input.checked,
                modifying: modify.input.checked,
                annotating: annotate.input.checked,
                fillingForms: annotate.input.checked,
                contentAccessibility: true,
                documentAssembly: modify.input.checked,
              },
            });
          },
        },
        t.docTools.protectGo,
      ),
    ),
  ]).id = 'dialog-protect';
}
