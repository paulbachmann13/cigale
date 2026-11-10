import type { PDFDocumentProxy } from 'pdfjs-dist';
import { EventBus, PDFFindController, PDFLinkService, PDFViewer, ScrollMode, SpreadMode } from 'pdfjs-dist/web/pdf_viewer.mjs';
import 'pdfjs-dist/web/pdf_viewer.css';
import { INK_LAYER_NAME } from '../data/ink';
import { clampZoom } from '../data/zoom';

/** Partie de l'API des calques (contenu optionnel) de pdf.js que l'on utilise. */
interface OptionalContent {
  [Symbol.iterator](): Iterator<[string, { name: string | null }]>;
  setVisibility(id: string, visible: boolean): void;
}

export type ViewMode = 'continuous' | 'single' | 'two-pages';

/** Un document affiché : conteneur, PDFViewer de pdf.js, recherche et liens. Une instance par onglet. */
export class DocView {
  readonly root: HTMLDivElement;
  readonly container: HTMLDivElement;
  readonly eventBus = new EventBus();
  readonly linkService: PDFLinkService;
  readonly findController: PDFFindController;
  readonly viewer: PDFViewer;
  private rotation = 0;
  firstRenderMs: number | null = null;
  /** Résolu quand pdf.js a placé les pages (on peut alors restaurer page, mode et rotation). */
  readonly ready: Promise<void>;

  /** `parent` doit déjà être affiché : pdf.js a besoin de mesurer le conteneur pour placer les pages. */
  constructor(readonly pdf: PDFDocumentProxy, defaultZoom: string, private readonly openedAt: number, parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'doc-view';
    this.container = document.createElement('div');
    this.container.className = 'viewer-container';
    this.container.tabIndex = 0;
    const inner = document.createElement('div');
    inner.className = 'pdfViewer';
    this.container.append(inner);
    this.root.append(this.container);
    parent.append(this.root);

    this.linkService = new PDFLinkService({ eventBus: this.eventBus, externalLinkTarget: 2 /* nouvel onglet */, externalLinkRel: 'noopener noreferrer' });
    this.findController = new PDFFindController({ linkService: this.linkService, eventBus: this.eventBus });
    this.viewer = new PDFViewer({
      container: this.container,
      viewer: inner,
      eventBus: this.eventBus,
      linkService: this.linkService,
      findController: this.findController,
      textLayerMode: 1,
      annotationMode: 2, // ENABLE_FORMS : les annotations s'affichent ; l'édition vient plus tard
      maxCanvasPixels: 2 ** 25,
      imageResourcesPath: `${import.meta.env.BASE_URL}pdfjs/images/`,
    });
    this.linkService.setViewer(this.viewer);

    this.ready = new Promise<void>((resolve) => {
      this.eventBus.on('pagesinit', () => {
        this.viewer.currentScaleValue = defaultZoom;
        resolve();
      });
    });
    this.eventBus.on('pagerendered', () => {
      if (this.firstRenderMs === null) this.firstRenderMs = performance.now() - this.openedAt;
    });
    this.viewer.setDocument(pdf);
    this.linkService.setDocument(pdf, null);
  }

  /**
   * Masque dans pdf.js le calque de l'écriture manuscrite : Cigale dessine elle-même l'encre (gomme, lasso et annulation
   * instantanés). Les autres lecteurs, eux, l'affichent normalement. Renvoie faux si le document n'a pas ce calque.
   */
  async hideInkLayer(): Promise<boolean> {
    const viewer = this.viewer as unknown as { optionalContentConfigPromise: Promise<OptionalContent> | null };
    const config = await viewer.optionalContentConfigPromise;
    if (!config) return false;
    let found = false;
    for (const [id, group] of config) {
      if (group.name === INK_LAYER_NAME) {
        config.setVisibility(id, false);
        found = true;
      }
    }
    if (found) viewer.optionalContentConfigPromise = Promise.resolve(config);
    return found;
  }

  get pageCount(): number {
    return this.pdf.numPages;
  }
  get page(): number {
    return this.viewer.currentPageNumber;
  }
  set page(n: number) {
    this.viewer.currentPageNumber = Math.min(this.pageCount, Math.max(1, Math.round(n)));
  }
  get scale(): number {
    return this.viewer.currentScale;
  }
  get scaleValue(): string {
    return String(this.viewer.currentScaleValue);
  }

  setZoom(value: number | string): void {
    this.viewer.currentScaleValue = typeof value === 'number' ? String(clampZoom(value)) : value;
  }

  /** Zoom multiplicatif (pincer) autour d'un point de l'écran. */
  zoomBy(factor: number, origin?: [number, number]): void {
    const target = clampZoom(this.scale * factor);
    this.viewer.updateScale({ scaleFactor: target / this.scale, origin });
  }

  rotate(): void {
    this.setRotation(this.rotation + 90);
  }

  get viewRotation(): number {
    return this.rotation;
  }

  setRotation(degrees: number): void {
    this.rotation = ((degrees % 360) + 360) % 360;
    this.viewer.pagesRotation = this.rotation;
  }

  get viewMode(): ViewMode {
    return this.isPagedMode ? 'single' : this.viewer.spreadMode === SpreadMode.ODD ? 'two-pages' : 'continuous';
  }

  setViewMode(mode: ViewMode): void {
    const page = this.page;
    if (mode === 'continuous') {
      this.viewer.scrollMode = ScrollMode.VERTICAL;
      this.viewer.spreadMode = SpreadMode.NONE;
    } else if (mode === 'single') {
      this.viewer.scrollMode = ScrollMode.PAGE;
      this.viewer.spreadMode = SpreadMode.NONE;
    } else {
      this.viewer.scrollMode = ScrollMode.VERTICAL;
      this.viewer.spreadMode = SpreadMode.ODD;
    }
    this.page = page;
  }

  get isPagedMode(): boolean {
    return this.viewer.scrollMode === ScrollMode.PAGE;
  }

  find(query: string, opts: { caseSensitive: boolean; matchDiacritics: boolean; again?: boolean; backwards?: boolean }): void {
    this.eventBus.dispatch('find', {
      source: this,
      type: opts.again ? 'again' : '',
      query,
      caseSensitive: opts.caseSensitive,
      matchDiacritics: opts.matchDiacritics,
      entireWord: false,
      highlightAll: true,
      findPrevious: !!opts.backwards,
    });
  }

  clearFind(): void {
    this.eventBus.dispatch('findbarclose', { source: this });
  }

  destroy(): void {
    this.viewer.setDocument(null as unknown as PDFDocumentProxy);
    void this.pdf.loadingTask.destroy();
    this.root.remove();
  }
}
