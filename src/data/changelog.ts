/** Lecture du CHANGELOG.md embarqué (pure, testée) pour la fenêtre « Nouveautés ». */
export interface ChangelogSection {
  title: string;
  items: string[];
}
export interface ChangelogEntry {
  version: string;
  date: string;
  sections: ChangelogSection[];
}

export function parseChangelog(md: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  let entry: ChangelogEntry | null = null;
  let section: ChangelogSection | null = null;
  for (const line of md.split(/\r?\n/)) {
    const v = /^## \[([^\]]+)\]\s*(?:—|-)\s*(\S+)/.exec(line);
    if (v) {
      entry = { version: v[1], date: v[2], sections: [] };
      entries.push(entry);
      section = null;
      continue;
    }
    const s = /^### (.+)$/.exec(line);
    if (s && entry) {
      section = { title: s[1].trim(), items: [] };
      entry.sections.push(section);
      continue;
    }
    const item = /^- (.+)$/.exec(line);
    if (item && section) section.items.push(item[1]);
    else if (/^\s+\S/.test(line) && section && section.items.length) section.items[section.items.length - 1] += ' ' + line.trim();
  }
  return entries;
}

/** Retire le balisage gras (**…**) pour l'affichage en texte simple. */
export function stripMarkup(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, '$1');
}
