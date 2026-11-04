/**
 * Modifications d'un document (pages) et enregistrement. Toute opération :
 *   1. s'exécute dans un Web Worker sur une copie des octets (annulable) ;
 *   2. produit un NOUVEAU document, adopté seulement si tout a réussi (sinon rien n'a changé) ;
 *   3. s'ajoute à l'historique (annuler / rétablir) ;
 *   4. n'écrit rien sur le disque : seul « Enregistrer » remplace le fichier.
 */
import { moveOrder } from '../data/page-order';
import { fmt, plural, t } from '../i18n/fr';
import type { AnnotDraft, AnnotPatch } from '../data/annotations';
import type { CropMargins } from '../pdf/crop-ops';
import type { RedactOptions, RedactedPage } from '../pdf/redact-ops';
import type { HeaderFooterOptions, WatermarkOptions } from '../pdf/stamp-ops';
import type { OcrPage } from '../pdf/ocr-ops';
import type { ProtectOptions } from '../pdf/protect-ops';
import { Cancelled, ocrLayerOp, addAnnotationsOp, protectOp, unprotectOp, cropOp, headerFooterOp, redactOp, watermarkOp, fillFormOp, applyOperation, deleteAnnotationsOp, extractOperation, inspectDocument, updateAnnotationOp } from '../pdf/ops-client';
import { type PageOp, PageOpError } from '../pdf/page-ops';
import { addBackup } from '../storage/backups';
import { askPassword, confirmDialog, askNumber, showMessage } from './dialogs';
import { toast } from './dom';
import { collectFormValues } from './forms';
import { loadSettings } from './settings';
import { backupPathFor, baseName, pathOfHandle, writeBackupCopy } from './tauri-files';
import { pickOnePdf } from './files';
import { downloadBytes, ensureWritable, pickSaveHandle, withPdfExtension, writeVerified } from './save';
import type { Session } from './session';

export interface EditHost {
  /** Recharge l'affichage du document avec de nouveaux octets (même page, même zoom). */
  reload(s: Session, bytes: Uint8Array, selection: number[], expectedPages?: number): Promise<void>;
  /** Ouvre des octets dans un nouvel onglet, comme document pas encore enregistré. */
  openNew(name: string, bytes: Uint8Array): Promise<unknown>;
  /** Rafraîchit les indicateurs (modifié, annuler/rétablir, état). */
  refresh(s: Session): void;
  busy(text: string, onCancel: () => void): void;
  idle(): void;
  setStatus(text: string): void;
  rememberOpened(s: Session): void;
  /** Sélectionner ce commentaire dès que la liste est relue. */
  pendingSelect(s: Session, id: string | null): void;
  /** Après un caviardage : efface l'historique Annuler, les copies de sécurité et les sauvegardes qui contiennent encore le texte d'origine. */
  forgetOriginal(s: Session): Promise<void>;
  /** Repart d'un historique vide (le document en mémoire devient l'état de départ, « modifié »). */
  resetHistory(s: Session): Promise<void>;
  author(): string;
}

export class Editing {
  /** Les opérations qui rechargent le document passent l'une après l'autre (⌘Z maintenu, clics rapides). */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private host: EditHost) {}

  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn);
    this.queue = next.catch(() => undefined);
    return next;
  }

  // ───────────── opérations sur les pages ─────────────

  /** Exécute une opération ; renvoie false si elle a été refusée, annulée ou a échoué. */
  run(s: Session, op: PageOp, labelKey: keyof typeof t.pages.labels): Promise<boolean> {
    return this.serial(() => this.runNow(s, op, labelKey));
  }

  private async runNow(s: Session, op: PageOp, labelKey: keyof typeof t.pages.labels): Promise<boolean> {
    if (!(await this.flushFormInner(s))) return false; // la saisie en cours entre d'abord dans le document
    if (!(await this.confirmRisks(s))) return false;
    const handle = applyOperation(s.history.current, op, s.password, s.view.pageCount);
    this.host.busy(t.busy.working, () => handle.cancel());
    try {
      const result = await handle.promise;
      this.host.idle();
      // Le nouveau document doit s'ouvrir dans pdf.js AVANT d'être adopté : sinon rien ne change.
      await this.host.reload(s, result.bytes, result.selection, result.pageCount);
      s.history.push(result.bytes, t.pages.labels[labelKey]);
      this.host.refresh(s);
      return true;
    } catch (err) {
      this.host.idle();
      if (err instanceof Cancelled) toast(t.busy.cancelled);
      else await showMessage(t.editErrors.title, fmt(t.editErrors.failed, { name: s.name, detail: describe(err) }));
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
      if (info.encrypted && !s.encryptedAck) {
        const go = await confirmDialog(t.confirm.encryptedTitle, fmt(t.confirm.encryptedMessage, { name: s.name }), t.confirm.encryptedGo, t.confirm.signedCancel);
        if (!go) return false;
        s.encryptedAck = true;
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
      if (!(await this.flushForm(s))) return false;
      const handle = extractOperation(s.history.current, pages, s.password, s.view.pageCount);
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
        else await showMessage(t.editErrors.title, fmt(t.editErrors.failed, { name: s.name, detail: describe(err) }));
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

  // ───────────── outils de page : filigrane, en-têtes, recadrage, caviardage ─────────────

  watermark(s: Session, options: WatermarkOptions): Promise<boolean> {
    return this.annotOp(s, t.docTools.labels.watermark, () => watermarkOp(s.history.current, options, s.password, s.view.pageCount).promise);
  }

  /** Ajoute la couche de texte invisible issue de la reconnaissance de texte (OCR). */
  ocrLayer(s: Session, pages: OcrPage[]): Promise<boolean> {
    return this.annotOp(s, t.docTools.labels.ocr, () => ocrLayerOp(s.history.current, pages, s.password, s.view.pageCount).promise);
  }

  headerFooter(s: Session, options: HeaderFooterOptions): Promise<boolean> {
    return this.annotOp(s, t.docTools.labels.headerFooter, () => headerFooterOp(s.history.current, options, s.password, s.view.pageCount).promise);
  }

  crop(s: Session, margins: CropMargins, pages?: number[]): Promise<boolean> {
    return this.annotOp(s, t.docTools.labels.crop, async () => (await cropOp(s.history.current, margins, pages, s.password, s.view.pageCount).promise).bytes);
  }

  /** Applique le caviardage : les pages (déjà noircies, en images) remplacent les pages d'origine. */
  async redact(s: Session, pages: RedactedPage[], options: RedactOptions, clearHistory: boolean): Promise<boolean> {
    const ok = await this.annotOp(s, t.docTools.labels.redact, async () => (await redactOp(s.history.current, pages, options, s.password, s.view.pageCount).promise).bytes);
    if (ok) s.noBackup = true; // quoi qu'il arrive, aucune copie de l'ancienne version (elle contient le texte caviardé)
    if (ok && clearHistory) await this.host.forgetOriginal(s);
    return ok;
  }

  /** Protège le document par mot de passe (AES-256). L'historique est effacé : les anciennes versions ont un autre mot de passe. */
  async protect(s: Session, options: ProtectOptions): Promise<boolean> {
    const oldPassword = s.password;
    s.encryptedAck = true; // on change nous-mêmes la protection : l'avertissement n'a pas lieu d'être
    const ok = await this.annotOp(s, t.docTools.labels.protect, async () => {
      const r = await protectOp(s.history.current, options, s.password, s.view.pageCount).promise;
      s.password = options.userPassword || undefined; // le rechargement et les opérations suivantes utilisent le nouveau mot de passe
      return r.bytes;
    });
    if (!ok) s.password = oldPassword;
    else await this.host.forgetOriginal(s); // les copies et sauvegardes non protégées ne doivent pas rester
    return ok;
  }

  async unprotect(s: Session): Promise<boolean> {
    const oldPassword = s.password;
    s.encryptedAck = true;
    const ok = await this.annotOp(s, t.docTools.labels.unprotect, async () => {
      const r = await unprotectOp(s.history.current, s.password, s.view.pageCount).promise;
      s.password = undefined;
      if (!r.wasProtected) toast(t.docTools.notProtected);
      return r.bytes;
    });
    if (!ok) s.password = oldPassword;
    else await this.host.resetHistory(s);
    return ok;
  }

  // ───────────── formulaires ─────────────

  /** Écrit dans le document les champs remplis à l'écran (une étape annuler/rétablir). */
  flushForm(s: Session): Promise<boolean> {
    return this.serial(() => this.flushFormInner(s));
  }

  private async flushFormInner(s: Session): Promise<boolean> {
    if (!s.formModified) return true;
    try {
      const values = await collectFormValues(s.view.pdf);
      if (values.length === 0) {
        s.formModified = false;
        this.host.refresh(s);
        return true;
      }
      if (!(await this.confirmRisks(s))) return false;
      const r = await fillFormOp(s.history.current, values, s.password, s.view.pageCount).promise;
      await this.host.reload(s, r.bytes, s.selection, s.view.pageCount);
      s.history.push(r.bytes, t.annot.labels.fillForm);
      s.formModified = false;
      this.host.refresh(s);
      if (r.skipped.length) toast(fmt(t.form.skipped, { n: r.skipped.length }));
      return true;
    } catch (err) {
      await showMessage(t.editErrors.title, fmt(t.annot.failed, { name: s.name, detail: describe(err) }));
      return false;
    }
  }

  // ───────────── commentaires ─────────────

  addAnnots(s: Session, drafts: AnnotDraft[], label: keyof typeof t.annot.labels = 'add'): Promise<boolean> {
    return this.annotOp(s, label, async () => {
      const h = addAnnotationsOp(s.history.current, drafts, s.password, s.view.pageCount, this.host.author());
      const r = await h.promise;
      this.host.pendingSelect(s, r.ids[r.ids.length - 1] ?? null);
      return r.bytes;
    });
  }

  updateAnnot(s: Session, id: string, patch: AnnotPatch, label: keyof typeof t.annot.labels = 'edit'): Promise<boolean> {
    return this.annotOp(s, label, async () => {
      this.host.pendingSelect(s, id);
      return updateAnnotationOp(s.history.current, id, patch, s.password, s.view.pageCount).promise;
    });
  }

  removeAnnots(s: Session, ids: string[]): Promise<boolean> {
    return this.annotOp(s, 'delete', () => deleteAnnotationsOp(s.history.current, ids, s.password, s.view.pageCount).promise);
  }

  /** Même chemin que les pages : file d'attente, document adopté seulement s'il s'ouvre, historique, aucune écriture disque. */
  private annotOp(s: Session, label: keyof typeof t.annot.labels | string, work: () => Promise<Uint8Array>): Promise<boolean> {
    return this.serial(async () => {
      if (!(await this.flushFormInner(s))) return false;
      if (!(await this.confirmRisks(s))) return false;
      try {
        const bytes = await work();
        await this.host.reload(s, bytes, s.selection, s.view.pageCount);
        s.history.push(bytes, (t.annot.labels as Record<string, string>)[label] ?? label);
        this.host.refresh(s);
        return true;
      } catch (err) {
        this.host.pendingSelect(s, null);
        await showMessage(t.editErrors.title, fmt(t.annot.failed, { name: s.name, detail: describe(err) }));
        return false;
      }
    });
  }

  // ───────────── annuler / rétablir ─────────────

  undo(s: Session): Promise<void> {
    return this.serial(() => this.step(s, 'undo'));
  }

  redo(s: Session): Promise<void> {
    return this.serial(() => this.step(s, 'redo'));
  }

  private async step(s: Session, dir: 'undo' | 'redo'): Promise<void> {
    if (!(await this.flushFormInner(s))) return;
    const bytes = dir === 'undo' ? s.history.undo() : s.history.redo();
    if (!bytes) return;
    try {
      await this.host.reload(s, bytes, s.selection);
    } catch (err) {
      if (dir === 'undo') s.history.redo();
      else s.history.undo(); // l'affichage n'a pas changé : l'historique non plus
      await showMessage(t.editErrors.title, fmt(t.editErrors.failed, { name: s.name, detail: describe(err) }));
    }
    this.host.refresh(s);
  }

  // ───────────── enregistrement ─────────────

  /** ⌘S : remplace le fichier d'origine (après avoir gardé l'ancienne version). Sans accès au fichier : « Enregistrer sous ». */
  async save(s: Session): Promise<boolean> {
    if (!(await this.flushForm(s))) return false;
    if (!s.handle) return this.saveAs(s);
    return this.writeTo(s, s.handle, false);
  }

  async saveAs(s: Session): Promise<boolean> {
    if (!(await this.flushForm(s))) return false;
    const suggested = withPdfExtension(s.name);
    let handle: FileSystemFileHandle | null | undefined;
    try {
      handle = await pickSaveHandle(suggested);
    } catch (err) {
      await showMessage(t.editErrors.title, fmt(t.save.failed, { name: s.name, detail: describe(err) }));
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
    return this.writeTo(s, handle, true);
  }

  private async writeTo(s: Session, handle: FileSystemFileHandle, isNewFile: boolean): Promise<boolean> {
    const bytes = s.history.current;
    this.host.setStatus(t.status.saving);
    try {
      if (!(await ensureWritable(handle))) throw new Error(t.save.permission);
      // On garde l'ancienne version avant d'écraser (sauf si on écrit dans un nouveau fichier).
      let backedUp = false;
      if (!s.noBackup && !isNewFile && loadSettings().keepVersions && s.diskBytes && !sameBytes(s.diskBytes, bytes)) {
        await addBackup(s.name, s.diskBytes).then(() => (backedUp = true)).catch(() => undefined);
      }
      // Application Mac : vraie copie « nom.pdf.bak » à côté du fichier, avant de le remplacer.
      const path = pathOfHandle(handle);
      let bak = '';
      let bakFailed = false;
      // « Enregistrer sous » vers un fichier qui existe déjà le remplace aussi : même copie .bak
      if (!s.noBackup && path && (isNewFile || (s.diskBytes && !sameBytes(s.diskBytes, bytes)))) {
        try {
          if (await writeBackupCopy(path)) bak = baseName(backupPathFor(path));
        } catch {
          bakFailed = true; // on n'empêche pas l'enregistrement, mais on le dit
        }
      }
      const ok = await writeVerified(handle, bytes);
      if (!ok) throw new Error(t.save.verifyFailed);
      // Succès seulement : la session ne bascule sur le nouveau fichier qu'après une écriture vérifiée.
      s.handle = handle;
      s.name = handle.name;
      s.diskBytes = bytes;
      s.history.markSaved();
      this.host.refresh(s);
      this.host.rememberOpened(s);
      toast(fmt(t.save.done, { name: s.name }) + (bak ? ` ${fmt(t.save.bakNote, { bak })}` : bakFailed ? ` ${t.save.bakFailed}` : backedUp ? ` ${t.save.backupNote}` : ''));
      return true;
    } catch (err) {
      this.host.refresh(s);
      await showMessage(t.editErrors.title, fmt(t.save.failed, { name: isNewFile ? handle.name : s.name, detail: describe(err) }));
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

/** Texte lisible pour une erreur d'opération (les codes de PageOpError viennent de fr.ts). */
function describe(err: unknown): string {
  if (err instanceof PageOpError || ['noSelection', 'keepOne', 'structure', 'badImage'].includes((err as Error)?.name)) {
    return t.editErrors.codes[(err as Error).name as 'noSelection' | 'keepOne' | 'structure' | 'badImage'];
  }
  return (err as Error)?.message ?? String(err);
}
