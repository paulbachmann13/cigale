import type { History } from '../data/history';
import type { DocView } from '../pdf/viewer';
import type { Annot } from '../data/annotations';
import type { Annotator } from './annotator';
import type { CommentsPanel } from './comments';
import type { InkStore } from './ink-store';
import type { PageList } from './pagelist';

/**
 * Un document ouvert dans un onglet.
 * `history.current` = document en mémoire (avec les modifications) ; `diskBytes` = ce qui est actuellement sur le disque.
 * L'original n'est remplacé que par « Enregistrer ».
 */
export interface Session {
  id: number;
  name: string;
  history: History;
  diskBytes: Uint8Array | null;
  password?: string;
  handle?: FileSystemFileHandle;
  signedAcknowledged: boolean;
  /** Pages sélectionnées (indices à partir de 0). */
  selection: number[];
  organizing: boolean;
  view: DocView;
  thumbs: PageList;
  grid: PageList | null;
  outline: HTMLElement;
  tab: HTMLElement;
  /** Commentaires du document (relus après chaque modification). */
  annots: Annot[];
  annotator: Annotator;
  comments: CommentsPanel;
  /** Commentaire à sélectionner dès que la liste est relue (après un ajout). */
  pendingSelect: string | null;
  /** Identifiant de la sauvegarde automatique de ce document. */
  draftId: string;
  draftTimer?: number;
  /** Traits écrits au stylet, pas encore envoyés au document. */
  ink: InkStore;
  /** Des champs de formulaire ont été remplis à l'écran mais pas encore écrits dans le document. */
  formModified: boolean;
  /** Le document a des champs de formulaire. */
  hasForm: boolean;
  /** Caviardage appliqué : aucune copie de l'ancienne version (elle contient le texte caviardé) n'est gardée à l'enregistrement. */
  noBackup?: boolean;
  /** L'avertissement « document protégé » a déjà été donné (ou n'a pas lieu d'être : on change la protection nous-mêmes). */
  encryptedAck?: boolean;
}

/** Modifié = historique modifié OU saisie de formulaire OU traits en attente. */
export const isDirty = (s: Pick<Session, 'history' | 'formModified' | 'ink'>): boolean => s.history.dirty || s.formModified || s.ink.hasPending;
