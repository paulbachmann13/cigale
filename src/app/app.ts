import { classifyPdfError, hasPdfHeader } from '../data/pdf-files';
import { formatZoom, parseZoom, stepZoom } from '../data/zoom';
import { fmt, t } from '../i18n/fr';
import { loadPdf } from '../pdf/engine';
import { DocView, type ViewMode } from '../pdf/viewer';
import { forgetRecent, recentHandle, rememberFile } from '../storage/recent';
import { askPassword, showMessage } from './dialogs';
import { clear, h, toast } from './dom';
import { type PickedFile, filesFromDrop, pickPdfs, readFromHandle } from './files';
import { buildHome } from './home';
import { buildOutline } from './outline';
import type { Session } from './session';
import { loadSettings } from './settings';
import { ThumbnailPanel } from './thumbnails';

const FIT_VALUES = ['page-width', 'page-fit', 'page-actual'] as const;
const ZOOM_OPTIONS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 8];

export class App {
  readonly sessions: Session[] = [];
  private active: Session | null = null;
  private nextId = 1;
  private panelTab: 'thumbnails' | 'bookmarks' = 'thumbnails';
  private fileInput = h('input', { type: 'file', accept: 'application/pdf,.pdf', multiple: true, id: 'file-input', hidden: true });

  // éléments de l'interface
  private tabsEl = h('div', { class: 'tabs', role: 'tablist', 'aria-label': t.tabs.list });
  private homeEl: HTMLElement;
  private workspace = h('section', { id: 'workspace', hidden: true });
  private docsEl = h('div', { class: 'docs' });
  private leftPanel = h('aside', { class: 'left-panel', id: 'left-panel', 'aria-label': t.panels.label });
  private panelBody = h('div', { class: 'panel-body' });
  private pageInput = h('input', { type: 'number', id: 'page-input', min: 1, value: 1, 'aria-label': t.toolbar.goToPage });
  private pageCount = h('span', { id: 'page-count' });
  private zoomSelect = h('select', { id: 'zoom-select', 'aria-label': t.toolbar.zoom });
  private customZoomOption = h('option', { value: 'custom', hidden: true });
  private viewSelect = h('select', { id: 'view-mode', 'aria-label': t.toolbar.view });
  private findBar = h('div', { class: 'findbar', id: 'findbar', hidden: true, role: 'search' });
  private findInput = h('input', { type: 'search', id: 'find-input', placeholder: t.find.placeholder, 'aria-label': t.find.placeholder });
  private findCount = h('span', { id: 'find-count', 'aria-live': 'polite' });
  private findCase = h('input', { type: 'checkbox', id: 'find-case' });
  private findAccents = h('input', { type: 'checkbox', id: 'find-accents' });
  private loadingEl = h('div', { class: 'loading', id: 'loading', hidden: true, role: 'status' });
  private findTimer: number | undefined;

  constructor(private root: HTMLElement) {
    this.homeEl = buildHome(this);
    this.fileInput.addEventListener('change', () => {
      const files = Array.from(this.fileInput.files ?? []).map((file) => ({ file }));
      this.fileInput.value = '';
      this.openPicked(files);
    });
    this.buildShell();
    this.bindGlobalEvents();
    this.showHome();
  }

  // ───────────────────────── construction de l'interface ─────────────────────────

  private iconButton(id: string, label: string, text: string, onclick: () => void): HTMLButtonElement {
    return h('button', { id, class: 'tool', title: label, 'aria-label': label, type: 'button', onclick }, text);
  }

  private buildShell() {
    const homeTab = h('button', { class: 'tab home-tab', id: 'tab-home', role: 'tab', onclick: () => this.showHome() }, t.tabs.home);
    this.tabsEl.append(homeTab);

    const topbar = h(
      'header',
      { class: 'topbar' },
      h('span', { class: 'brand' }, h('img', { src: `${import.meta.env.BASE_URL}icon.svg`, alt: '', width: 22, height: 22 }), t.app.name),
      this.tabsEl,
      h('button', { id: 'btn-open', class: 'tool text', type: 'button', onclick: () => void this.openDialog() }, t.toolbar.open),
    );

    // barre d'outils du visualiseur
    const zoomPresets = [
      ...FIT_VALUES.map((v) =>
        h('option', { value: v }, v === 'page-width' ? t.toolbar.fitWidth : v === 'page-fit' ? t.toolbar.fitPage : t.toolbar.actualSize),
      ),
      ...ZOOM_OPTIONS.map((z) => h('option', { value: String(z) }, formatZoom(z))),
    ];
    this.zoomSelect.append(this.customZoomOption, ...zoomPresets);
    this.zoomSelect.onchange = () => this.active?.view.setZoom(this.zoomSelect.value === 'custom' ? this.active.view.scale : isFinite(Number(this.zoomSelect.value)) ? Number(this.zoomSelect.value) : this.zoomSelect.value);

    this.viewSelect.append(
      h('option', { value: 'continuous' }, t.toolbar.viewContinuous),
      h('option', { value: 'single' }, t.toolbar.viewSingle),
      h('option', { value: 'two-pages' }, t.toolbar.viewTwoPages),
    );
    this.viewSelect.onchange = () => this.active?.view.setViewMode(this.viewSelect.value as ViewMode);

    this.pageInput.onchange = () => {
      const n = Number(this.pageInput.value);
      if (this.active && Number.isFinite(n)) this.active.view.page = n;
    };

    const toolbar = h(
      'div',
      { class: 'toolbar', role: 'toolbar', 'aria-label': t.toolbar.label },
      this.iconButton('btn-panel', t.toolbar.leftPanel, '☰', () => this.togglePanel()),
      h('span', { class: 'sep' }),
      this.iconButton('btn-prev', t.toolbar.previousPage, '↑', () => this.goRelative(-1)),
      this.iconButton('btn-next', t.toolbar.nextPage, '↓', () => this.goRelative(1)),
      this.pageInput,
      this.pageCount,
      h('span', { class: 'sep' }),
      this.iconButton('btn-zoom-out', t.toolbar.zoomOut, '−', () => this.zoomStep(-1)),
      this.zoomSelect,
      this.iconButton('btn-zoom-in', t.toolbar.zoomIn, '+', () => this.zoomStep(1)),
      this.iconButton('btn-fit-width', t.toolbar.fitWidth, '↔', () => this.active?.view.setZoom('page-width')),
      this.iconButton('btn-fit-page', t.toolbar.fitPage, '⛶', () => this.active?.view.setZoom('page-fit')),
      h('span', { class: 'sep' }),
      this.viewSelect,
      this.iconButton('btn-rotate', t.toolbar.rotate, '⟳', () => this.active?.view.rotate()),
      h('span', { class: 'spacer' }),
      this.iconButton('btn-search', t.toolbar.search, '⌕', () => this.toggleFind()),
      this.iconButton('btn-fullscreen', t.toolbar.fullscreen, '⤢', () => this.toggleFullscreen()),
    );

    // volet gauche : miniatures / signets
    const panelTabs = h(
      'div',
      { class: 'panel-tabs', role: 'tablist' },
      h('button', { id: 'panel-tab-thumbnails', role: 'tab', onclick: () => this.setPanelTab('thumbnails') }, t.panels.thumbnails),
      h('button', { id: 'panel-tab-bookmarks', role: 'tab', onclick: () => this.setPanelTab('bookmarks') }, t.panels.bookmarks),
    );
    this.leftPanel.append(panelTabs, this.panelBody);

    // barre de recherche
    this.findInput.addEventListener('input', () => {
      window.clearTimeout(this.findTimer);
      this.findTimer = window.setTimeout(() => this.runFind(false), 150);
    });
    this.findInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        window.clearTimeout(this.findTimer);
        this.runFind(true, e.shiftKey);
      } else if (e.key === 'Escape') this.closeFind();
    });
    const optionChanged = () => this.runFind(false);
    this.findCase.onchange = optionChanged;
    this.findAccents.onchange = optionChanged;
    this.findBar.append(
      this.findInput,
      this.iconButton('find-prev', t.find.previous, '↑', () => this.runFind(true, true)),
      this.iconButton('find-next', t.find.next, '↓', () => this.runFind(true)),
      h('label', { class: 'check' }, this.findCase, t.find.matchCase),
      h('label', { class: 'check' }, this.findAccents, t.find.diacritics),
      this.findCount,
      this.iconButton('find-close', t.find.close, '✕', () => this.closeFind()),
    );

    const center = h('div', { class: 'center' }, this.findBar, this.docsEl);
    this.workspace.append(toolbar, h('div', { class: 'body' }, this.leftPanel, center));

    // fenêtre d'ouverture (progression + annulation)
    this.root.append(topbar, this.homeEl, this.workspace, this.fileInput, this.loadingEl);
    this.setPanelTab('thumbnails');
    if (window.innerWidth < 760) this.leftPanel.classList.add('collapsed');
  }

  // ───────────────────────── événements globaux ─────────────────────────

  private bindGlobalEvents() {
    document.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('dragover', (e) => {
      if (e.dataTransfer?.types.includes('Files')) {
        e.preventDefault();
        document.body.classList.add('dragging');
      }
    });
    window.addEventListener('dragleave', (e) => {
      if (e.relatedTarget === null) document.body.classList.remove('dragging');
    });
    window.addEventListener('drop', (e) => {
      document.body.classList.remove('dragging');
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      void filesFromDrop(e.dataTransfer).then((files) => this.openPicked(files));
    });
    // « Ouvrir avec » (PWA installée)
    const lq = (window as unknown as { launchQueue?: { setConsumer: (cb: (p: { files: FileSystemFileHandle[] }) => void) => void } }).launchQueue;
    lq?.setConsumer((params) => {
      void Promise.all(params.files.map(async (handle) => ({ file: await handle.getFile(), handle }))).then((f) => this.openPicked(f));
    });
  }

  private onKeyDown(e: KeyboardEvent) {
    const mod = e.metaKey || e.ctrlKey;
    const target = e.target as HTMLElement;
    const typing = target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement;
    if (document.querySelector('dialog[open]')) return;
    const view = this.active?.view;

    if (mod && e.key.toLowerCase() === 'o') {
      e.preventDefault();
      void this.openDialog();
    } else if (mod && e.key.toLowerCase() === 'f' && view && !this.workspace.hidden) {
      e.preventDefault();
      this.openFind();
    } else if (mod && e.key.toLowerCase() === 'g' && view && !this.findBar.hidden) {
      e.preventDefault();
      this.runFind(true, e.shiftKey);
    } else if (mod && e.shiftKey && e.key.toLowerCase() === 'r' && view) {
      e.preventDefault();
      view.rotate();
    } else if (mod && view && (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd')) {
      e.preventDefault();
      this.zoomStep(1);
    } else if (mod && view && (e.key === '-' || e.code === 'NumpadSubtract')) {
      e.preventDefault();
      this.zoomStep(-1);
    } else if (mod && view && (e.code === 'Digit0' || e.code === 'Numpad0')) {
      e.preventDefault();
      view.setZoom('page-fit');
    } else if (mod && view && (e.code === 'Digit1' || e.code === 'Numpad1')) {
      e.preventDefault();
      view.setZoom('page-actual');
    } else if (mod && view && (e.code === 'Digit2' || e.code === 'Numpad2')) {
      e.preventDefault();
      view.setZoom('page-width');
    } else if (e.key === 'Escape' && !this.findBar.hidden) {
      this.closeFind();
    } else if (view && !typing && !mod && !this.workspace.hidden) {
      // Navigation en mode « page par page » : le défilement natif ne change pas de page.
      if (view.isPagedMode) {
        const next = e.key === 'PageDown' || e.key === 'ArrowRight' || (e.key === ' ' && !e.shiftKey);
        const prev = e.key === 'PageUp' || e.key === 'ArrowLeft' || (e.key === ' ' && e.shiftKey);
        if (next) (e.preventDefault(), this.goRelative(1));
        else if (prev) (e.preventDefault(), this.goRelative(-1));
      }
      if (e.key === 'Home' && view.isPagedMode) (e.preventDefault(), (view.page = 1));
      if (e.key === 'End' && view.isPagedMode) (e.preventDefault(), (view.page = view.pageCount));
    }
  }

  // ───────────────────────── ouverture des fichiers ─────────────────────────

  async openDialog(): Promise<void> {
    this.openPicked(await pickPdfs(this.fileInput));
  }

  openPicked(files: PickedFile[]): void {
    void (async () => {
      for (const f of files) await this.openFile(f.file, f.handle, files.length > 1);
    })();
  }

  /** Rouvre un fichier de la liste « Récents ». */
  async openRecent(id: string, name: string): Promise<void> {
    const handle = await recentHandle(id);
    if (!handle) {
      await this.openDialog();
      return;
    }
    let file: File | null = null;
    try {
      file = await readFromHandle(handle);
    } catch {
      file = null;
    }
    if (!file) {
      await forgetRecent(id);
      this.refreshHome();
      await showMessage(t.errors.title, fmt(t.errors.permission, { name }));
      return;
    }
    await this.openFile(file, handle, false);
  }

  private async openFile(file: File, handle: FileSystemFileHandle | undefined, quiet: boolean): Promise<void> {
    const name = file.name;
    const startedAt = performance.now();
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await file.arrayBuffer());
    } catch (err) {
      await showMessage(t.errors.title, fmt(t.errors.unknown, { name, detail: String((err as Error).message ?? err) }));
      return;
    }
    if (bytes.length === 0) return void (await showMessage(t.errors.title, fmt(t.errors.empty, { name })));
    if (!hasPdfHeader(bytes)) {
      if (quiet) toast(fmt(t.toast.notPdf, { name }));
      else await showMessage(t.errors.title, fmt(t.errors.notPdf, { name }));
      return;
    }

    let cancelled = false;
    this.showLoading(name, () => {
      cancelled = true;
      handleLoad.cancel();
    });
    const handleLoad = loadPdf(bytes, { password: (incorrect) => askPassword(name, incorrect) });
    try {
      const pdf = await handleLoad.promise;
      this.hideLoading();
      await this.addSession(name, bytes, handle, pdf, startedAt);
      void rememberFile(name, bytes.length, handle).then(() => this.refreshHome());
    } catch (err) {
      this.hideLoading();
      if (cancelled || classifyPdfError(err) === 'password') return void toast(t.loading.cancelled);
      const kind = classifyPdfError(err);
      const msg =
        kind === 'invalid'
          ? fmt(t.errors.invalid, { name })
          : kind === 'unsupportedEncryption'
            ? fmt(t.errors.unsupportedEncryption, { name })
            : fmt(t.errors.unknown, { name, detail: String((err as Error)?.message ?? err) });
      await showMessage(t.errors.title, msg);
    }
  }

  private showLoading(name: string, onCancel: () => void) {
    clear(this.loadingEl);
    this.loadingEl.append(
      h('div', { class: 'loading-box' }, h('p', {}, fmt(t.loading.opening, { name })), h('progress', {}), h('button', { id: 'loading-cancel', onclick: onCancel }, t.loading.cancel)),
    );
    this.loadingEl.hidden = false;
  }
  private hideLoading() {
    this.loadingEl.hidden = true;
  }

  private async addSession(name: string, bytes: Uint8Array, handle: FileSystemFileHandle | undefined, pdf: import('pdfjs-dist').PDFDocumentProxy, startedAt: number) {
    const settings = loadSettings();
    this.homeEl.hidden = true;
    this.workspace.hidden = false;
    this.sessions.forEach((x) => (x.view.root.hidden = true));
    const view = new DocView(pdf, settings.defaultZoom, startedAt, this.docsEl);
    const id = this.nextId++;
    const thumbs = new ThumbnailPanel(pdf, (n) => (view.page = n));
    const outline = await buildOutline(pdf, view.linkService);
    const tab = h(
      'div',
      { class: 'tab doc-tab', role: 'tab', 'data-session': id, onauxclick: (e: MouseEvent) => e.button === 1 && this.close(id) },
      h('button', { class: 'tab-label', onclick: () => this.activate(id), title: name }, name),
      h('button', { class: 'tab-close', 'aria-label': fmt(t.tabs.close, { name }), onclick: () => this.close(id) }, '✕'),
    );
    const session: Session = { id, name, size: bytes.length, bytes, handle, view, thumbs, outline, tab };
    this.sessions.push(session);
    this.tabsEl.append(tab);
    this.bindView(session);
    this.activate(id);
  }

  private bindView(s: Session) {
    const view = s.view;
    const eventBus = view.eventBus;
    eventBus.on('pagechanging', ({ pageNumber }: { pageNumber: number }) => {
      if (this.active === s) this.updatePageUi(s);
      s.thumbs.setCurrent(pageNumber);
    });
    eventBus.on('scalechanging', () => this.active === s && this.updateZoomUi(s));
    eventBus.on('updatefindmatchescount', ({ matchesCount }: { matchesCount: { current: number; total: number } }) => this.active === s && this.showFindCount(matchesCount));
    eventBus.on('updatefindcontrolstate', ({ state, matchesCount }: { state: number; matchesCount: { current: number; total: number } }) => {
      if (this.active !== s) return;
      this.findInput.classList.toggle('not-found', state === 1);
      if (state === 1) this.findCount.textContent = t.find.notFound;
      else if (state === 3) this.findCount.textContent = t.find.pending;
      else this.showFindCount(matchesCount);
    });
    // zoom au pincement (tactile) et à Ctrl + molette (pavé tactile)
    const c = view.container;
    c.addEventListener(
      'wheel',
      (e) => {
        if (!e.ctrlKey) return;
        e.preventDefault();
        view.zoomBy(Math.exp(-e.deltaY * 0.01), [e.clientX, e.clientY]);
      },
      { passive: false },
    );
    let lastDist = 0;
    const dist = (ev: TouchEvent) => Math.hypot(ev.touches[0].clientX - ev.touches[1].clientX, ev.touches[0].clientY - ev.touches[1].clientY);
    c.addEventListener('touchstart', (e) => void (e.touches.length === 2 && (lastDist = dist(e))), { passive: true });
    c.addEventListener(
      'touchmove',
      (e) => {
        if (e.touches.length !== 2 || !lastDist) return;
        const d = dist(e);
        const ratio = d / lastDist;
        if (Math.abs(ratio - 1) < 0.01) return;
        e.preventDefault();
        lastDist = d;
        view.zoomBy(ratio, [(e.touches[0].clientX + e.touches[1].clientX) / 2, (e.touches[0].clientY + e.touches[1].clientY) / 2]);
      },
      { passive: false },
    );
    c.addEventListener('touchend', () => (lastDist = 0), { passive: true });
  }

  // ───────────────────────── onglets et vues ─────────────────────────

  showHome(): void {
    this.homeEl.hidden = false;
    this.workspace.hidden = true;
    this.tabsEl.querySelectorAll('.tab').forEach((el) => el.classList.remove('active'));
    this.tabsEl.querySelector('.home-tab')?.classList.add('active');
    this.root.dataset.view = 'home';
    document.title = `${t.app.name} — ${t.app.tagline}`;
    this.refreshHome();
  }

  refreshHome(): void {
    const fresh = buildHome(this);
    this.homeEl.replaceWith(fresh);
    this.homeEl = fresh;
    this.homeEl.hidden = this.root.dataset.view !== 'home';
  }

  activate(id: number): void {
    const s = this.sessions.find((x) => x.id === id);
    if (!s) return;
    this.active = s;
    this.homeEl.hidden = true;
    this.workspace.hidden = false;
    this.root.dataset.view = 'viewer';
    this.sessions.forEach((x) => (x.view.root.hidden = x !== s));
    this.tabsEl.querySelectorAll('.tab').forEach((el) => el.classList.toggle('active', el === s.tab));
    document.title = `${s.name} — ${t.app.name}`;
    this.closeFind();
    this.renderPanel();
    this.updatePageUi(s);
    this.updateZoomUi(s);
    this.viewSelect.value = s.view.isPagedMode ? 'single' : s.view.viewer.spreadMode === 1 ? 'two-pages' : 'continuous';
    s.view.viewer.update();
    s.view.container.focus({ preventScroll: true });
  }

  close(id: number): void {
    const i = this.sessions.findIndex((x) => x.id === id);
    if (i < 0) return;
    const [s] = this.sessions.splice(i, 1);
    s.thumbs.destroy();
    s.view.destroy();
    s.tab.remove();
    if (this.active === s) {
      this.active = null;
      const next = this.sessions[Math.min(i, this.sessions.length - 1)];
      if (next) this.activate(next.id);
      else this.showHome();
    }
  }

  // ───────────────────────── panneau, zoom, pages ─────────────────────────

  private togglePanel() {
    this.leftPanel.classList.toggle('collapsed');
  }

  private setPanelTab(tab: 'thumbnails' | 'bookmarks') {
    this.panelTab = tab;
    this.leftPanel.querySelectorAll('.panel-tabs button').forEach((b) => b.classList.toggle('active', b.id === `panel-tab-${tab}`));
    this.leftPanel.querySelectorAll('.panel-tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.id === `panel-tab-${tab}`)));
    this.renderPanel();
  }

  private renderPanel() {
    this.panelBody.replaceChildren();
    const s = this.active;
    if (!s) return;
    this.panelBody.append(this.panelTab === 'thumbnails' ? s.thumbs.el : s.outline);
    if (this.panelTab === 'thumbnails') s.thumbs.setCurrent(s.view.page);
  }

  private goRelative(delta: number) {
    const v = this.active?.view;
    if (!v) return;
    v.page = v.page + delta * (v.viewer.spreadMode === 1 ? 2 : 1);
  }

  private zoomStep(dir: 1 | -1) {
    const v = this.active?.view;
    if (v) v.setZoom(stepZoom(v.scale, dir));
  }

  private updatePageUi(s: Session) {
    this.pageInput.value = String(s.view.page);
    this.pageInput.max = String(s.view.pageCount);
    this.pageCount.textContent = fmt(t.toolbar.pageOf, { total: s.view.pageCount });
  }

  private updateZoomUi(s: Session) {
    const preset = s.view.scaleValue;
    if ((FIT_VALUES as readonly string[]).includes(preset)) {
      this.zoomSelect.value = preset;
    } else {
      this.customZoomOption.textContent = formatZoom(s.view.scale);
      this.customZoomOption.value = 'custom';
      this.zoomSelect.value = 'custom';
      const exact = ZOOM_OPTIONS.find((z) => Math.abs(z - s.view.scale) < 0.005);
      if (exact) this.zoomSelect.value = String(exact);
    }
    // texte lisible même quand une valeur « ajustée » est active
    this.zoomSelect.title = `${t.toolbar.zoom} : ${formatZoom(s.view.scale)}`;
  }

  private toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void this.root.requestFullscreen?.();
  }

  // ───────────────────────── recherche ─────────────────────────

  private toggleFind() {
    if (this.findBar.hidden) this.openFind();
    else this.closeFind();
  }

  private openFind() {
    if (!this.active) return;
    this.findBar.hidden = false;
    this.findInput.focus();
    this.findInput.select();
    if (this.findInput.value) this.runFind(false);
  }

  private closeFind() {
    if (this.findBar.hidden) return;
    this.findBar.hidden = true;
    this.findCount.textContent = '';
    this.findInput.classList.remove('not-found');
    this.sessions.forEach((s) => s.view.clearFind());
    this.active?.view.container.focus({ preventScroll: true });
  }

  private runFind(again: boolean, backwards = false) {
    const v = this.active?.view;
    if (!v) return;
    const query = this.findInput.value;
    if (!query) {
      v.clearFind();
      this.findCount.textContent = '';
      return;
    }
    v.find(query, { caseSensitive: this.findCase.checked, matchDiacritics: this.findAccents.checked, again, backwards });
  }

  private showFindCount(m: { current: number; total: number }) {
    this.findCount.textContent = m.total > 0 ? fmt(t.find.count, { current: m.current, total: m.total }) : t.find.notFound;
  }
}
