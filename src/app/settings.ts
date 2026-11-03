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
}

const KEY = 'cigale-settings';
const DEFAULTS: Settings = { theme: 'auto', defaultZoom: 'page-width', keepVersions: true, author: '', autosave: true, autoUpdate: true };

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
