/**
 * Signature visuelle (« Remplir et signer ») : on dessine, on tape ou on importe une image ; elle est posée sur la page comme
 * un tampon-image. Ce n'est PAS une signature numérique (certificat) : c'est l'image d'une signature.
 */
import { fmt, t } from '../i18n/fr';
import { deleteSignature, listSignatures, readSignature, saveSignature } from '../storage/signatures';
import { modal } from './dialogs';
import { h } from './dom';

export interface SignatureImage {
  png: Uint8Array;
  width: number;
  height: number;
}

type Tab = 'draw' | 'type' | 'image';
const PAD_W = 520;
const PAD_H = 190;
const INKS = [
  { name: 'Noir', css: '#111111' },
  { name: 'Bleu', css: '#1a3fa0' },
];

/** Rogne l'image autour de l'encre (avec une marge) et la rend en PNG transparent. */
async function trim(canvas: HTMLCanvasElement): Promise<SignatureImage | null> {
  const ctx = canvas.getContext('2d')!;
  const { width, height } = canvas;
  const d = ctx.getImageData(0, 0, width, height).data;
  let x1 = width, y1 = height, x2 = -1, y2 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (d[(y * width + x) * 4 + 3] > 8) {
        if (x < x1) x1 = x;
        if (x > x2) x2 = x;
        if (y < y1) y1 = y;
        if (y > y2) y2 = y;
      }
    }
  }
  if (x2 < 0) return null;
  const pad = 6;
  x1 = Math.max(0, x1 - pad);
  y1 = Math.max(0, y1 - pad);
  x2 = Math.min(width - 1, x2 + pad);
  y2 = Math.min(height - 1, y2 + pad);
  const out = document.createElement('canvas');
  out.width = x2 - x1 + 1;
  out.height = y2 - y1 + 1;
  out.getContext('2d')!.drawImage(canvas, x1, y1, out.width, out.height, 0, 0, out.width, out.height);
  const blob = await new Promise<Blob | null>((r) => out.toBlob(r, 'image/png'));
  if (!blob) return null;
  return { png: new Uint8Array(await blob.arrayBuffer()), width: out.width, height: out.height };
}

/** Choix d'une signature : enregistrée, dessinée, tapée ou importée. Renvoie null si annulé. */
export function askSignature(): Promise<SignatureImage | null> {
  return new Promise((resolve) => {
    let answer: SignatureImage | null = null;
    let ink = INKS[0].css;
    let tab: Tab = 'draw';
    const error = h('p', { class: 'dialog-error', id: 'sig-error', role: 'alert' });
    const remember = h('input', { type: 'checkbox', id: 'sig-remember', checked: true });

    // — dessin
    const pad = h('canvas', { id: 'sig-pad', class: 'sig-pad', width: PAD_W, height: PAD_H });
    const pctx = pad.getContext('2d', { willReadFrequently: true })!;
    const style = () => Object.assign(pctx, { lineWidth: 3.2, lineCap: 'round', lineJoin: 'round', strokeStyle: ink });
    pad.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      pad.setPointerCapture(e.pointerId);
      style();
      const pos = (ev: PointerEvent): [number, number] => {
        const r = pad.getBoundingClientRect();
        return [((ev.clientX - r.left) / r.width) * PAD_W, ((ev.clientY - r.top) / r.height) * PAD_H];
      };
      let last = pos(e);
      pctx.beginPath();
      pctx.moveTo(...last);
      pctx.lineTo(last[0] + 0.01, last[1]);
      pctx.stroke();
      const move = (ev: PointerEvent) => {
        const p = pos(ev);
        pctx.beginPath();
        pctx.moveTo(...last);
        pctx.lineTo(...p);
        pctx.stroke();
        last = p;
      };
      const up = () => {
        pad.removeEventListener('pointermove', move);
        pad.removeEventListener('pointerup', up);
      };
      pad.addEventListener('pointermove', move);
      pad.addEventListener('pointerup', up);
    });
    const clear = h('button', { type: 'button', id: 'sig-clear', onclick: () => pctx.clearRect(0, 0, PAD_W, PAD_H) }, t.sign.clear);

    // — texte tapé
    const typed = h('input', { type: 'text', id: 'sig-text', placeholder: t.sign.typePlaceholder, 'aria-label': t.sign.typePlaceholder });
    const typedPreview = h('canvas', { id: 'sig-type-preview', class: 'sig-pad', width: PAD_W, height: PAD_H });
    const renderTyped = () => {
      const c = typedPreview.getContext('2d', { willReadFrequently: true })!;
      c.clearRect(0, 0, PAD_W, PAD_H);
      c.fillStyle = ink;
      c.textBaseline = 'middle';
      let size = 90;
      c.font = `italic ${size}px "Snell Roundhand", "Apple Chancery", "Brush Script MT", cursive`;
      while (c.measureText(typed.value).width > PAD_W - 30 && size > 24) c.font = `italic ${(size -= 4)}px "Snell Roundhand", "Apple Chancery", "Brush Script MT", cursive`;
      c.fillText(typed.value, 15, PAD_H / 2);
    };
    typed.addEventListener('input', renderTyped);

    // — image importée
    const file = h('input', { type: 'file', id: 'sig-file', accept: 'image/png,image/jpeg,image/*' });
    const imageCanvas = h('canvas', { id: 'sig-image-preview', class: 'sig-pad', width: PAD_W, height: PAD_H });
    file.addEventListener('change', async () => {
      const f = file.files?.[0];
      if (!f) return;
      try {
        const bmp = await createImageBitmap(f);
        const scale = Math.min(PAD_W / bmp.width, PAD_H / bmp.height, 1);
        const c = imageCanvas.getContext('2d', { willReadFrequently: true })!;
        c.clearRect(0, 0, PAD_W, PAD_H);
        const w = bmp.width * scale;
        const hh = bmp.height * scale;
        c.drawImage(bmp, (PAD_W - w) / 2, (PAD_H - hh) / 2, w, hh);
        // fond blanc (ou presque) → transparent : une signature scannée se pose sans cadre blanc
        const data = c.getImageData(0, 0, PAD_W, PAD_H);
        for (let i = 0; i < data.data.length; i += 4) {
          const lum = (data.data[i] + data.data[i + 1] + data.data[i + 2]) / 3;
          if (lum > 235) data.data[i + 3] = 0;
        }
        c.putImageData(data, 0, 0);
        bmp.close();
      } catch {
        error.textContent = t.sign.badImage;
      }
    });

    const panes: Record<Tab, HTMLElement> = {
      draw: h('div', {}, pad, h('div', { class: 'sig-tools' }, clear)),
      type: h('div', {}, typed, typedPreview),
      image: h('div', {}, file, imageCanvas),
    };
    const tabsEl = h('div', { class: 'panel-tabs', role: 'tablist' });
    const show = (name: Tab) => {
      tab = name;
      for (const [k, el] of Object.entries(panes)) el.hidden = k !== name;
      tabsEl.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
      error.textContent = '';
    };
    for (const [name, label] of [['draw', t.sign.draw], ['type', t.sign.type], ['image', t.sign.image]] as const) {
      tabsEl.append(h('button', { type: 'button', role: 'tab', 'data-tab': name, id: `sig-tab-${name}`, onclick: () => show(name) }, label));
    }
    const inks = h('div', { class: 'sig-tools' }, ...INKS.map((i) => {
      const b = h('button', { type: 'button', class: 'swatch', title: i.name, 'aria-label': i.name, onclick: () => ((ink = i.css), renderTyped()) });
      b.style.background = i.css;
      return b;
    }));

    // — signatures enregistrées
    const saved = h('div', { class: 'sig-saved', id: 'sig-saved' });
    const renderSaved = async () => {
      saved.replaceChildren();
      const list = await listSignatures();
      if (!list.length) return;
      saved.append(h('strong', {}, t.sign.saved));
      for (const s of list) {
        const bytes = await readSignature(s.id);
        if (!bytes) continue;
        const url = URL.createObjectURL(new Blob([bytes.slice()], { type: 'image/png' }));
        const img = h('img', { src: url, alt: t.sign.saved, class: 'sig-thumb' });
        saved.append(
          h(
            'span',
            { class: 'sig-item' },
            h('button', { type: 'button', class: 'sig-use', 'data-sig': s.id, onclick: () => ((answer = { png: bytes, width: s.width, height: s.height }), dlg.close()) }, img),
            h('button', { type: 'button', class: 'link', 'aria-label': t.sign.delete, onclick: () => void deleteSignature(s.id).then(renderSaved) }, '✕'),
          ),
        );
      }
    };

    const use = async () => {
      const source = tab === 'draw' ? pad : tab === 'type' ? typedPreview : imageCanvas;
      if (tab === 'type' && !typed.value.trim()) return void (error.textContent = t.sign.empty);
      const img = await trim(source);
      if (!img) return void (error.textContent = t.sign.empty);
      if (remember.checked) await saveSignature(img.png, img.width, img.height).catch(() => undefined);
      answer = img;
      dlg.close();
    };

    const dlg = modal(
      (close) => [
        h('h2', {}, t.sign.title),
        h('p', { class: 'hint' }, t.sign.notDigital),
        saved,
        tabsEl,
        panes.draw,
        panes.type,
        panes.image,
        inks,
        h('label', { class: 'check' }, remember, t.sign.remember),
        error,
        h('div', { class: 'dialog-actions' }, h('button', { type: 'button', id: 'sig-cancel', onclick: close }, t.docTools.cancel), h('button', { type: 'button', id: 'sig-use', class: 'primary', onclick: () => void use() }, t.sign.use)),
      ],
      () => resolve(answer),
    );
    dlg.id = 'dialog-signature';
    dlg.classList.add('wide');
    show('draw');
    void renderSaved();
    void fmt;
  });
}
