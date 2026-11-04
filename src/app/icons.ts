/** Icônes de Cigale (dessins propres, traits de 1,8 px sur une grille de 24). Jamais d'innerHTML : on construit le SVG. */
const NS = 'http://www.w3.org/2000/svg';

const PATHS = {
  rotateLeft: ['M5 9a8 8 0 1 1-1 5', 'M5 4v5h5'],
  rotateRight: ['M19 9a8 8 0 1 0 1 5', 'M19 4v5h-5'],
  duplicate: ['M9 9h10v11H9z', 'M5 15V4h10'],
  trash: ['M4 7h16', 'M9 7V4h6v3', 'M6 7l1 13h10l1-13', 'M10 11v6', 'M14 11v6'],
  extract: ['M5 4h9l5 5v11H5z', 'M14 4v5h5', 'M12 18v-6', 'M9.5 14.5L12 12l2.5 2.5'],
  insert: ['M5 4h9l5 5v11H5z', 'M14 4v5h5', 'M12 12v6', 'M9 15h6'],
  undo: ['M9 7L4 12l5 5', 'M4 12h11a5 5 0 0 1 0 10h-3'],
  redo: ['M15 7l5 5-5 5', 'M20 12H9a5 5 0 0 0 0 10h3'],
  grid: ['M4 4h7v7H4z', 'M13 4h7v7h-7z', 'M4 13h7v7H4z', 'M13 13h7v7h-7z'],
  save: ['M5 4h11l3 3v13H5z', 'M8 4v5h7V4', 'M8 20v-6h8v6'],
  open: ['M3 7h6l2 2h10v10H3z'],
  search: ['M10.5 4a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13z', 'M15.5 15.5L20 20'],
  panel: ['M4 5h16v14H4z', 'M9 5v14'],
  pointer: ['M6 3l12 9-5.5 1.2L15 19l-2.5 1-2.5-5.8L6 17z'],
  highlight: ['M9 14l7-7 3 3-7 7H9z', 'M4 20h8'],
  underline: ['M7 4v7a5 5 0 0 0 10 0V4', 'M5 20h14'],
  strikeout: ['M8 7a4 3 0 0 1 8 0', 'M5 12h14', 'M8 17a4 3 0 0 0 8 0'],
  note: ['M4 4h16v12H10l-4 4v-4H4z'],
  text: ['M5 5h14', 'M12 5v14', 'M9 19h6'],
  pen: ['M4 20l1-4L16 5l3 3L8 19z', 'M14 7l3 3'],
  rect: ['M4 6h16v12H4z'],
  ellipse: ['M4 12a8 6 0 1 0 16 0a8 6 0 1 0-16 0'],
  line: ['M5 19L19 5'],
  arrow: ['M5 19L19 5', 'M10 5h9v9'],
  stamp: ['M8 4h8v7l3 3v2H5v-2l3-3z', 'M5 20h14'],
  comment: ['M4 4h16v12H9l-5 4z', 'M8 9h8', 'M8 12h5'],
  sign: ['M3 17c3-6 5-9 6-9s-2 8 0 8 3-4 5-4 1 3 3 3', 'M3 21h18'],
  tools: ['M15 4a4 4 0 0 0-4 5L4 16l4 4 7-7a4 4 0 0 0 5-4l-3 2-2-2 2-3z'],
  redact: ['M4 6h16v12H4z', 'M7 10h10', 'M7 14h6'],
  split: ['M5 4h14v6H5z', 'M5 14h14v6H5z', 'M3 12h4', 'M10 12h4', 'M17 12h4'],
  crop: ['M7 3v14h14', 'M3 7h14v14'],
  watermark: ['M5 4h14v16H5z', 'M8 15l8-6', 'M8 11l8 6'],
  headerfooter: ['M5 4h14v16H5z', 'M5 8h14', 'M5 16h14'],
  lock: ['M6 11h12v9H6z', 'M8.5 11V8a3.5 3.5 0 0 1 7 0v3'],
  unlock: ['M6 11h12v9H6z', 'M8.5 11V8a3.5 3.5 0 0 1 6.5-1.8'],
  ocr: ['M4 8V4h4', 'M16 4h4v4', 'M20 16v4h-4', 'M8 20H4v-4', 'M8 12h8', 'M8 9h8', 'M8 15h5'],
  region: ['M4 9V4h5', 'M15 4h5v5', 'M20 15v5h-5', 'M9 20H4v-5', 'M9 9h6v6H9z'],
  image: ['M4 5h16v14H4z', 'M4 16l5-5 4 4 3-3 4 4', 'M15.5 9.5a1 1 0 1 0 0-.01'],
} as const;

export type IconName = keyof typeof PATHS;

export function icon(name: IconName, size = 18): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of PATHS[name]) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}
