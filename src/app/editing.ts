/**
 * Modifications d'un document (pages) et enregistrement. Toute opération :
 *   1. s'exécute dans un Web Worker sur une copie des octets (annulable) ;
 *   2. produit un NOUVEAU document, adopté seulement si tout a réussi (sinon rien n'a changé) ;
 *   3. s'ajoute à l'historique (annuler / rétablir) ;
 *   4. n'écrit rien sur le disque : seul « Enregistrer » remplace le fichier.
 */
import { moveOrder } from '../data/page-order';
import { fmt, plural, t } from '../i18n/fr';
import { Cancelled, applyOperation, extractOperation, inspectDocument } from '../pdf/ops-client';
import type { PageOp } from '../pdf/page-ops';
import { addBackup } from '../storage/backups';
import { askPassword, confirmDialog, askNumber, showMessage } from './dialogs';
import { toast } from './dom';
import { pickOnePdf } from './files';
import { downloadBytes, ensureWritable, pickSaveHandle, withPdfExtension, writeVerified } from './save';
import type { Session } from './session';

export interface EditHost {
  /** Recharge l'affichage du document avec de nouveaux octets (même page, même zoom). */
  reload(s: Session, bytes: Uint8Array, selection: number[]): Promise<void>;
  /** Ouvre des octets dans un nouvel onglet, comme document pas encore enregistré. */
  openNew(name: string, bytes: Uint8Array): Promise<unknown>;
  /** Rafraîchit les indicateurs (modifié, annuler/rétablir, état). */
  refresh(s: Session): void;
  busy(text: string, onCancel: () => void): void;
  idle(): void;
  setStatus(text: string): void;
  rememberOpened(s: Session): void;
}

export class Editing {
  constructor(private host: EditHost) {}

  // ───────────── opérations sur les pages ─────────────

  /** Exécute une opération ; renvoie false si elle a été refusée, annulée ou a échoué. */
  async run(s: Session, op: PageOp, labelKey: keyof typeof t.pages.labels): Promise<boolean> {
    if (!(await this.confirmRisks(s))) return false;
    const handle = applyOperation(s.history.current, op, s.password);
    this.host.busy(t.busy.working, () => handle.cancel());
    try {
      const result = await handle.promise;
      this.host.idle();
      s.history.push(result.bytes, t.pages.labels[labelKey]);
      await this.host.reload(s, result.bytes, result.selection);
      this.host.refresh(s);
      return true;
    } catch (err) {
      this.host.idle();
      if (err instanceof Cancelled) toast(t.busy.cancelled);
      else await showMessage(t.editErrors.title, fmt(t.editErrors.failed, { name: s.name, detail: (err as Error).message }));
      return false;
    }
  }

  /** Avertit AVANT de modifier un document signé (la signature deviendrait invalide). Une seule fois par session. */
  private async confirmRisks(s: Session): Promise<boolean> {
    if (s.signedAcknowledged) return true;
    try {
      const handle = inspectDocument(s.history.current, s.password);
      const info = await handle.promise;
      if (info.signed) {
        const go = await confirmDialog(t.confirm.signedTitle, fmt(t.confirm.signedMessage, { name: s.name }), t.confirm.signedGo, t.confirm.signedCancel);
        if (!go) return false;
      }
    } catch {
      /* l'analyse a échoué : l'opération elle-même dira ce qui ne va pas */
    }
    s.signedAcknowledged = true;
    return true;
  }

  rotate(s: Session, delta: 90 | -90 | 180): Promise<boolean> {
    return this.withSelection(s, (pages) => this.run(s, { op: 'rotate', pages, delta }, 'rotate'));
  }

  async remove(s: Session): Promise<boolean> {
    return this.withSelection(s, async (pages) => {
      if (pages.length >= s.view.pageCount) {
        toast(t.pages.keepOne);
        return false;
      }
      const ok = await this.run(s, { op: 'delete', pages }, 'delete');
      if (ok) toast(plural(pages.length, t.pages.deleted), { label: t.pages.undo, run: () => void this.undo(s) });
      return ok;
    });
  }

  duplicate(s: Session): Promise<boolean> {
    return this.withSelection(s, (pages) => this.run(s, { op: 'duplicate', pages }, 'duplicate'));
  }

  move(s: Session, pages: number[], to: number): Promise<boolean> {
    const order = moveOrder(s.view.pageCount, pages, to);
    if (order.every((v, i) => v === i)) return Promise.resolve(false); // rien ne change
    return this.run(s, { op: 'move', pages, to }, 'move');
  }

  moveToStart(s: Session): Promise<boolean> {
    return this.withSelection(s, (pages) => this.move(s, pages, 0));
  }
  moveToEnd(s: Session): Promise<boolean> {
    return this.withSelection(s, (pages) => this.move(s, pages, s.view.pageCount));
  }

  async moveTo(s: Session): Promise<boolean> {
    return this.withSelection(s, async (pages) => {
      const max = s.view.pageCount;
      const n = await askNumber(t.pages.moveDialogTitle, fmt(t.pages.moveDialogLabel, { max, end: max + 1 }), 1, max + 1, pages[0] + 1, t.pages.moveOk, t.pages.cancel);
      return n === null ? false : this.move(s, pages, n - 1);
    });
  }

  insertBlank(s: Session, side: 'before' | 'after'): Promise<boolean> {
    return this.withSelection(s, (pages) => this.run(s, { op: 'insertBlank', at: side === 'before' ? pages[0] : pages[pages.length - 1] + 1 }, 'insertBlank'));
  }

  /** Insère les pages d'un autre PDF (choisi par l'utilisateur) avant ou après la sélection (ou à la fin). */
  async insertFromFile(s: Session, side: 'before' | 'after'): Promise<boolean> {
    const file = await pickOnePdf();
    if (!file) return false;
    const other = new Uint8Array(await file.arrayBuffer());
    let password: string | undefined;
    for (let attempt = 0; ; attempt++) {
      try {
        const info = await inspectDocument(other, password).promise;
        const sel = s.selection;
        const at = sel.length === 0 ? s.view.pageCount : side === 'before' ? sel[0] : sel[sel.length - 1] + 1;
        const ok = await this.run(s, { op: 'insertFrom', at, other, otherPassword: password }, 'insertFile');
        if (ok) toast(plural(info.pageCount, t.pages.insertedFile));
        return ok;
      } catch (err) {
        const msg = (err as Error).message ?? '';
        if (/password|encrypt/i.test(msg) || (err as Error).name === 'EncryptedPDFError') {
          const pw = await askPassword(file.name, attempt > 0);
          if (pw === null) return false;
          password = pw;
          continue;
        }
        await showMessage(t.editErrors.title, fmt(t.editErrors.otherFailed, { name: file.name, detail: msg }));
        return false;
      }
    }
  }

  /** Extrait la sélection dans un nouveau document (nouvel onglet, pas encore enregistré). */
  extract(s: Session): Promise<boolean> {
    return this.withSelection(s, async (pages) => {
      const handle = extractOperation(s.history.current, pages, s.password);
      this.host.busy(t.busy.working, () => handle.cancel());
      try {
        const bytes = await handle.promise;
        this.host.idle();
        const base = s.name.replace(/\.pdf$/i, '');
        const name = `${base} (extrait).pdf`;
        await this.host.openNew(name, bytes);
        toast(fmt(t.pages.extracted, { name }));
        return true;
      } catch (err) {
        this.host.idle();
        if (err instanceof Cancelled) toast(t.busy.cancelled);
        else await showMessage(t.editErrors.title, fmt(t.editErrors.failed, { name: s.name, detail: (err as Error).message }));
        return false;
      }
    });
  }

  private async withSelection(s: Session, fn: (pages: number[]) => Promise<boolean>): Promise<boolean> {
    if (s.selection.length === 0) {
      toast(t.pages.needSelection);
      return false;
    }
    return fn(s.selection);
  }

  // ───────────── annuler / rétablir ─────────────

  async undo(s: Session): Promise<void> {
    const bytes = s.history.undo();
    if (!bytes) return;
    await this.host.reload(s, bytes, s.selection);
    this.host.refresh(s);
  }

  async redo(s: Session): Promise<void> {
    const bytes = s.history.redo();
    if (!bytes) return;
    await this.host.reload(s, bytes, s.selection);
    this.host.refresh(s);
  }

  // ───────────── enregistrement ─────────────

  /** ⌘S : remplace le fichier d'origine (après avoir gardé l'ancienne version). Sans accès au fichier : « Enregistrer sous ». */
  async save(s: Session): Promise<boolean> {
    if (!s.handle) return this.saveAs(s);
    return this.writeTo(s, s.handle, false);
  }

  async saveAs(s: Session): Promise<boolean> {
    const suggested = withPdfExtension(s.name);
    let handle: FileSystemFileHandle | null | undefined;
    try {
      handle = await pickSaveHandle(suggested);
    } catch (err) {
      await showMessage(t.editErrors.title, fmt(t.save.failed, { name: s.name, detail: (err as Error).message }));
      return false;
    }
    if (handle === null) return false; // annulé
    if (handle === undefined) {
      // Navigateur sans « Enregistrer sous » (Safari, Firefox) : on télécharge une copie.
      downloadBytes(suggested, s.history.current);
      s.history.markSaved();
      this.host.refresh(s);
      toast(fmt(t.save.downloaded, { name: suggested }));
      return true;
    }
    s.handle = handle;
    s.name = handle.name;
    return this.writeTo(s, handle, true);
  }

  private async writeTo(s: Session, handle: FileSystemFileHandle, isNewFile: boolean): Promise<boolean> {
    const bytes = s.history.current;
    this.host.setStatus(t.status.saving);
    try {
      if (!(await ensureWritable(handle))) throw new Error(t.save.permission);
      // On garde l'ancienne version avant d'écraser (sauf si on écrit dans un nouveau fichier).
      let backedUp = false;
      if (!isNewFile && s.diskBytes && !sameBytes(s.diskBytes, bytes)) {
        await addBackup(s.name, s.diskBytes).then(() => (backedUp = true)).catch(() => undefined);
      }
      const ok = await writeVerified(handle, bytes);
      if (!ok) throw new Error(t.save.verifyFailed);
      s.diskBytes = bytes;
      s.history.markSaved();
      this.host.refresh(s);
      this.host.rememberOpened(s);
      toast(fmt(t.save.done, { name: s.name }) + (backedUp ? ` ${t.save.backupNote}` : ''));
      return true;
    } catch (err) {
      this.host.refresh(s);
      await showMessage(t.editErrors.title, fmt(t.save.failed, { name: s.name, detail: (err as Error).message }));
      return false;
    }
  }
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
