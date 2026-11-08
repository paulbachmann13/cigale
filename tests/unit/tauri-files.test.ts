import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { backupPathFor, baseName, tempPathFor, writeAtomic } from '../../src/app/tauri-files';

function fakeFs(opts: { failRename?: boolean; failWrite?: boolean } = {}) {
  const files = new Map<string, Uint8Array>([['/d/a.pdf', new Uint8Array([1, 1, 1])]]);
  return {
    files,
    async writeFile(p: string, d: Uint8Array) {
      if (opts.failWrite) throw new Error('disque plein');
      files.set(p, d);
    },
    async rename(from: string, to: string) {
      if (opts.failRename) throw new Error('refusé');
      files.set(to, files.get(from)!);
      files.delete(from);
    },
    async remove(p: string) {
      files.delete(p);
    },
  };
}

describe('écriture atomique (application Mac)', () => {
  it('écrit à côté puis renomme : plus de fichier temporaire', async () => {
    const fs = fakeFs();
    await writeAtomic('/d/a.pdf', new Uint8Array([9, 9]), fs);
    expect([...fs.files.get('/d/a.pdf')!]).toEqual([9, 9]);
    expect(fs.files.has(tempPathFor('/d/a.pdf'))).toBe(false);
  });
  it('si l’écriture échoue, l’original reste intact', async () => {
    const fs = fakeFs({ failWrite: true });
    await expect(writeAtomic('/d/a.pdf', new Uint8Array([9]), fs)).rejects.toThrow('disque plein');
    expect([...fs.files.get('/d/a.pdf')!]).toEqual([1, 1, 1]);
  });
  it('si le renommage échoue, l’original reste intact et le temporaire est retiré', async () => {
    const fs = fakeFs({ failRename: true });
    await expect(writeAtomic('/d/a.pdf', new Uint8Array([9]), fs)).rejects.toThrow('refusé');
    expect([...fs.files.get('/d/a.pdf')!]).toEqual([1, 1, 1]);
    expect(fs.files.has(tempPathFor('/d/a.pdf'))).toBe(false);
  });
  it('noms de fichiers', () => {
    expect(baseName('/Users/paul/Documents/rapport.pdf')).toBe('rapport.pdf');
    expect(backupPathFor('/d/rapport.pdf')).toBe('/d/rapport.pdf.bak');
    expect(tempPathFor('/d/rapport.pdf')).not.toMatch(/\/\./); // pas de fichier caché
  });
});

describe('numéro de version', () => {
  it('est le même dans package.json, tauri.conf.json et Cargo.toml', () => {
    const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version as string;
    const conf = JSON.parse(readFileSync(new URL('../../src-tauri/tauri.conf.json', import.meta.url), 'utf8')).version as string;
    const cargo = /^version = "([^"]+)"/m.exec(readFileSync(new URL('../../src-tauri/Cargo.toml', import.meta.url), 'utf8'))?.[1];
    expect(conf).toBe(pkg);
    expect(cargo).toBe(pkg);
  });
});

describe('chemins Windows', () => {
  it('le nom d’un fichier se lit aussi avec des « \\ »', async () => {
    const { baseName } = await import('../../src/app/tauri-files');
    expect(baseName('C:\\Users\\Papa\\Documents\\facture.pdf')).toBe('facture.pdf');
    expect(baseName('/Users/paul/facture.pdf')).toBe('facture.pdf');
    expect(baseName('D:/dossier/a.pdf')).toBe('a.pdf');
  });
});
