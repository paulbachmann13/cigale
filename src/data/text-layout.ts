/**
 * Remet en lignes et en paragraphes le texte d'une page PDF (pdf.js donne des morceaux de texte positionnés, dans l'ordre du
 * fichier). Logique pure : sert aux exports en texte et en Word. Repère PDF : l'axe des y monte.
 */
export interface TextPiece {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Une ligne de la page, avec sa position (pour détecter les paragraphes). */
interface Line {
  text: string;
  y: number;
  height: number;
}

/** Morceaux de texte → lignes (de haut en bas, de gauche à droite). */
export function toLines(pieces: readonly TextPiece[]): Line[] {
  const items = pieces.filter((p) => p.str.trim() !== '' || p.str === ' ');
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: { y: number; height: number; items: TextPiece[] }[] = [];
  for (const it of sorted) {
    const h = it.height || 10;
    const row = rows.find((r) => Math.abs(r.y - it.y) <= Math.max(2, Math.min(r.height, h) * 0.45));
    if (row) {
      row.items.push(it);
      row.height = Math.max(row.height, h);
    } else rows.push({ y: it.y, height: h, items: [it] });
  }
  return rows
    .sort((a, b) => b.y - a.y)
    .map((r) => {
      const parts = r.items.sort((a, b) => a.x - b.x);
      let text = '';
      let end = -Infinity;
      for (const p of parts) {
        const gap = p.x - end;
        // un trou plus large qu'un quart de la hauteur du texte = une espace (sauf si le morceau commence ou finit déjà par une espace)
        if (text && gap > r.height * 0.22 && !text.endsWith(' ') && !p.str.startsWith(' ')) text += ' ';
        text += p.str;
        end = p.x + p.width;
      }
      return { text: text.replace(/[ \t]+/g, ' ').trim(), y: r.y, height: r.height };
    })
    .filter((l) => l.text !== '');
}

/** Lignes → paragraphes : un saut plus grand qu'un interligne et demi, ou une ligne qui finit une phrase et suivie d'une majuscule, coupe. */
export function toParagraphs(pieces: readonly TextPiece[]): string[] {
  const lines = toLines(pieces);
  const out: string[] = [];
  let current: string[] = [];
  let prev: Line | null = null;
  const flush = () => {
    if (current.length) out.push(current.join(' ').replace(/(\w)- (\w)/g, '$1$2'));
    current = [];
  };
  for (const l of lines) {
    if (prev) {
      const gap = prev.y - l.y;
      const lineHeight = Math.max(prev.height, l.height);
      if (gap > lineHeight * 1.65) flush();
    }
    current.push(l.text);
    prev = l;
  }
  flush();
  return out;
}

/** Texte brut d'une page : un paragraphe par ligne vide. */
export function pageText(pieces: readonly TextPiece[]): string {
  return toParagraphs(pieces).join('\n\n');
}
