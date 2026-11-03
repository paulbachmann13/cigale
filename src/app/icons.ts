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
