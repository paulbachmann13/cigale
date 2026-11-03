import type { DocView } from '../pdf/viewer';
import type { ThumbnailPanel } from './thumbnails';

/** Un document ouvert dans un onglet. `bytes` garde l'original, jamais modifié (base des futures opérations). */
export interface Session {
  id: number;
  name: string;
  size: number;
  bytes: Uint8Array;
  handle?: FileSystemFileHandle;
  view: DocView;
  thumbs: ThumbnailPanel;
  outline: HTMLElement;
  tab: HTMLElement;
}
