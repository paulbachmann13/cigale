import { describe, expect, it } from 'vitest';
// Mêmes garanties que Grillon : notes de la bonne version, un fichier pour les deux architectures.
// @ts-expect-error script Node sans déclaration de types
import { buildManifest, notesFor } from '../../scripts/make-latest-json.mjs';

const CHANGELOG = `# Changelog

## [1.12.0] — 2026-11-01

### Ajouté
- Une chose.

## [1.11.0] — 2026-10-18

### Ajouté
- Formules en français.
`;

describe('latest.json (mises à jour)', () => {
  it('reprend les notes de la version dans le CHANGELOG', () => {
    expect(notesFor(CHANGELOG, '1.11.0')).toBe('### Ajouté\n- Formules en français.');
    expect(notesFor(CHANGELOG, '1.12.0')).toBe('### Ajouté\n- Une chose.');
    expect(notesFor(CHANGELOG, '9.9.9')).toBe('Cigale 9.9.9');
    // Le point d'une version n'est pas un « n'importe quel caractère ».
    expect(notesFor(CHANGELOG, '1x11x0')).toBe('Cigale 1x11x0');
  });

  it('un même fichier pour Apple Silicon et Intel, avec la signature', () => {
    const m = buildManifest({ version: '1.12.0', signature: 'dW50cnVzdGVk\n', url: 'https://example.com/Cigale.app.tar.gz', notes: 'n', date: new Date('2026-11-01T10:00:00Z') });
    expect(m).toEqual({
      version: '1.12.0',
      notes: 'n',
      pub_date: '2026-11-01T10:00:00.000Z',
      platforms: {
        'darwin-aarch64': { signature: 'dW50cnVzdGVk', url: 'https://example.com/Cigale.app.tar.gz' },
        'darwin-x86_64': { signature: 'dW50cnVzdGVk', url: 'https://example.com/Cigale.app.tar.gz' },
      },
    });
  });

  it('avec Windows : une entrée de plus, sans toucher à celles du Mac', () => {
    const m = buildManifest({
      version: '1.4.0',
      signature: 'mac',
      url: 'https://example.com/Cigale.app.tar.gz',
      notes: 'n',
      windows: { signature: 'win\n', url: 'https://example.com/Cigale_1.4.0_x64-setup.exe' },
    });
    expect(Object.keys(m.platforms).sort()).toEqual(['darwin-aarch64', 'darwin-x86_64', 'windows-x86_64']);
    expect(m.platforms['windows-x86_64']).toEqual({ signature: 'win', url: 'https://example.com/Cigale_1.4.0_x64-setup.exe' });
    expect(m.platforms['darwin-aarch64'].signature).toBe('mac');
  });
});
