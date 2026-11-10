/**
 * Historique des modifications d'un document. Deux sortes d'étapes :
 *  - une opération sur le PDF (pages, commentaires…) garde les octets complets du résultat (simple et sûr) ;
 *  - une étape d'écriture à la main ne garde que la petite action sur l'encre (`ink`) et PARTAGE les octets de l'étape
 *    précédente : écrire mille traits ne coûte pas mille copies du PDF.
 */
import type { InkAction } from './ink-model';

export interface Snapshot {
  bytes: Uint8Array;
  /** Ce qui a mené à cet état (« Pivoter 2 pages »). Vide pour l'état d'origine. */
  label: string;
  /** Étape d'écriture : les actions sur l'encre qui mènent à cet état (les octets sont ceux de l'étape d'avant, ou une version où l'encre a été écrite). */
  ink?: InkAction[];
}

export class History {
  private stack: Snapshot[];
  private cursor = 0;
  /** Position correspondant au fichier enregistré ; null si cet état a été oublié (limite de mémoire). */
  private saved: number | null;

  constructor(initial: Uint8Array, savedInitially: boolean, private readonly maxBytes = 400 * 1024 * 1024) {
    this.stack = [{ bytes: initial, label: '' }];
    this.saved = savedInitially ? 0 : null;
  }

  get current(): Uint8Array {
    return this.stack[this.cursor].bytes;
  }
  get canUndo(): boolean {
    return this.cursor > 0;
  }
  get canRedo(): boolean {
    return this.cursor < this.stack.length - 1;
  }
  /** Libellé de l'opération qu'« Annuler » défait. */
  get undoLabel(): string {
    return this.canUndo ? this.stack[this.cursor].label : '';
  }
  get redoLabel(): string {
    return this.canRedo ? this.stack[this.cursor + 1].label : '';
  }
  get dirty(): boolean {
    return this.saved !== this.cursor;
  }
  /** Actions d'encre qu'« Annuler » déferait (absent si l'étape courante est une opération sur le PDF). */
  get undoInk(): InkAction[] | undefined {
    return this.canUndo ? this.stack[this.cursor].ink : undefined;
  }
  /** Actions d'encre que « Rétablir » referait. */
  get redoInk(): InkAction[] | undefined {
    return this.canRedo ? this.stack[this.cursor + 1].ink : undefined;
  }

  /** Étape d'écriture à la main : aucune copie du PDF, seulement l'action. */
  pushInk(ink: InkAction[], label: string): void {
    this.stack.length = this.cursor + 1;
    if (this.saved !== null && this.saved > this.cursor) this.saved = null;
    this.stack.push({ bytes: this.current, label, ink });
    this.cursor++;
    this.trim();
  }

  /**
   * L'encre vient d'être écrite dans le PDF : l'étape courante garde ces nouveaux octets (même état pour l'utilisateur, autre
   * représentation). Les étapes voisines gardent les leurs : annuler un trait revient à leur encre, pas à ces octets.
   */
  replaceCurrent(bytes: Uint8Array): void {
    this.stack[this.cursor] = { ...this.stack[this.cursor], bytes };
  }

  push(bytes: Uint8Array, label: string): void {
    this.stack.length = this.cursor + 1; // on perd les « rétablir »
    if (this.saved !== null && this.saved > this.cursor) this.saved = null;
    this.stack.push({ bytes, label });
    this.cursor++;
    this.trim();
  }

  undo(): Uint8Array | null {
    if (!this.canUndo) return null;
    this.cursor--;
    return this.current;
  }

  redo(): Uint8Array | null {
    if (!this.canRedo) return null;
    this.cursor++;
    return this.current;
  }

  /**
   * Le fichier enregistré correspond à l'état `bytes` (celui qui a été écrit), pas forcément à l'état courant : pendant
   * l'écriture, l'utilisateur a pu continuer à modifier ou annuler. Sans argument : l'état courant.
   */
  markSaved(bytes?: Uint8Array): void {
    if (!bytes) {
      this.saved = this.cursor;
      return;
    }
    // plusieurs étapes d'écriture peuvent partager les mêmes octets : l'étape courante d'abord
    const at = this.stack[this.cursor].bytes === bytes ? this.cursor : this.stack.findIndex((s) => s.bytes === bytes);
    this.saved = at >= 0 ? at : null; // état oublié ou inconnu : le document reste « modifié »
  }

  /** Oublie les plus anciennes étapes quand la mémoire dépasse la limite (au moins 2 étapes restent). */
  private trim(): void {
    // des étapes d'écriture partagent leurs octets : chaque tableau ne compte qu'une fois
    const size = () => [...new Set(this.stack.map((s) => s.bytes))].reduce((n, b) => n + b.length, 0);
    let total = size();
    while (total > this.maxBytes && this.cursor > 0 && this.stack.length > 2) {
      this.stack.shift();
      total = size();
      this.cursor--;
      if (this.saved !== null) this.saved = this.saved > 0 ? this.saved - 1 : null;
    }
  }
}
