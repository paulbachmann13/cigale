/**
 * Ajouter une image (photo, capture, schéma) sur une page : on la décode (l'orientation de l'appareil photo est appliquée),
 * on la réduit si elle est énorme, et on la ré-encode : PNG pour garder la transparence, JPEG sinon.
 */
export interface PreparedImage {
  bytes: Uint8Array;
  width: number;
  height: number;
}

const MAX_SIDE = 2400;

/** Boîte « choisir une image » du système. Renvoie null si on annule. */
export function pickImageFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.id = 'image-file';
    input.style.display = 'none';
    document.body.append(input);
    const done = (f: File | null) => {
      input.remove();
      resolve(f);
    };
    input.addEventListener('change', () => done(input.files?.[0] ?? null));
    input.addEventListener('cancel', () => done(null));
    input.click();
  });
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  const bmp = await createImageBitmap(file); // applique l'orientation EXIF
  try {
    const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const width = Math.max(1, Math.round(bmp.width * k));
    const height = Math.max(1, Math.round(bmp.height * k));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const g = canvas.getContext('2d')!;
    const lossless = /png|gif|webp|svg|bmp/i.test(file.type);
    if (!lossless) {
      g.fillStyle = '#fff'; // un JPEG n'a pas de transparence
      g.fillRect(0, 0, width, height);
    }
    g.drawImage(bmp, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, lossless ? 'image/png' : 'image/jpeg', 0.92));
    if (!blob) throw new Error('image illisible');
    canvas.width = canvas.height = 0;
    return { bytes: new Uint8Array(await blob.arrayBuffer()), width, height };
  } finally {
    bmp.close();
  }
}
