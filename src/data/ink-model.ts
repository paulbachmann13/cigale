/**
 * L'encre d'un document ouvert : tous les traits d'écriture, page par page, dans l'ordre où ils se superposent.
 * C'est la source de vérité pendant la session — le calque d'encre la dessine, la gomme et le lasso la modifient tout de suite,
 * et elle n'est écrite dans le PDF que quand on a besoin des octets (enregistrer, opération sur les pages…).
 *
 * Toute modification est une « action » explicite et réversible (ce qu'on retire, ce qu'on ajoute, à quelles positions) :
 * l'historique garde ces petites actions au lieu d'une copie du PDF par trait. Logique pure.
 */
import type { Annot } from './annotations';
import type { InkStroke } from './ink';

export interface InkEdit {
  /** Position du trait dans la page (ordre de superposition). */
  index: number;
  stroke: InkStroke;
}

/** Une modification de l'encre d'une page. `before` / `after` : version de la page avant et après (voir `InkModel.version`). */
export interface InkAction {
  page: number;
  remove: InkEdit[];
  add: InkEdit[];
  before: number;
  after: number;
}

let lastVersion = 0;
const nextVersion = () => ++lastVersion;

export function invertAction(a: InkAction): InkAction {
  return { page: a.page, remove: a.add, add: a.remove, before: a.after, after: a.before };
}

export class InkModel {
  private pages = new Map<number, InkStroke[]>();
  /** Version de chaque page (0 si absente) : change à chaque action, et revient à l'ancienne valeur quand on annule. */
  private versions = new Map<number, number>();

  /** Les traits d'une page, dans l'ordre de superposition. Ne pas modifier le tableau. */
  strokes(page: number): readonly InkStroke[] {
    return this.pages.get(page) ?? EMPTY;
  }

  /** Pages qui portent de l'encre. */
  inkedPages(): number[] {
    return [...this.pages.keys()].filter((p) => this.pages.get(p)!.length > 0).sort((a, b) => a - b);
  }

  get strokeCount(): number {
    let n = 0;
    for (const list of this.pages.values()) n += list.length;
    return n;
  }

  version(page: number): number {
    return this.versions.get(page) ?? 0;
  }

  /** Copie des versions : c'est « ce que contient » un PDF qu'on vient d'écrire ou de lire. */
  snapshot(): Map<number, number> {
    return new Map(this.versions);
  }

  /** Pages dont l'encre diffère de celle d'un PDF dont on a gardé les versions. */
  changedSince(baseline: ReadonlyMap<number, number>): number[] {
    const pages = new Set([...this.versions.keys(), ...baseline.keys()]);
    return [...pages].filter((p) => this.version(p) !== (baseline.get(p) ?? 0)).sort((a, b) => a - b);
  }

  /** Remplace toute l'encre par celle qu'on vient de lire dans un PDF (dont les versions sont `baseline`, vide pour un fichier neuf). */
  reset(strokes: Iterable<InkStroke>, baseline: ReadonlyMap<number, number> = new Map()): void {
    this.pages = new Map();
    for (const s of strokes) {
      const list = this.pages.get(s.page);
      if (list) list.push(s);
      else this.pages.set(s.page, [s]);
    }
    this.versions = new Map(baseline);
  }

  /**
   * L'action qui fait passer la page de son contenu actuel à `next` (les traits sont comparés par objet : un trait déplacé
   * ou recoloré est un nouvel objet). `null` si rien ne change. L'action n'est pas appliquée.
   */
  diff(page: number, next: readonly InkStroke[]): InkAction | null {
    const current = this.strokes(page);
    const kept = new Set(next);
    const had = new Set(current);
    const remove: InkEdit[] = [];
    current.forEach((stroke, index) => {
      if (!kept.has(stroke)) remove.push({ index, stroke });
    });
    const add: InkEdit[] = [];
    next.forEach((stroke, index) => {
      if (!had.has(stroke)) add.push({ index, stroke });
    });
    if (remove.length === 0 && add.length === 0) {
      // même ensemble de traits : l'ordre a-t-il changé ? (non prévu aujourd'hui, mais on ne le laisse pas passer en silence)
      if (current.every((s, i) => s === next[i])) return null;
      return { page, remove: current.map((stroke, index) => ({ index, stroke })), add: next.map((stroke, index) => ({ index, stroke })), before: this.version(page), after: nextVersion() };
    }
    return { page, remove, add, before: this.version(page), after: nextVersion() };
  }

  /** Applique une action (ou son inverse, pour annuler). Les traits à retirer sont retrouvés par identifiant. */
  apply(a: InkAction): void {
    const gone = new Set(a.remove.map((e) => e.stroke.id));
    const list = (this.pages.get(a.page) ?? []).filter((s) => !gone.has(s.id));
    for (const e of [...a.add].sort((x, y) => x.index - y.index)) list.splice(Math.min(e.index, list.length), 0, e.stroke);
    if (list.length) this.pages.set(a.page, list);
    else this.pages.delete(a.page);
    if (a.after === 0) this.versions.delete(a.page);
    else this.versions.set(a.page, a.after);
  }

  /** Raccourci : calcule l'action vers `next`, l'applique et la renvoie (ou `null` si rien ne change). */
  change(page: number, next: readonly InkStroke[]): InkAction | null {
    const a = this.diff(page, next);
    if (a) this.apply(a);
    return a;
  }
}

const EMPTY: readonly InkStroke[] = Object.freeze([]);

/** Les traits d'écriture de Cigale lus dans la liste des annotations d'un document, dans l'ordre du PDF (donc de superposition). */
export function strokesFromAnnots(annots: readonly Annot[]): InkStroke[] {
  const out: InkStroke[] = [];
  for (const a of annots) {
    if (a.kind !== 'ink' || !a.pen || !a.strokes) continue;
    a.strokes.forEach((points, k) => {
      const pressures = a.pressures?.[k];
      out.push({
        // fichier d'une ancienne version (pas d'identifiant écrit) : un identifiant stable, tiré de la référence de l'annotation
        id: a.strokeIds?.[k] || `l${a.id.replace(' ', '-')}-${k}`,
        page: a.page,
        points,
        ...(pressures && pressures.length === points.length ? { pressures } : {}),
        color: a.color,
        width: a.width,
        pen: a.pen!,
      });
    });
  }
  return out;
}
