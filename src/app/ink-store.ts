/**
 * Traits écrits mais pas encore enregistrés dans le PDF. Ils vivent dans la session (et non dans le calque, recréé
 * à chaque rechargement du document) : on peut ainsi écrire vite, sans recharger le document à chaque trait, puis
 * tout écrire d'un coup (un seul pas « Annuler ») quand on s'arrête d'écrire ou qu'une autre opération commence.
 * Avant cet envoi, Annuler / Rétablir agissent trait par trait.
 */
import type { AnnotDraft } from '../data/annotations';
import { type InkStroke, PENS, strokeBounds } from '../data/ink';

/** Règle virtuelle : position en pixels par rapport à la zone du document ; (0, 0) = pas encore placée. */
export interface RulerState {
  visible: boolean;
  cx: number;
  cy: number;
  angle: number;
  length: number;
}

export class InkStore {
  /** Traits choisis au lasso (déjà dans le document) ; garde la sélection d'un rechargement à l'autre. */
  lasso: { page: number; ids: string[] } | null = null;
  ruler: RulerState = { visible: false, cx: 0, cy: 0, angle: 0, length: 0 };
  private list: InkStroke[] = [];
  private undone: InkStroke[] = [];

  get hasPending(): boolean {
    return this.list.length > 0;
  }
  get canRedo(): boolean {
    return this.undone.length > 0;
  }
  forPage(page: number): InkStroke[] {
    return this.list.filter((s) => s.page === page);
  }
  add(s: InkStroke): void {
    this.list.push(s);
    this.undone = []; // un nouveau trait efface ce qu'on pouvait rétablir
  }
  /** Retire des traits (gomme). */
  removeWhere(pred: (s: InkStroke) => boolean): boolean {
    const before = this.list.length;
    this.list = this.list.filter((s) => !pred(s));
    return this.list.length !== before;
  }
  undoOne(): boolean {
    const s = this.list.pop();
    if (!s) return false;
    this.undone.push(s);
    return true;
  }
  redoOne(): boolean {
    const s = this.undone.pop();
    if (!s) return false;
    this.list.push(s);
    return true;
  }
  /** Prend tous les traits pour les écrire dans le document. */
  take(): InkStroke[] {
    const all = this.list;
    this.list = [];
    if (all.length) this.undone = []; // sans trait à envoyer, ce qu'on avait annulé reste rétablissable
    return all;
  }
  /** L'écriture a échoué : on les remet, pour ne rien perdre. */
  restore(strokes: InkStroke[]): void {
    this.list = [...strokes, ...this.list];
  }
}

export function strokeToDraft(s: InkStroke): AnnotDraft {
  const preset = PENS[s.pen];
  return {
    kind: 'ink',
    page: s.page,
    color: s.color,
    fill: null,
    opacity: preset.opacity,
    width: s.width,
    contents: '',
    rect: strokeBounds(s.points, s.width),
    strokes: [s.points],
    pen: s.pen,
    ...(s.pressures ? { pressures: [s.pressures] } : {}),
  };
}
