import { COLORS, type Annot, STAMPS, type Rgb, rgbToCss } from '../data/annotations';
import { History } from '../data/history';
import { classifyPdfError, hasPdfHeader } from '../data/pdf-files';
import { formatZoom, stepZoom } from '../data/zoom';
import { fmt, plural, t } from '../i18n/fr';
import { loadPdf } from '../pdf/engine';
import { listAnnotationsOp } from '../pdf/ops-client';
import { DocView, type ViewMode } from '../pdf/viewer';
import { deleteBackupsNamed } from '../storage/backups';
import { deleteDraft, listDrafts, newDraftId, readDraft, saveDraft } from '../storage/autosave';
import { forgetRecent, recentHandle, rememberFile } from '../storage/recent';
import { type AnnotHost, Annotator, type Style, type Tool } from './annotator';
import { CommentsPanel } from './comments';
import { hasFormFields } from './forms';
import { askPassword, askUnsaved, confirmDialog, showMessage } from './dialogs';
import { clear, h, toast } from './dom';
import { Editing } from './editing';
import { type PickedFile, filesFromDrop, pickPdfs, readFromHandle } from './files';
import { buildHome, openSettings, openVersions, openWhatsNew } from './home';
import { type IconName, icon } from './icons';
import { type MenuItem, showMenu } from './menu';
import { buildOutline } from './outline';
import { printDocument } from './print';
import { destroyWindow, isTauri, onCloseRequested, onFinderOpen, onQuitRequest, quitApp, takeStartupOpens, tauriHandleFromPath } from './tauri-files';
import { PageList } from './pagelist';
import { openCombineDialog, openSplitDialog } from './tools';
import { openExportImagesDialog } from './export-images';
import { openOcrDialog } from './ocr';
import { applyRedaction } from './redact';
import { askSignature } from './signature';
import { openCropDialog, openProtectDialog, openHeaderFooterDialog, openWatermarkDialog } from './page-tools';
import { type Session, isDirty } from './session';
import { loadSettings } from './settings';

const FIT_VALUES = ['page-width', 'page-fit', 'page-actual'] as const;
const ZOOM_OPTIONS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 8];
const PANEL_THUMB = 132;
const GRID_THUMB_DEFAULT = 170;

const isDirtyForm = (s: Session) => s.formModified;
const isMac = /Mac|iPhone|iPad/.test(navigator.platform) || /Mac OS/.test(navigator.userAgent);
const mod = isMac ? '⌘' : 'Ctrl+';

export class App {
  readonly sessions: Session[] = [];
  private active: Session | null = null;
  private nextId = 1;
  private panelTab: 'thumbnails' | 'bookmarks' | 'comments' = 'thumbnails';
  private annotTool: Tool | null = null;
  private annotStyle: Style = { color: [0.85, 0.15, 0.15], width: 2, fontSize: 14, stamp: 'approved' };
  private annotBar = h('div', { class: 'toolbar annot-toolbar', id: 'annot-toolbar', role: 'toolbar', 'aria-label': t.annot.toolbar, hidden: true });
  private toolButtons: Record<string, HTMLButtonElement> = {};
  private widthSelect = h('select', { id: 'annot-width', 'aria-label': t.annot.width });
  private sizeSelect = h('select', { id: 'annot-size', 'aria-label': t.annot.fontSize });
  private swatches: HTMLButtonElement[] = [];
  private toolColors: Partial<Record<Tool, Rgb>> = { highlight: COLORS[0].rgb, underline: COLORS[3].rgb, strikeout: COLORS[3].rgb };
  private commentsBadge = h('span', { class: 'panel-badge', id: 'comments-badge', hidden: true });
  private commentsTabBtn = h('button', { id: 'panel-tab-comments', role: 'tab' }, t.annot.panel);
  private fileInput = h('input', { type: 'file', accept: 'application/pdf,.pdf', multiple: true, id: 'file-input', hidden: true });
  private editing: Editing;

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
  private formBanner = h('div', { class: 'form-banner', id: 'form-banner', hidden: true, role: 'status' });
  private statusEl = h('span', { class: 'topbar-status', id: 'status', role: 'status' });
  private fileButton = h('button', { class: 'topbar-file', id: 'file-menu', type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false' }, t.file.menu);
  private thumbSize = h('input', { type: 'range', id: 'thumb-size', min: 90, max: 320, step: 10, value: GRID_THUMB_DEFAULT, 'aria-label': t.pages.thumbSize });
  private selectionInfo = h('span', { class: 'selection-info', id: 'selection-info', 'aria-live': 'polite' });
  private editButtons: Record<string, HTMLButtonElement> = {};
  private findTimer: number | undefined;
  private closing = false;
  private signature: { png: Uint8Array; width: number; height: number } | null = null;
  private formDismissed = new Set<number>();
  private redactApplyBtn = h('button', { class: 'primary', id: 'redact-apply', type: 'button', hidden: true, onclick: () => void this.applyRedactionNow() }, t.docTools.redactApply);

  constructor(private root: HTMLElement) {
    this.homeEl = buildHome(this);
    this.editing = new Editing({
      reload: (s, bytes, selection) => this.reload(s, bytes, selection),
      openNew: (name, bytes) => this.openBytes(name, bytes, { unsaved: true }),
      refresh: (s) => this.refreshState(s),
      busy: (text, onCancel) => this.showOverlay(text, onCancel),
      idle: () => this.hideLoading(),
      setStatus: (text) => this.setStatus(text, ''),
      rememberOpened: (s) => void rememberFile(s.name, s.history.current.length, s.handle).then(() => this.refreshHome()),
      pendingSelect: (s, id) => (s.pendingSelect = id),
      author: () => loadSettings().author || t.annot.defaultAuthor,
      forgetOriginal: (s) => this.forgetOriginal(s),
      resetHistory: async (s) => {
        s.history = new History(s.history.current, false);
        this.refreshState(s);
      },
    });
    this.fileInput.addEventListener('change', () => {
      const files = Array.from(this.fileInput.files ?? []).map((file) => ({ file }));
      this.fileInput.value = '';
      this.openPicked(files);
    });
    this.buildShell();
    this.bindGlobalEvents();
    this.showHome();
    void listDrafts().then((d) => d.length && toast(t.home.resumeFound));
  }

  // ───────────────────────── construction de l'interface ─────────────────────────

  private iconButton(id: string, label: string, content: string | IconName, onclick: () => void): HTMLButtonElement {
    const isIcon = content.length > 1 && /^[a-zA-Z]+$/.test(content);
    const btn = h('button', { id, class: 'tool', title: label, 'aria-label': label, type: 'button', onclick });
    btn.append(isIcon ? icon(content as IconName) : document.createTextNode(content));
    return btn;
  }

  private editButton(id: string, label: string, name: IconName, run: () => void): HTMLButtonElement {
    const b = this.iconButton(id, label, name, run);
    this.editButtons[id] = b;
    return b;
  }

  private buildShell() {
    const homeTab = h('button', { class: 'tab home-tab', id: 'tab-home', role: 'tab', onclick: () => this.showHome() }, t.tabs.home);
    this.tabsEl.append(homeTab);
    this.fileButton.onclick = () => this.openFileMenu();

    const topbar = h(
      'header',
      { class: 'topbar' },
      this.fileButton,
      h('span', { class: 'brand' }, h('img', { src: `${import.meta.env.BASE_URL}icon.svg`, alt: '', width: 20, height: 20 }), t.app.name),
      this.tabsEl,
      this.statusEl,
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

    const insertBtn = this.editButton('btn-insert', t.pages.insert, 'insert', () => this.openInsertMenu(insertBtn));
    this.thumbSize.oninput = () => this.active?.grid?.setWidth(Number(this.thumbSize.value));

    const toolbar = h(
      'div',
      { class: 'toolbar', role: 'toolbar', 'aria-label': t.toolbar.label },
      this.iconButton('btn-panel', t.toolbar.leftPanel, 'panel', () => this.togglePanel()),
      this.iconButton('btn-save', `${t.file.save} (${mod}S)`, 'save', () => void this.save()),
      this.iconButton('btn-undo', `${t.pages.undo} (${mod}Z)`, 'undo', () => void this.undo()),
      this.iconButton('btn-redo', `${t.pages.redo} (${isMac ? '⇧⌘Z' : 'Ctrl+Y'})`, 'redo', () => void this.redo()),
      h('span', { class: 'sep' }),
      h('span', { class: 'nav-group' },
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
      ),
      h('span', { class: 'sep' }),
      this.editButton('btn-rot-left', `${t.pages.rotateLeft}`, 'rotateLeft', () => void this.withActive((s) => this.editing.rotate(s, -90))),
      this.editButton('btn-rot-right', `${t.pages.rotateRight}`, 'rotateRight', () => void this.withActive((s) => this.editing.rotate(s, 90))),
      this.editButton('btn-duplicate', t.pages.duplicate, 'duplicate', () => void this.withActive((s) => this.editing.duplicate(s))),
      this.editButton('btn-delete', `${t.pages.delete} (⌫)`, 'trash', () => void this.withActive((s) => this.editing.remove(s))),
      insertBtn,
      this.editButton('btn-extract', t.pages.extract, 'extract', () => void this.withActive((s) => this.editing.extract(s))),
      h('span', { class: 'sep' }),
      this.iconButton('btn-organize', t.pages.organize, 'grid', () => this.toggleOrganize()),
      this.iconButton('btn-comment', t.annot.mode, 'comment', () => this.toggleCommentMode()),
      this.iconButton('btn-tools', t.docTools.menu, 'tools', () => this.openToolsMenu()),
      this.thumbSize,
      this.selectionInfo,
      h('span', { class: 'spacer' }),
      this.iconButton('btn-search', t.toolbar.search, 'search', () => this.toggleFind()),
      this.iconButton('btn-fullscreen', t.toolbar.fullscreen, '⤢', () => this.toggleFullscreen()),
    );
    this.editButtons['btn-organize'] = toolbar.querySelector<HTMLButtonElement>('#btn-organize')!;
    this.buildAnnotBar();
    this.thumbSize.hidden = true;

    // volet gauche : miniatures / signets
    const panelTabs = h(
      'div',
      { class: 'panel-tabs', role: 'tablist' },
      h('button', { id: 'panel-tab-thumbnails', role: 'tab', onclick: () => this.setPanelTab('thumbnails') }, t.panels.thumbnails),
      h('button', { id: 'panel-tab-bookmarks', role: 'tab', onclick: () => this.setPanelTab('bookmarks') }, t.panels.bookmarks),
      this.commentsTabBtn,
    );
    this.commentsTabBtn.append(this.commentsBadge);
    this.commentsTabBtn.onclick = () => this.setPanelTab('comments');
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

    const center = h('div', { class: 'center' }, this.formBanner, this.findBar, this.docsEl);
    this.workspace.append(toolbar, this.annotBar, h('div', { class: 'body' }, this.leftPanel, center));

    this.root.append(topbar, this.homeEl, this.workspace, this.fileInput, this.loadingEl);
    this.setPanelTab('thumbnails');
    if (window.innerWidth < 760) this.leftPanel.classList.add('collapsed');
  }

  private openFileMenu() {
    const s = this.active;
    const has = !!s && !this.workspace.hidden;
    const items: MenuItem[] = [
      { id: 'home', label: t.file.home, run: () => this.showHome() },
      { id: 'open', label: t.file.open, shortcut: `${mod}O`, run: () => void this.openDialog(), separatorBefore: true },
      { id: 'combine', label: t.file.combine, run: () => this.openCombine(), separatorBefore: true },
      { id: 'split', label: t.file.split, disabled: !has, run: () => this.openSplit() },
      { id: 'save', label: t.file.save, shortcut: `${mod}S`, disabled: !has, run: () => void this.save(), separatorBefore: true },
      { id: 'save-as', label: t.file.saveAs, shortcut: isMac ? '⇧⌘S' : 'Ctrl+Maj+S', disabled: !has, run: () => void this.saveAs() },
      { id: 'print', label: t.file.print, shortcut: `${mod}P`, disabled: !has, run: () => void this.print() },
      { id: 'close', label: t.file.close, disabled: !has, run: () => s && void this.close(s.id), separatorBefore: true },
      ...(isTauri() ? [{ id: 'update', label: t.update.check, run: () => void this.checkForUpdates(false), separatorBefore: true }] : []),
      { id: 'versions', label: t.file.versions, run: () => openVersions(), separatorBefore: true },
      { id: 'settings', label: t.home.settings, run: () => openSettings(this) },
      { id: 'whats-new', label: t.home.whatsNew, run: () => openWhatsNew() },
    ];
    this.fileButton.setAttribute('aria-expanded', 'true');
    const menu = showMenu(items, this.fileButton, () => this.fileButton.setAttribute('aria-expanded', 'false'));
    menu.id = 'file-menu-list';
  }

  private openToolsMenu() {
    const s = this.active;
    if (!s) return;
    const anchor = this.workspace.querySelector<HTMLElement>('#btn-tools')!;
    showMenu(
      [
        { id: 'tool-watermark', label: t.docTools.watermark, run: () => openWatermarkDialog(s, this.editing) },
        { id: 'tool-headerfooter', label: t.docTools.headerFooter, run: () => openHeaderFooterDialog(s, this.editing) },
        { id: 'tool-crop', label: t.docTools.crop, run: () => openCropDialog(s, this.editing) },
        { id: 'tool-protect', label: t.docTools.protect, run: () => openProtectDialog(s, this.editing), separatorBefore: true },
        { id: 'tool-unprotect', label: t.docTools.unprotect, run: () => void this.confirmUnprotect(s) },
        { id: 'tool-redact', label: t.docTools.redact, run: () => this.startRedaction(), separatorBefore: true },
        { id: 'tool-ocr', label: t.docTools.ocr, run: () => openOcrDialog(s, this.editing, (text, onCancel) => this.showOverlay(text, onCancel), () => this.hideLoading()), separatorBefore: true },
        { id: 'tool-export-images', label: t.docTools.exportImages, run: () => openExportImagesDialog(s, this.editing, (text, onCancel) => this.showOverlay(text, onCancel), () => this.hideLoading()) },
      ],
      anchor,
    );
  }

  private async confirmUnprotect(s: Session) {
    if (await confirmDialog(t.docTools.unprotect, t.docTools.unprotectMessage, t.docTools.unprotectGo, t.docTools.cancel)) await this.editing.unprotect(s);
  }

  /** Caviardage : on marque les zones (outil « redact »), puis « Appliquer le caviardage » les noircit pour de bon. */
  private startRedaction() {
    this.setAnnotTool('redact');
  }

  private async applyRedactionNow() {
    const s = this.active;
    if (s) await applyRedaction(s, this.editing, (text, onCancel) => this.showOverlay(text, onCancel), () => this.hideLoading());
  }

  private toolsHost() {
    return {
      busy: (text: string, onCancel: () => void) => this.showOverlay(text, onCancel),
      idle: () => this.hideLoading(),
      openNew: (name: string, bytes: Uint8Array) => this.openBytes(name, bytes, { unsaved: true }),
    };
  }

  /** « Combiner des fichiers » : part du document affiché, s'il y en a un. */
  async openCombine(): Promise<void> {
    if (this.active && isDirtyForm(this.active)) await this.editing.flushForm(this.active);
    openCombineDialog(this.toolsHost(), !this.workspace.hidden ? (this.active ?? undefined) : undefined);
  }

  private async openSplit(): Promise<void> {
    if (this.active && isDirtyForm(this.active)) await this.editing.flushForm(this.active);
    if (this.active) openSplitDialog(this.toolsHost(), this.active);
  }

  private openInsertMenu(anchor: HTMLElement) {
    const none = (this.active?.selection.length ?? 0) === 0;
    showMenu(
      [
        { id: 'insert-blank-before', label: t.pages.insertBlankBefore, disabled: none, run: () => void this.withActive((s) => this.editing.insertBlank(s, 'before')) },
        { id: 'insert-blank-after', label: t.pages.insertBlankAfter, disabled: none, run: () => void this.withActive((s) => this.editing.insertBlank(s, 'after')) },
        { id: 'insert-file', label: t.pages.insertFile, run: () => void this.withActive((s) => this.editing.insertFromFile(s, 'after')), separatorBefore: true },
      ],
      anchor,
    );
  }

  private showPageMenu(x: number, y: number) {
    const s = this.active;
    if (!s) return;
    showMenu(
      [
        { id: 'rot-left', label: t.pages.rotateLeft, run: () => void this.editing.rotate(s, -90) },
        { id: 'rot-right', label: t.pages.rotateRight, run: () => void this.editing.rotate(s, 90) },
        { id: 'duplicate', label: t.pages.duplicate, run: () => void this.editing.duplicate(s), separatorBefore: true },
        { id: 'delete', label: t.pages.delete, shortcut: '⌫', run: () => void this.editing.remove(s) },
        { id: 'extract', label: t.pages.extract, run: () => void this.editing.extract(s) },
        { id: 'insert-blank-before', label: t.pages.insertBlankBefore, run: () => void this.editing.insertBlank(s, 'before'), separatorBefore: true },
        { id: 'insert-blank-after', label: t.pages.insertBlankAfter, run: () => void this.editing.insertBlank(s, 'after') },
        { id: 'insert-file', label: t.pages.insertFile, run: () => void this.editing.insertFromFile(s, 'after') },
        { id: 'move-start', label: t.pages.moveStart, run: () => void this.editing.moveToStart(s), separatorBefore: true },
        { id: 'move-end', label: t.pages.moveEnd, run: () => void this.editing.moveToEnd(s) },
        { id: 'move-to', label: t.pages.moveTo, run: () => void this.editing.moveTo(s) },
        { id: 'select-all', label: t.pages.selectAll, shortcut: `${mod}A`, run: () => this.listOf(s).selectAll(), separatorBefore: true },
      ],
      { x, y },
    );
  }

  // ───────────────────────── événements globaux ─────────────────────────

  private bindGlobalEvents() {
    document.addEventListener('keydown', (e) => this.onKeyDown(e));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.sessions.forEach((x) => this.scheduleDraft(x, true));
    });
    window.addEventListener('beforeunload', (e) => {
      if (this.sessions.some((s) => isDirty(s))) {
        e.preventDefault();
        e.returnValue = t.confirm.leavePage;
      }
    });
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
    const key = e.key.toLowerCase();

    if (mod && key === 'o') {
      e.preventDefault();
      void this.openDialog();
    } else if (mod && key === 's' && this.active && !this.workspace.hidden) {
      e.preventDefault();
      void (e.shiftKey ? this.saveAs() : this.save());
    } else if (mod && key === 'p' && this.active && !this.workspace.hidden) {
      e.preventDefault();
      void this.print();
    } else if (mod && key === 'z' && this.active && !typing && !this.workspace.hidden) {
      e.preventDefault();
      void (e.shiftKey ? this.redo() : this.undo());
    } else if (mod && key === 'y' && this.active && !typing && !this.workspace.hidden) {
      e.preventDefault();
      void this.redo();
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && this.active?.annotator.selection && !this.active.organizing && !typing && !this.workspace.hidden && !target.closest('.thumbs')) {
      e.preventDefault();
      void this.editing.removeAnnots(this.active, [this.active.annotator.selection.id]);
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && this.active && !typing && !this.workspace.hidden && (target.closest('.thumbs') || this.active.organizing)) {
      e.preventDefault();
      void this.editing.remove(this.active);
    } else if (mod && key === 'f' && view && !this.workspace.hidden) {
      e.preventDefault();
      this.openFind();
    } else if (mod && key === 'g' && view && !this.findBar.hidden) {
      e.preventDefault();
      this.runFind(true, e.shiftKey);
    } else if (mod && e.shiftKey && key === 'r' && view) {
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
    } else if (e.key === 'Escape' && this.annotTool && this.active) {
      if (this.annotTool === 'select') this.active.annotator.select(null);
      else this.setAnnotTool('select');
    } else if (view && !typing && !mod && !this.workspace.hidden && !target.closest('.thumbs')) {
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

  /** Application Mac : ouvre des chemins (double-clic dans le Finder, « Ouvrir avec »). */
  async openPaths(paths: string[]): Promise<void> {
    const files: PickedFile[] = [];
    for (const path of paths) {
      try {
        const handle = tauriHandleFromPath(path);
        files.push({ file: await handle.getFile(), handle });
      } catch (err) {
        await showMessage(t.errors.title, fmt(t.errors.unknown, { name: path.split('/').pop() ?? path, detail: String((err as Error).message ?? err) }));
      }
    }
    this.openPicked(files);
  }

  /** Branche ce qui n'existe que dans l'application Mac : fichiers du Finder et fermeture de la fenêtre. */
  async setupDesktop(): Promise<void> {
    this.announceNewVersion();
    if (!isTauri()) return;
    // vérification discrète des mises à jour, peu après le démarrage
    if (loadSettings().autoUpdate) window.setTimeout(() => void this.checkForUpdates(true), 5000);
    await onFinderOpen((paths) => void this.openPaths(paths));
    const startup = await takeStartupOpens();
    if (startup.length) void this.openPaths(startup);
    // Fermer la fenêtre (⌘W, bouton rouge, ⌘Q) : le navigateur n'affiche pas « beforeunload » ici, donc on demande nous-mêmes.
    await onCloseRequested(async (prevent) => {
      if (!this.sessions.some((x) => isDirty(x))) return;
      prevent();
      if (this.closing) return; // une question est déjà à l'écran
      this.closing = true;
      try {
        if (await this.confirmCloseAll()) await destroyWindow();
      } finally {
        this.closing = false;
      }
    });
    // ⌘Q passe par ici (il ne ferme pas la fenêtre : il arrête l'application)
    await onQuitRequest(async () => {
      if (this.closing) return;
      this.closing = true;
      try {
        if (await this.confirmCloseAll()) await quitApp();
      } finally {
        this.closing = false;
      }
    });
  }

  /** Après un caviardage : l'original n'est plus récupérable ni par « Annuler », ni par les sauvegardes, ni par les copies de sécurité. */
  private async forgetOriginal(s: Session): Promise<void> {
    window.clearTimeout(s.draftTimer);
    s.history = new History(s.history.current, false); // plus d'étapes à annuler ; reste « non enregistré »
    s.noBackup = true;
    await deleteBackupsNamed(s.name).catch(() => undefined);
    await saveDraft(s.draftId, s.name, s.history.current).catch(() => undefined); // le brouillon n'a plus que la version caviardée
    this.refreshState(s);
  }

  /** Cherche (et propose d'installer) une mise à jour. `silent` : au démarrage, sans rien dire s'il n'y a rien. */
  async checkForUpdates(silent: boolean): Promise<void> {
    if (!isTauri()) return;
    const { runUpdateCheck, tauriDeps } = await import('./updater');
    const deps = await tauriDeps(() => this.saveAllDraftsNow());
    await runUpdateCheck(deps, silent);
  }

  /** Avant un redémarrage (mise à jour) : le travail non enregistré est mis de côté, même si la sauvegarde automatique est réglée sur « non ». */
  private async saveAllDraftsNow(): Promise<void> {
    for (const s of this.sessions.filter((x) => isDirty(x))) {
      window.clearTimeout(s.draftTimer);
      await this.editing.flushForm(s); // la saisie en cours entre d'abord dans le document
      await saveDraft(s.draftId, s.name, s.history.current);
    }
  }

  /** Après une mise à jour : une fois, un message qui renvoie vers les nouveautés. */
  announceNewVersion(): void {
    try {
      const last = localStorage.getItem('cigale-last-version');
      localStorage.setItem('cigale-last-version', __APP_VERSION__);
      if (last && last !== __APP_VERSION__) toast(fmt(t.update.updatedTo, { version: __APP_VERSION__ }), { label: t.update.seeNews, run: () => openWhatsNew() });
    } catch {
      /* stockage indisponible : pas d'annonce */
    }
  }

  /** Pour chaque document modifié : « Enregistrer / Ne pas enregistrer / Annuler ». Faux si l'utilisateur annule. */
  async confirmCloseAll(): Promise<boolean> {
    for (const s of this.sessions.filter((x) => isDirty(x))) {
      this.activate(s.id);
      const answer = await askUnsaved(s.name);
      if (answer === 'cancel') return false;
      if (answer === 'save' && !(await this.editing.save(s))) return false;
      if (answer === 'discard') await deleteDraft(s.draftId); // abandonné en connaissance de cause
    }
    return true;
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
    const ok = await this.openBytes(name, bytes, { handle });
    if (ok) void rememberFile(name, bytes.length, handle).then(() => this.refreshHome());
  }

  /** Ouvre des octets dans un nouvel onglet. `unsaved` : document créé par Cigale (extrait…), jamais enregistré. */
  async openBytes(name: string, bytes: Uint8Array, opts: { handle?: FileSystemFileHandle; unsaved?: boolean; draftId?: string } = {}): Promise<boolean> {
    const startedAt = performance.now();
    let cancelled = false;
    let password: string | undefined;
    this.showOverlay(fmt(t.loading.opening, { name }), () => {
      cancelled = true;
      handleLoad.cancel();
    });
    const handleLoad = loadPdf(bytes, {
      password: async (incorrect) => {
        const pw = await askPassword(name, incorrect);
        if (pw !== null) password = pw;
        return pw;
      },
    });
    try {
      const pdf = await handleLoad.promise;
      this.hideLoading();
      await this.addSession(name, bytes, opts, password, pdf, startedAt);
      return true;
    } catch (err) {
      this.hideLoading();
      if (cancelled || classifyPdfError(err) === 'password') {
        toast(t.loading.cancelled);
        return false;
      }
      const kind = classifyPdfError(err);
      const msg =
        kind === 'invalid'
          ? fmt(t.errors.invalid, { name })
          : kind === 'unsupportedEncryption'
            ? fmt(t.errors.unsupportedEncryption, { name })
            : fmt(t.errors.unknown, { name, detail: String((err as Error)?.message ?? err) });
      await showMessage(t.errors.title, msg);
      return false;
    }
  }

  /** Affiche le message d'attente avec Annuler ; renvoie la fonction qui règle la progression (0 à 1). */
  private showOverlay(text: string, onCancel: () => void): (fraction: number) => void {
    clear(this.loadingEl);
    const bar = h('progress', {});
    this.loadingEl.append(h('div', { class: 'loading-box' }, h('p', {}, text), bar, h('button', { id: 'loading-cancel', onclick: onCancel }, t.loading.cancel)));
    this.loadingEl.hidden = false;
    return (fraction) => {
      bar.max = 1;
      bar.value = Math.min(1, Math.max(0, fraction));
    };
  }
  private hideLoading() {
    this.loadingEl.hidden = true;
  }

  private makeList(s: Session, layout: 'list' | 'grid', pdf: import('pdfjs-dist').PDFDocumentProxy, width: number): PageList {
    return new PageList(pdf, {
      width,
      layout,
      onOpen: (page) => {
        if (layout === 'grid') this.setOrganizing(s, false);
        s.view.page = page;
      },
      onSelectionChange: (sel) => {
        s.selection = sel;
        (layout === 'list' ? s.grid : s.thumbs)?.select(sel, true);
        this.updateEditUi(s);
      },
      onMove: (pages, to) => void this.editing.move(s, pages, to),
      onContextMenu: (x, y) => this.showPageMenu(x, y),
    });
  }

  private listOf(s: Session): PageList {
    return s.organizing && s.grid ? s.grid : s.thumbs;
  }

  private async addSession(name: string, bytes: Uint8Array, opts: { handle?: FileSystemFileHandle; unsaved?: boolean; draftId?: string }, password: string | undefined, pdf: import('pdfjs-dist').PDFDocumentProxy, startedAt: number) {
    const settings = loadSettings();
    this.homeEl.hidden = true;
    this.workspace.hidden = false;
    this.sessions.forEach((x) => (x.view.root.hidden = true));
    const view = new DocView(pdf, settings.defaultZoom, startedAt, this.docsEl);
    const id = this.nextId++;
    const outline = await buildOutline(pdf, view.linkService);
    const tab = h(
      'div',
      { class: 'tab doc-tab', role: 'tab', 'data-session': id, onauxclick: (e: MouseEvent) => e.button === 1 && void this.close(id) },
      h('button', { class: 'tab-label', onclick: () => this.activate(id), title: name }, name),
      h('button', { class: 'tab-close', 'aria-label': fmt(t.tabs.close, { name }), onclick: () => void this.close(id) }, '✕'),
    );
    const session = {
      id,
      name,
      history: new History(bytes, !opts.unsaved),
      diskBytes: opts.unsaved ? null : bytes,
      password,
      handle: opts.handle,
      signedAcknowledged: false,
      selection: [],
      organizing: false,
      view,
      grid: null,
      outline,
      tab,
      annots: [],
      pendingSelect: null,
      draftId: opts.draftId ?? newDraftId(),
      formModified: false,
      hasForm: false,
    } as unknown as Session;
    session.comments = new CommentsPanel(this.commentsHost(session));
    session.thumbs = this.makeList(session, 'list', pdf, PANEL_THUMB);
    this.sessions.push(session);
    this.tabsEl.append(tab);
    this.bindView(session);
    this.attachAnnotations(session, bytes);
    this.activate(id);
  }

  /** Remplace le contenu affiché par de nouveaux octets (après une opération, annuler ou rétablir). */
  private async reload(s: Session, bytes: Uint8Array, selection: number[], expectedPages?: number): Promise<void> {
    const old = { view: s.view, thumbs: s.thumbs, grid: s.grid, annotator: s.annotator };
    const state = { page: old.view.page, zoom: old.view.scaleValue, mode: old.view.viewMode, rotation: old.view.viewRotation, top: old.view.container.scrollTop, left: old.view.container.scrollLeft };
    const handle = loadPdf(bytes, { password: async () => s.password ?? null });
    const pdf = await handle.promise;
    if (expectedPages !== undefined && pdf.numPages !== expectedPages) {
      void pdf.loadingTask.destroy();
      throw new Error(t.editErrors.codes.structure);
    }
    const view = new DocView(pdf, state.zoom, performance.now(), this.docsEl);
    view.root.hidden = this.active !== s;
    await view.ready;
    if (state.mode !== 'continuous') view.setViewMode(state.mode);
    if (state.rotation) view.setRotation(state.rotation);
    view.page = Math.min(state.page, view.pageCount);
    // même position de défilement qu'avant (le zoom est le même, donc la mise en page aussi) : on reste là où on travaillait
    view.container.scrollTop = state.top;
    view.container.scrollLeft = state.left;
    s.view = view;
    s.selection = selection.filter((i) => i < view.pageCount);
    s.thumbs = this.makeList(s, 'list', pdf, PANEL_THUMB);
    s.thumbs.select(s.selection, true);
    s.grid = null;
    if (s.organizing) this.ensureGrid(s, pdf);
    s.outline = await buildOutline(pdf, view.linkService);
    this.bindView(s);
    old.annotator?.destroy?.();
    this.attachAnnotations(s, bytes);
    old.thumbs.destroy();
    old.grid?.destroy();
    old.grid?.el.remove();
    old.view.destroy();
    if (this.active === s) {
      this.renderPanel();
      this.showCurrentCentre(s);
      this.updatePageUi(s);
      this.updateZoomUi(s);
      s.thumbs.setCurrent(view.page);
    }
  }

  private ensureGrid(s: Session, pdf = s.view.pdf) {
    if (s.grid) return;
    s.grid = this.makeList(s, 'grid', pdf, Number(this.thumbSize.value));
    s.grid.el.classList.add('organizer');
    s.grid.select(s.selection, true);
    s.grid.el.hidden = !(this.active === s && s.organizing);
    this.docsEl.append(s.grid.el);
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
    this.sessions.forEach((x) => {
      x.view.root.hidden = x !== s;
      if (x.grid) x.grid.el.hidden = !(x === s && x.organizing);
    });
    this.tabsEl.querySelectorAll('.tab').forEach((el) => el.classList.toggle('active', el === s.tab));
    this.closeFind();
    this.renderPanel();
    this.updatePageUi(s);
    this.updateZoomUi(s);
    this.viewSelect.value = s.view.viewMode;
    this.setBadge(s.annots);
    this.syncStyleUi();
    this.updateFormBanner(s);
    this.showCurrentCentre(s);
    this.refreshState(s);
    s.view.viewer.update();
    if (!s.organizing) s.view.container.focus({ preventScroll: true });
  }

  /** Affiche soit le document, soit la grille « Organiser les pages ». */
  private showCurrentCentre(s: Session) {
    s.view.root.hidden = this.active !== s || s.organizing;
    if (s.grid) s.grid.el.hidden = !(this.active === s && s.organizing);
    this.workspace.classList.toggle('organizing', s.organizing);
    this.thumbSize.hidden = !s.organizing;
    this.editButtons['btn-organize'].classList.toggle('on', s.organizing);
    this.editButtons['btn-organize'].setAttribute('aria-pressed', String(s.organizing));
    this.editButtons['btn-organize'].title = s.organizing ? t.pages.backToViewer : t.pages.organize;
  }

  private toggleOrganize() {
    if (this.active) this.setOrganizing(this.active, !this.active.organizing);
  }

  private setOrganizing(s: Session, on: boolean) {
    s.organizing = on;
    if (on) s.annotator.select(null);
    if (on) this.ensureGrid(s);
    this.showCurrentCentre(s);
    if (!on) s.view.viewer.update();
    this.updateEditUi(s);
  }

  async close(id: number): Promise<void> {
    const i = this.sessions.findIndex((x) => x.id === id);
    if (i < 0) return;
    const s = this.sessions[i];
    if (isDirty(s)) {
      this.activate(s.id);
      const answer = await askUnsaved(s.name);
      if (answer === 'cancel') return;
      if (answer === 'save' && !(await this.editing.save(s))) return;
    }
    window.clearTimeout(s.draftTimer);
    void deleteDraft(s.draftId); // fermé en connaissance de cause (enregistré ou abandonné)
    const at = this.sessions.indexOf(s); // les onglets ont pu changer pendant les questions
    if (at < 0) return;
    this.sessions.splice(at, 1);
    s.annotator.destroy();
    s.thumbs.destroy();
    s.grid?.destroy();
    s.grid?.el.remove();
    s.view.destroy();
    s.tab.remove();
    if (this.active === s) {
      this.active = null;
      const next = this.sessions[Math.min(at, this.sessions.length - 1)];
      if (next) this.activate(next.id);
      else {
        this.updateEditUi(null);
        this.setAnnotTool(null);
        this.setBadge([]);
        this.showHome();
      }
    }
  }

  // ───────────────────────── commentaires ─────────────────────────

  private buildAnnotBar() {
    const mk = (tool: Tool, iconName: IconName) => {
      const b = this.iconButton(`tool-${tool}`, t.annot.tools[tool], iconName, () => this.setAnnotTool(tool));
      b.setAttribute('aria-pressed', 'false');
      this.toolButtons[tool] = b;
      return b;
    };
    const stampBtn = mk('stamp', 'stamp');
    stampBtn.onclick = () => {
      this.setAnnotTool('stamp');
      showMenu(
        Object.entries(STAMPS).map(([key]) => ({ id: `stamp-${key}`, label: t.annot.stamps[key as keyof typeof t.annot.stamps], run: () => ((this.annotStyle.stamp = key), this.pushStyle()) })),
        stampBtn,
      );
    };
    for (const color of COLORS) {
      const b = h('button', { type: 'button', class: 'swatch', title: `${t.annot.color} : ${color.name}`, 'aria-label': color.name, 'data-color': color.name, onclick: () => this.setColor(color.rgb) });
      b.style.background = rgbToCss(color.rgb);
      this.swatches.push(b);
    }
    for (const w of [1, 2, 3, 5, 8]) this.widthSelect.append(h('option', { value: String(w) }, `${w} pt`));
    for (const z of [10, 12, 14, 18, 24, 32]) this.sizeSelect.append(h('option', { value: String(z) }, `${z} pt`));
    this.widthSelect.value = String(this.annotStyle.width);
    this.sizeSelect.value = String(this.annotStyle.fontSize);
    this.widthSelect.onchange = () => {
      this.annotStyle.width = Number(this.widthSelect.value);
      this.pushStyle({ width: this.annotStyle.width });
    };
    this.sizeSelect.onchange = () => {
      this.annotStyle.fontSize = Number(this.sizeSelect.value);
      this.pushStyle({ fontSize: this.annotStyle.fontSize });
    };
    this.annotBar.append(
      mk('select', 'pointer'),
      mk('redact', 'redact'),
      mk('sign', 'sign'),
      h('span', { class: 'sep' }),
      mk('highlight', 'highlight'),
      mk('underline', 'underline'),
      mk('strikeout', 'strikeout'),
      h('span', { class: 'sep' }),
      mk('note', 'note'),
      mk('freetext', 'text'),
      mk('ink', 'pen'),
      mk('rect', 'rect'),
      mk('ellipse', 'ellipse'),
      mk('line', 'line'),
      mk('arrow', 'arrow'),
      stampBtn,
      h('span', { class: 'sep' }),
      ...this.swatches,
      this.widthSelect,
      this.sizeSelect,
      h('span', { class: 'spacer' }),
      this.redactApplyBtn,
    );
    this.toolButtons.sign.onclick = () => void this.chooseSignature();
  }

  /** Outil « Signer » : choisir (dessiner, taper, importer) une signature, puis cliquer sur la page pour la poser. */
  private async chooseSignature() {
    const img = await askSignature();
    if (!img) return;
    this.sessions.forEach((x) => (x.annotator.signature = img));
    this.signature = img;
    this.setAnnotTool('sign');
    toast(t.sign.placeHint);
  }

  private toggleCommentMode() {
    this.setAnnotTool(this.annotTool === null ? 'select' : null);
  }

  private setAnnotTool(tool: Tool | null) {
    this.annotTool = tool;
    if (tool && tool !== 'select') this.annotStyle.color = this.toolColors[tool] ?? COLORS[3].rgb; // chaque outil retrouve sa couleur (rouge par défaut)
    this.sessions.forEach((x) => (x.annotator.style = this.annotStyle));
    this.annotBar.hidden = tool === null;
    this.editButtons['btn-comment']?.classList.toggle('on', tool !== null);
    this.workspace.querySelector('#btn-comment')?.classList.toggle('on', tool !== null);
    for (const [name, b] of Object.entries(this.toolButtons)) {
      b.classList.toggle('on', name === tool);
      b.setAttribute('aria-pressed', String(name === tool));
    }
    this.sessions.forEach((x) => x.annotator.setTool(tool));
    if (tool !== null && this.active) this.active.view.container.focus({ preventScroll: true });
    this.syncStyleUi();
  }

  /** Applique la couleur ou l'épaisseur au commentaire sélectionné, sinon aux prochains. */
  private pushStyle(patch: { width?: number; fontSize?: number; color?: Rgb } = {}) {
    this.sessions.forEach((x) => (x.annotator.style = this.annotStyle));
    const s = this.active;
    const sel = s?.annotator.selection;
    if (s && sel && Object.keys(patch).length) {
      const p: Record<string, unknown> = { ...patch };
      if (patch.width !== undefined && ['highlight', 'freetext', 'note', 'stamp'].includes(sel.kind)) delete p.width;
      if (patch.fontSize !== undefined && sel.kind !== 'freetext') delete p.fontSize;
      if (Object.keys(p).length) void this.editing.updateAnnot(s, sel.id, p);
    }
    this.syncStyleUi();
  }

  /** Bandeau « formulaire » : indication, puis bouton « Valider la saisie » dès que des champs sont remplis. */
  private updateFormBanner(s: Session | null) {
    const b = this.formBanner;
    if (!s || this.active !== s || !s.hasForm || this.formDismissed.has(s.id)) {
      b.hidden = true;
      return;
    }
    b.hidden = false;
    b.replaceChildren(
      ...[
        h('span', {}, s.formModified ? t.form.pending : t.form.hint),
        s.formModified ? h('button', { class: 'primary', id: 'form-commit', type: 'button', onclick: () => void this.editing.flushForm(s) }, t.form.commit) : null,
        h('button', { class: 'link', id: 'form-close', type: 'button', onclick: () => (this.formDismissed.add(s.id), this.updateFormBanner(s)) }, t.form.close),
      ].filter((x): x is HTMLElement => x !== null),
    );
  }

  private setBadge(list: Annot[]) {
    const n = list.filter((a) => !a.replyTo).length;
    this.commentsBadge.textContent = String(n);
    this.commentsBadge.hidden = n === 0;
    this.redactApplyBtn.hidden = !list.some((a) => a.kind === 'redact');
  }

  private setColor(rgb: Rgb) {
    this.annotStyle.color = rgb;
    if (this.annotTool && this.annotTool !== 'select') this.toolColors[this.annotTool] = rgb;
    this.pushStyle({ color: rgb });
  }

  private syncStyleUi() {
    const sel = this.active?.annotator.selection;
    const color = sel?.color ?? this.annotStyle.color;
    this.swatches.forEach((b, i) => b.classList.toggle('on', COLORS[i].rgb.every((c, k) => Math.abs(c - color[k]) < 0.01)));
    this.widthSelect.value = String(sel && sel.width ? Math.round(sel.width) : this.annotStyle.width);
    this.sizeSelect.value = String(sel?.fontSize ?? this.annotStyle.fontSize);
    const tool = this.annotTool;
    this.sizeSelect.hidden = !(tool === 'freetext' || sel?.kind === 'freetext');
  }

  private annotHost(s: Session): AnnotHost {
    return {
      add: (drafts) => this.editing.addAnnots(s, drafts).then(() => undefined),
      update: (id, patch, label) => this.editing.updateAnnot(s, id, patch, label).then(() => undefined),
      remove: (ids) => this.editing.removeAnnots(s, ids).then(() => undefined),
      selected: (id) => {
        s.comments.update(s.annots, id);
        this.syncStyleUi();
      },
      notify: (m) => toast(m),
    };
  }

  private commentsHost(s: Session) {
    return {
      select: (a: Annot) => {
        if (this.annotTool !== 'select') this.setAnnotTool('select');
        if (s.organizing) this.setOrganizing(s, false);
        s.annotator.select(a.id, false);
        s.comments.update(s.annots, a.id);
        s.view.viewer.scrollPageIntoView({ pageNumber: a.page + 1, destArray: [null, { name: 'XYZ' }, Math.max(0, a.rect[0] - 30), a.rect[3] + 60, null] });
        this.syncStyleUi();
      },
      edit: (id: string, text: string) => void this.editing.updateAnnot(s, id, { contents: text }),
      remove: (id: string) => void this.editing.removeAnnots(s, [id]),
      reply: (parentId: string, page: number, text: string) => {
        const parent = s.annots.find((a) => a.id === parentId);
        const [x, , , y] = parent?.rect ?? [20, 20, 44, 44];
        void this.editing.addAnnots(s, [{ kind: 'note', page, color: [1, 0.85, 0.2], fill: null, opacity: 1, width: 1, contents: text, rect: [x, y - 24, x + 24, y], replyTo: parentId }], 'reply');
      },
    };
  }

  /** Crée le calque de commentaires de la vue courante de la session et relit la liste des commentaires. */
  private attachAnnotations(s: Session, bytes: Uint8Array) {
    const annotator = new Annotator(s.view, this.annotHost(s));
    annotator.style = this.annotStyle;
    annotator.signature = this.signature;
    annotator.setTool(this.annotTool);
    s.annotator = annotator;
    const view = s.view;
    // Formulaire : savoir quand des champs sont remplis, et si le document en a
    s.formModified = false;
    s.hasForm = false;
    (view.pdf.annotationStorage as unknown as { onSetModified: (() => void) | null }).onSetModified = () => {
      if (s.view !== view || s.formModified) return;
      s.formModified = true;
      this.refreshState(s);
      this.updateFormBanner(s);
    };
    void hasFormFields(view.pdf).then((has) => {
      if (s.view !== view) return;
      s.hasForm = has;
      this.updateFormBanner(s);
    });
    void listAnnotationsOp(bytes, s.password, view.pageCount).promise.then(
      (list) => {
        if (s.view !== view) return; // un rechargement plus récent a pris le relais
        s.annots = list;
        annotator.setAnnots(list);
        if (s.pendingSelect && list.some((a) => a.id === s.pendingSelect)) annotator.select(s.pendingSelect, false);
        s.pendingSelect = null;
        s.comments.update(list, annotator.selection?.id ?? null);
        this.setBadge(list);
        this.syncStyleUi();
      },
      () => undefined,
    );
  }

  // ───────────────────────── modifications et enregistrement ─────────────────────────

  private async withActive(fn: (s: Session) => Promise<unknown>) {
    if (this.active) await fn(this.active);
  }

  private async undo() {
    if (this.active) await this.editing.undo(this.active);
  }
  private async redo() {
    if (this.active) await this.editing.redo(this.active);
  }
  private async print() {
    if (this.active) await this.editing.flushForm(this.active);
    if (this.active) await printDocument(this.active, (text, onCancel) => this.showOverlay(text, onCancel), () => this.hideLoading());
  }
  private async save() {
    if (this.active) await this.editing.save(this.active);
  }
  private async saveAs() {
    if (this.active) await this.editing.saveAs(this.active);
  }

  /** Met à jour tout ce qui dépend de l'état du document : modifié, annuler/rétablir, sélection. */
  private refreshState(s: Session) {
    this.scheduleDraft(s);
    s.tab.classList.toggle('dirty', isDirty(s));
    s.tab.querySelector('.tab-label')!.textContent = s.name;
    if (this.active !== s) return;
    document.title = `${isDirty(s) ? '• ' : ''}${s.name} — ${t.app.name}`;
    this.updateEditUi(s);
    if (isDirty(s)) this.setStatus(t.status.dirty, 'dirty');
    else this.setStatus(s.diskBytes && s.handle ? fmt(t.status.saved, { time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) }) : '', 'saved');
  }

  /** Sauvegarde automatique : 2 s après la dernière modification (et tout de suite quand la page est masquée). */
  private scheduleDraft(s: Session, now = false) {
    window.clearTimeout(s.draftTimer);
    if (!s.history.dirty) {
      void deleteDraft(s.draftId);
      return;
    }
    if (!loadSettings().autosave) return;
    const write = () => void saveDraft(s.draftId, s.name, s.history.current);
    if (now) write();
    else s.draftTimer = window.setTimeout(write, 2000);
  }

  /** Rouvre un travail sauvegardé automatiquement, comme document non enregistré. */
  async resumeDraft(id: string, name: string): Promise<void> {
    const bytes = await readDraft(id);
    if (!bytes) {
      toast(t.home.resumeGone);
      await deleteDraft(id);
      this.refreshHome();
      return;
    }
    // Pas de lien avec le fichier d'origine (il a pu changer depuis) : « Enregistrer » demandera où écrire.
    // Le document garde l'identifiant de sa sauvegarde : elle n'est supprimée qu'à l'enregistrement ou à la fermeture.
    if (await this.openBytes(name, bytes, { unsaved: true, draftId: id })) this.refreshHome();
  }

  /** Cette sauvegarde appartient-elle à un document ouvert en ce moment ? (elle n'est alors pas proposée dans « Reprendre ») */
  hasDraft(id: string): boolean {
    return this.sessions.some((x) => x.draftId === id);
  }

  /** Réglage « sauvegarde automatique » : décoché, tout ce qui était gardé est effacé tout de suite. */
  async autosaveChanged(enabled: boolean): Promise<void> {
    if (enabled) return void this.sessions.forEach((x) => this.scheduleDraft(x));
    this.sessions.forEach((x) => window.clearTimeout(x.draftTimer));
    for (const d of await listDrafts()) await deleteDraft(d.id);
  }

  private setStatus(text: string, kind: string) {
    this.statusEl.textContent = text;
    this.statusEl.dataset.kind = kind;
  }

  private updateEditUi(s: Session | null) {
    const n = s?.selection.length ?? 0;
    const need = ['btn-rot-left', 'btn-rot-right', 'btn-duplicate', 'btn-delete', 'btn-extract'];
    for (const id of need) this.editButtons[id].disabled = n === 0;
    const undo = this.workspace.querySelector<HTMLButtonElement>('#btn-undo')!;
    const redo = this.workspace.querySelector<HTMLButtonElement>('#btn-redo')!;
    undo.disabled = !s?.history.canUndo;
    redo.disabled = !s?.history.canRedo;
    undo.title = s?.history.canUndo ? fmt(t.pages.undoWith, { label: s.history.undoLabel }) : t.pages.nothingToUndo;
    redo.title = s?.history.canRedo ? fmt(t.pages.redoWith, { label: s.history.redoLabel }) : t.pages.nothingToRedo;
    this.workspace.querySelector('#btn-save')?.classList.toggle('on', !!(s && isDirty(s)));
    this.selectionInfo.textContent = s?.organizing ? (n === 0 ? t.pages.selected.none : plural(n, t.pages.selected)) : '';
  }

  // ───────────────────────── panneau, zoom, pages ─────────────────────────

  private togglePanel() {
    this.leftPanel.classList.toggle('collapsed');
  }

  private setPanelTab(tab: 'thumbnails' | 'bookmarks' | 'comments') {
    this.panelTab = tab;
    this.leftPanel.querySelectorAll('.panel-tabs button').forEach((b) => b.classList.toggle('active', b.id === `panel-tab-${tab}`));
    this.leftPanel.querySelectorAll('.panel-tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.id === `panel-tab-${tab}`)));
    this.renderPanel();
  }

  private renderPanel() {
    this.panelBody.replaceChildren();
    const s = this.active;
    if (!s) return;
    this.panelBody.append(this.panelTab === 'thumbnails' ? s.thumbs.el : this.panelTab === 'bookmarks' ? s.outline : s.comments.el);
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
    if (this.active.organizing) this.setOrganizing(this.active, false);
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
