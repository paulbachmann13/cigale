/** Liste des fichiers récents (pure, testée). Seuls des noms et des dates sont gardés. */
export interface RecentEntry {
  id: string;
  name: string;
  size: number;
  openedAt: number;
}

export const MAX_RECENTS = 12;

/** Ajoute en tête ; un fichier déjà présent (même identifiant) remonte au lieu d'être dupliqué. */
export function addRecent(list: RecentEntry[], entry: RecentEntry, max = MAX_RECENTS): RecentEntry[] {
  return [entry, ...list.filter((e) => e.id !== entry.id)].slice(0, max);
}

export function removeRecent(list: RecentEntry[], id: string): RecentEntry[] {
  return list.filter((e) => e.id !== id);
}

export function parseRecents(json: string | null): RecentEntry[] {
  if (!json) return [];
  try {
    const raw: unknown = JSON.parse(json);
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (e): e is RecentEntry =>
        !!e && typeof e.id === 'string' && typeof e.name === 'string' && typeof e.size === 'number' && typeof e.openedAt === 'number',
    );
  } catch {
    return [];
  }
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  const units = ['Ko', 'Mo', 'Go'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toLocaleString('fr-FR', { maximumFractionDigits: v < 10 ? 1 : 0 })} ${units[i]}`;
}
