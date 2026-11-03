/** Boîtes « Combiner des fichiers » et « Diviser le document ». Le travail lourd se fait dans un Web Worker. */
import { type Range, parseRanges, rangeLabel, rangesToIndices, sanitizeFileName, splitAtStarts, splitEvery, uniqueNames } from '../data/page-ranges';
import { fmt, plural, t } from '../i18n/fr';
import type { MergeSource } from '../pdf/doc-ops';
import { Cancelled, bookmarksOperation, inspectDocument, mergeOperation, splitOperation, zipOperation } from '../pdf/ops-client';
import { askPassword, modal, showMessage } from './dialogs';
import { h, toast } from './dom';
import { pickPdfsAndImages } from './files';
import { downloadBytes } from './save';
import type { Session } from './session';

export interface ToolsHost {
  /** Affiche « traitement en cours » avec Annuler ; renvoie la fonction qui règle la barre de progression (0 à 1). */
  busy(text: string, onCancel: () => void): (fraction: number) => void;
  idle(): void;
  /** Ouvre des octets dans un nouvel onglet (document pas encore enregistré). */
  openNew(name: string, bytes: Uint8Array): Promise<unknown>;
}

const MAX_PARTS = 200;
const MAX_TABS = 10;
const isPdf = (b: Uint8Array) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;

// ───────────── Combiner ─────────────

interface Row {
  name: string;
  bytes: Uint8Array;
  password?: string;
  /** null : image. */
  pageCount: number | null;
  range: string;
  /** Document ouvert : pdf.js a compté ses pages, on s'en sert pour vérifier la structure. */
  fromViewer?: boolean;
}

async function readFile(file: File): Promise<Row | null> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length === 0) return null;
  if (isPdf(bytes)) {
    let password: string | undefined;
    for (let attempt = 0; ; attempt++) {
      try {
        const info = await inspectDocument(bytes, password).promise;
        return { name: file.name, bytes, password, pageCount: info.pageCount, range: '' };
      } catch (err) {
        if (/password|encrypt/i.test((err as Error).message) || (err as Error).name === 'EncryptedPDFError') {
          const pw = await askPassword(file.name, attempt > 0);
          if (pw === null) return null;
          password = pw;
        } else {
          await showMessage(t.errors.title, fmt(t.errors.invalid, { name: file.name }));
          return null;
        }
      }
    }
  }
  // image : JPEG et PNG directement ; le reste doit pouvoir être décodé par le navigateur
  const known = (bytes[0] === 0xff && bytes[1] === 0xd8) || (bytes[0] === 0x89 && bytes[1] === 0x50);
  if (!known) {
    try {
      (await createImageBitmap(new Blob([bytes.slice()]))).close();
    } catch {
      await showMessage(t.errors.title, fmt(t.combine.unsupportedImage, { name: file.name }));
      return null;
    }
  }
  return { name: file.name, bytes, pageCount: null, range: '' };
}

export function openCombineDialog(host: ToolsHost, current?: Session): void {
  const rows: Row[] = current ? [{ name: current.name, bytes: current.history.current, password: current.password, pageCount: current.view.pageCount, range: '', fromViewer: true }] : [];
  const list = h('ul', { class: 'combine-list', id: 'combine-list' });
  const summary = h('p', { class: 'hint', id: 'combine-summary' });
  const error = h('p', { class: 'dialog-error', id: 'combine-error', role: 'alert' });
  const keep = h('input', { type: 'checkbox', id: 'combine-bookmarks', checked: true });
  const goBtn = h('button', { id: 'combine-go', class: 'primary', type: 'button' }, t.combine.go);

  const render = () => {
    list.replaceChildren();
    if (rows.length === 0) list.append(h('li', { class: 'empty' }, t.combine.empty));
    rows.forEach((row, i) => {
      const range = h('input', { type: 'text', class: 'range-input', placeholder: t.combine.rangePlaceholder, value: row.range, 'aria-label': `${t.combine.rangeLabel} — ${row.name}`, disabled: row.pageCount === null });
      range.oninput = () => ((row.range = range.value), updateSummary());
      list.append(
        h(
          'li',
          { class: 'combine-row', 'data-name': row.name },
          h('span', { class: 'combine-name', title: row.name }, row.name),
          h('span', { class: 'combine-meta' }, row.pageCount === null ? t.combine.image : plural(row.pageCount, t.combine.pages)),
          range,
          h('button', { type: 'button', class: 'mini', title: t.combine.up, 'aria-label': t.combine.up, disabled: i === 0, onclick: () => move(i, -1) }, '↑'),
          h('button', { type: 'button', class: 'mini', title: t.combine.down, 'aria-label': t.combine.down, disabled: i === rows.length - 1, onclick: () => move(i, 1) }, '↓'),
          h('button', { type: 'button', class: 'mini', title: t.combine.remove, 'aria-label': t.combine.remove, onclick: () => (rows.splice(i, 1), render()) }, '✕'),
        ),
      );
    });
    updateSummary();
    goBtn.disabled = rows.length === 0;
    error.textContent = '';
  };
  const updateSummary = () => {
    const pages = rows.reduce((n, r) => {
      if (r.pageCount === null) return n + 1;
      const parsed = r.range.trim() ? parseRanges(r.range, r.pageCount) : null;
      return n + (parsed?.ok ? rangesToIndices(parsed.ranges).length : r.pageCount);
    }, 0);
    summary.textContent = rows.length ? fmt(t.combine.total, { files: rows.length, pages }) : '';
  };
  const move = (i: number, d: number) => {
    [rows[i], rows[i + d]] = [rows[i + d], rows[i]];
    render();
  };

  const addBtn = h('button', { type: 'button', id: 'combine-add', onclick: () => void add() }, t.combine.add);
  const add = async () => {
    const files = await pickPdfsAndImages();
    addBtn.disabled = goBtn.disabled = true; // pas de « Combiner » pendant la lecture des fichiers
    try {
      for (const file of files) {
        summary.textContent = fmt(t.combine.reading, { name: file.name });
        const row = await readFile(file);
        if (row) rows.push(row);
      }
    } finally {
      addBtn.disabled = false;
      render();
    }
  };

  const dlg = modal((close) => [
    h('h2', {}, t.combine.title),
    h('p', { class: 'hint' }, t.combine.hint),
    list,
    h('div', { class: 'combine-tools' }, addBtn, summary),
    h('label', { class: 'check' }, keep, t.combine.keepBookmarks),
    error,
    h('div', { class: 'dialog-actions' }, h('button', { type: 'button', id: 'combine-cancel', onclick: close }, t.combine.cancel), goBtn),
  ]);
  dlg.id = 'dialog-combine';
  dlg.classList.add('wide');

  goBtn.onclick = async () => {
    const sources: MergeSource[] = [];
    for (const row of rows) {
      let pages: number[] | undefined;
      if (row.pageCount !== null && row.range.trim()) {
        const r = parseRanges(row.range, row.pageCount);
        if (!r.ok) {
          error.textContent = fmt(t.combine.rangeError, { name: row.name, token: r.token, total: row.pageCount });
          return;
        }
        pages = rangesToIndices(r.ranges);
      }
      sources.push({ name: row.name, bytes: row.bytes, password: row.password, pages, expectedPages: row.fromViewer ? (row.pageCount ?? undefined) : undefined });
    }
    dlg.close();
    const handle = mergeOperation(sources, { keepBookmarks: keep.checked }, (f) => setProgress(f));
    const setProgress = host.busy(t.combine.working, () => handle.cancel());
    try {
      const result = await handle.promise;
      host.idle();
      await host.openNew(t.combine.resultName, result.bytes);
      toast(fmt(t.combine.done, { name: t.combine.resultName, n: result.pageCount }));
    } catch (err) {
      host.idle();
      if (err instanceof Cancelled) toast(t.busy.cancelled);
      else if ((err as Error).name === 'structure') await showMessage(t.errors.title, fmt(t.combine.failed, { detail: t.editErrors.codes.structure }));
      else if ((err as Error).name === 'unsupportedImage') await showMessage(t.errors.title, fmt(t.combine.unsupportedImage, { name: (err as Error & { file?: string }).file ?? '' }));
      else await showMessage(t.errors.title, fmt(t.combine.failed, { detail: (err as Error).message }));
    }
  };
  render();
}

// ───────────── Diviser ─────────────

type Mode = 'ranges' | 'every' | 'bookmarks';

export function openSplitDialog(host: ToolsHost, s: Session): void {
  const total = s.view.pageCount;
  const base = sanitizeFileName(s.name.replace(/\.pdf$/i, ''));
  let mode: Mode = 'ranges';
  let bookmarks: { title: string; page: number }[] = [];

  const modeInputs = (['ranges', 'every', 'bookmarks'] as Mode[]).map((m) => {
    const input = h('input', { type: 'radio', name: 'split-mode', value: m, id: `split-mode-${m}`, checked: m === mode });
    input.onchange = () => ((mode = m), update());
    return { m, input };
  });
  const label = (m: Mode) => (m === 'ranges' ? t.split.modeRanges : m === 'every' ? t.split.modeEvery : t.split.modeBookmarks);
  const rangesInput = h('input', { type: 'text', id: 'split-ranges', placeholder: '1-3, 4-6, 7-', value: '', 'aria-label': t.split.rangesLabel });
  const everyInput = h('input', { type: 'number', id: 'split-every', min: 1, max: total, value: Math.min(10, total), 'aria-label': t.split.everyLabel });
  const nameInput = h('input', { type: 'text', id: 'split-name', value: base, 'aria-label': t.split.baseName });
  const preview = h('ul', { class: 'split-preview', id: 'split-preview' });
  const info = h('p', { class: 'hint', id: 'split-info' });
  const error = h('p', { class: 'dialog-error', id: 'split-error', role: 'alert' });
  const zipBtn = h('button', { type: 'button', id: 'split-zip', class: 'primary' }, t.split.toZip);
  const tabsBtn = h('button', { type: 'button', id: 'split-tabs' }, t.split.toTabs);
  for (const i of [rangesInput, everyInput, nameInput]) i.addEventListener('input', () => update());

  let parts: { name: string; range: Range }[] = [];

  const compute = (): { ok: true; ranges: Range[]; titles?: string[] } | { ok: false; message: string } => {
    if (mode === 'ranges') {
      const r = parseRanges(rangesInput.value, total);
      if (r.ok) return { ok: true, ranges: r.ranges };
      return { ok: false, message: r.code === 'empty' ? '' : fmt(t.split.rangeError, { token: r.token, total }) };
    }
    if (mode === 'every') {
      const n = Math.floor(Number(everyInput.value));
      return n >= 1 ? { ok: true, ranges: splitEvery(total, n) } : { ok: false, message: '' };
    }
    if (bookmarks.length === 0) return { ok: false, message: t.split.noBookmarks };
    const starts = bookmarks.map((b) => b.page);
    const ranges = splitAtStarts(total, starts);
    // titre de chaque partie : le signet qui commence à sa première page (« Début » pour les pages avant le premier signet)
    const titles = ranges.map((r) => bookmarks.find((b) => b.page === r.from)?.title ?? '');
    return { ok: true, ranges, titles };
  };

  const update = () => {
    const c = compute();
    preview.replaceChildren();
    parts = [];
    error.textContent = '';
    info.textContent = '';
    if (!c.ok) {
      error.textContent = c.message;
    } else if (c.ranges.length > MAX_PARTS) {
      error.textContent = fmt(t.split.tooMany, { max: MAX_PARTS });
    } else {
      const stem = sanitizeFileName(nameInput.value, base);
      const raw = c.ranges.map((r, i) => {
        const suffix = c.titles?.[i] ? sanitizeFileName(c.titles[i], rangeLabel(r)) : fmt(r.from === r.to ? t.split.partPage : t.split.partPages, { range: rangeLabel(r) });
        return `${stem} - ${suffix}.pdf`;
      });
      const names = uniqueNames(raw);
      parts = c.ranges.map((range, i) => ({ name: names[i], range }));
      for (const p of parts) preview.append(h('li', {}, h('span', { class: 'combine-name' }, p.name), h('span', { class: 'combine-meta' }, `${p.range.to - p.range.from + 1} p.`)));
      info.textContent = plural(parts.length, t.split.preview);
    }
    rangesInput.disabled = mode !== 'ranges';
    everyInput.disabled = mode !== 'every';
    rangesRow.hidden = mode !== 'ranges';
    everyRow.hidden = mode !== 'every';
    zipBtn.disabled = parts.length === 0;
    tabsBtn.disabled = parts.length === 0 || parts.length > MAX_TABS;
    tabsBtn.textContent = parts.length > MAX_TABS ? t.split.tabsLimit : t.split.toTabs;
    modeInputs.find((x) => x.m === 'bookmarks')!.input.disabled = bookmarks.length === 0;
  };

  const rangesRow = h('label', { class: 'form-row' }, t.split.rangesLabel, rangesInput);
  const everyRow = h('label', { class: 'form-row' }, t.split.everyLabel, everyInput);
  const dlg = modal((close) => [
    h('h2', {}, t.split.title),
    h('div', { class: 'split-modes' },
      ...modeInputs.map(({ m, input }) => h('label', { class: 'check' }, input, label(m))),
    ),
    rangesRow,
    everyRow,
    h('label', { class: 'form-row' }, t.split.baseName, nameInput),
    info,
    preview,
    error,
    h('div', { class: 'dialog-actions' }, h('button', { type: 'button', id: 'split-cancel', onclick: close }, t.split.cancel), tabsBtn, zipBtn),
  ]);
  dlg.id = 'dialog-split';
  dlg.classList.add('wide');
  update();
  void bookmarksOperation(s.history.current, s.password).promise.then(
    (b) => ((bookmarks = b), update()),
    () => undefined,
  );

  const run = async (toZip: boolean) => {
    const chosen = parts.slice();
    dlg.close();
    let current: { cancel: () => void } = splitOperation(s.history.current, chosen.map((p) => p.range), chosen.map((p) => p.name), s.password, total, (f) => setProgress(f));
    const first = current as ReturnType<typeof splitOperation>;
    const setProgress = host.busy(t.split.working, () => current.cancel()); // Annuler vise l'étape en cours (découpe, puis zip)
    try {
      const result = await first.promise;
      if (toZip) {
        const zipHandle = zipOperation(result);
        current = zipHandle;
        const zip = await zipHandle.promise;
        host.idle();
        const zipName = `${sanitizeFileName(nameInput.value, base)}.zip`;
        downloadBytes(zipName, zip, 'application/zip');
        toast(fmt(t.split.zipDone, { name: zipName, n: result.length }));
      } else {
        host.idle();
        for (const p of result) await host.openNew(p.name, p.bytes);
        toast(fmt(t.split.partsOpened, { n: result.length }));
      }
    } catch (err) {
      host.idle();
      if (err instanceof Cancelled) toast(t.busy.cancelled);
      else await showMessage(t.errors.title, fmt(t.split.failed, { detail: (err as Error).message === 'structure' ? t.editErrors.codes.structure : (err as Error).message }));
    }
  };
  zipBtn.onclick = () => void run(true);
  tabsBtn.onclick = () => void run(false);
}
