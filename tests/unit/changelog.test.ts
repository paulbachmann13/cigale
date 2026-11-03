import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseChangelog, stripMarkup } from '../../src/data/changelog';

const md = readFileSync(new URL('../../CHANGELOG.md', import.meta.url), 'utf8');
const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string };

describe('CHANGELOG', () => {
  it('contient une entrée pour la version de package.json', () => {
    const entries = parseChangelog(md);
    expect(entries.find((e) => e.version === version)).toBeTruthy();
  });
  it('lit versions, sections et lignes', () => {
    const [e] = parseChangelog('## [1.2.3] — 2026-01-02\n\n### Ajouté\n- un\n- deux\n  suite\n### Corrigé\n- trois\n');
    expect(e.version).toBe('1.2.3');
    expect(e.sections.map((s) => s.title)).toEqual(['Ajouté', 'Corrigé']);
    expect(e.sections[0].items).toEqual(['un', 'deux suite']);
  });
  it('retire le gras', () => expect(stripMarkup('un **mot** gras')).toBe('un mot gras'));
});
