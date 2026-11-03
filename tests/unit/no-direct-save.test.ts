import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('garde-fou : jamais de doc.save() direct', () => {
  it('toute écriture de PDF passe par saveDoc (sinon un document protégé perdrait son mot de passe)', () => {
    const dir = new URL('../../src/pdf/', import.meta.url);
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts') && f !== 'protection.ts')) {
      const text = readFileSync(new URL(file, dir), 'utf8');
      expect(text, file).not.toMatch(/\.save\(/);
    }
  });
});
