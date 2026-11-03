import type { History } from '../data/history';
import type { DocView } from '../pdf/viewer';
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
}
