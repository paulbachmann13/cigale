/**
 * L'encre d'une session (un document ouvert) : le modèle de tous les traits, la sélection au lasso et la règle.
 * Vit dans la session — pas dans le calque, recréé à chaque rechargement de la vue.
 */
import { InkModel } from '../data/ink-model';

/** Règle virtuelle : position en pixels par rapport à la zone du document ; (0, 0) = pas encore placée. */
export interface RulerState {
  visible: boolean;
  cx: number;
  cy: number;
  angle: number;
  length: number;
}

/** Ce que le lasso a choisi sur une page : des traits d'écriture (par identifiant) et d'autres annotations (par référence PDF). */
export interface LassoSelection {
  page: number;
  strokeIds: string[];
  annotIds: string[];
}

export class InkStore {
  /** Tous les traits d'écriture du document : source de vérité pendant la session. */
  readonly model = new InkModel();
  lasso: LassoSelection | null = null;
  ruler: RulerState = { visible: false, cx: 0, cy: 0, angle: 0, length: 0 };
  /** L'encre écrite dans le PDF (`history.current`) est en retard sur la vue pdf.js : à recharger avant d'imprimer, exporter… */
  viewStale = false;
  /** La rangée des anciens traits dans leur calque a déjà été tentée pour ce document (évite de boucler). */
  migrated = false;

  get hasLasso(): boolean {
    return !!this.lasso && this.lasso.strokeIds.length + this.lasso.annotIds.length > 0;
  }
}
