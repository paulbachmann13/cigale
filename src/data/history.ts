/** Historique des modifications d'un document : chaque étape garde les octets complets (simple et sûr). */
export interface Snapshot {
  bytes: Uint8Array;
  /** Ce qui a mené à cet état (« Pivoter 2 pages »). Vide pour l'état d'origine. */
  label: string;
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

  markSaved(): void {
    this.saved = this.cursor;
  }

  /** Oublie les plus anciennes étapes quand la mémoire dépasse la limite (au moins 2 étapes restent). */
  private trim(): void {
    let total = this.stack.reduce((n, s) => n + s.bytes.length, 0);
    while (total > this.maxBytes && this.cursor > 0 && this.stack.length > 2) {
      total -= this.stack[0].bytes.length;
      this.stack.shift();
      this.cursor--;
      if (this.saved !== null) this.saved = this.saved > 0 ? this.saved - 1 : null;
    }
  }
}
