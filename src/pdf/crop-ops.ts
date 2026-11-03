/** Recadrer les pages : la zone visible (CropBox) est réduite de marges exprimées comme à l'écran (haut, droite, bas, gauche). */
import { PageOpError, loadForEdit } from './page-ops';
import { saveDoc } from './protection';

export interface CropMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface CropResult {
  bytes: Uint8Array;
  cropped: number;
}

/** Zone visible actuelle : CropBox si elle existe, sinon MediaBox. */
function visibleBox(page: import('@cantoo/pdf-lib').PDFPage): { x: number; y: number; width: number; height: number } {
  const c = page.getCropBox();
  return c.width > 0 && c.height > 0 ? c : page.getMediaBox();
}

/**
 * Recadre les pages choisies. Les marges sont celles qu'on voit à l'écran : une page tournée de 90° se recadre comme elle
 * s'affiche. Le contenu n'est PAS supprimé (la zone visible change seulement) : pour retirer du contenu, utilisez le caviardage.
 */
export async function cropPages(bytes: Uint8Array, margins: CropMargins, pages?: number[], password?: string, expectedPages?: number): Promise<CropResult> {
  const doc = await loadForEdit(bytes, password);
  if (expectedPages !== undefined && doc.getPageCount() !== expectedPages) throw new PageOpError('structure');
  const all = doc.getPages();
  const targets = (pages ?? all.map((_, i) => i)).filter((i) => i >= 0 && i < all.length);
  let cropped = 0;
  for (const i of new Set(targets)) {
    const page = all[i];
    const box = visibleBox(page);
    const rot = ((page.getRotation().angle % 360) + 360) % 360;
    // marges (haut, droite, bas, gauche à l'écran) → marges dans le repère non tourné de la page
    const m =
      rot === 90 ? { top: margins.right, right: margins.bottom, bottom: margins.left, left: margins.top } // sens horaire : le haut affiché est le bord gauche
      : rot === 180 ? { top: margins.bottom, right: margins.left, bottom: margins.top, left: margins.right }
      : rot === 270 ? { top: margins.left, right: margins.top, bottom: margins.right, left: margins.bottom }
      : margins;
    const x = box.x + m.left;
    const y = box.y + m.bottom;
    const width = box.width - m.left - m.right;
    const height = box.height - m.top - m.bottom;
    if (width < 10 || height < 10) throw new PageOpError('structure');
    page.setCropBox(x, y, width, height);
    cropped++;
  }
  return { bytes: await saveDoc(doc), cropped };
}
