export interface PenFavorite {
  pen: 'pen' | 'fountain' | 'highlighter';
  color: [number, number, number];
  width: number;
}

export type ThemeChoice = 'auto' | 'light' | 'dark';
export type DefaultZoom = 'page-width' | 'page-fit' | 'page-actual';

export interface Settings {
  theme: ThemeChoice;
  defaultZoom: DefaultZoom;
  /** Garder l'ancienne version avant d'écraser un fichier (stockée sur cet ordinateur). */
  keepVersions: boolean;
  /** Nom inscrit dans les commentaires. */
  author: string;
  /** Garder une copie du travail non enregistré (reprise après une fermeture imprévue). */
  autosave: boolean;
  /** Application Mac : chercher une mise à jour au démarrage. */
  autoUpdate: boolean;
  /** Écriture : maintenir le stylet immobile en fin de trait le redresse (ligne, cercle, rectangle…). */
  shapeSnap: boolean;
  /** Ouvrir chaque PDF directement avec le stylo prêt (barre d'écriture visible). */
  penOnOpen: boolean;
  /** Écriture : le doigt écrit aussi, même après l'usage d'un stylet (sinon il fait défiler la page). */
  fingerWrites: boolean;
  /** Stylos favoris (type, couleur, épaisseur), 6 au plus. */
  penFavorites: PenFavorite[];
}

const KEY = 'cigale-settings';
const DEFAULTS: Settings = { theme: 'auto', defaultZoom: 'page-width', keepVersions: true, author: '', autosave: true, autoUpdate: true, shapeSnap: true, fingerWrites: false, penOnOpen: false, penFavorites: [
  { pen: 'pen', color: [0.1, 0.1, 0.15], width: 1.5 },
  { pen: 'fountain', color: [0.1, 0.25, 0.6], width: 2.5 },
  { pen: 'highlighter', color: [1, 0.9, 0.1], width: 14 },
] };

export function loadSettings(): Settings {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignoré */
  }
  applyTheme(s.theme);
}

export function applyTheme(theme: ThemeChoice): void {
  if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', theme);
}
