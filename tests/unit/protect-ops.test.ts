import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PDFDocument } from '@cantoo/pdf-lib';
import { applyOp } from '../../src/pdf/page-ops';
import { protectDocument, unprotectDocument } from '../../src/pdf/protect-ops';
import { ALL_ALLOWED } from '../../src/pdf/protection';
import { makePdf, readPages } from './helpers';

const hasQpdf = spawnSync('qpdf', ['--version']).status === 0;
const dir = mkdtempSync(join(tmpdir(), 'cigale-protect-'));
const qpdf = (bytes: Uint8Array, args: string[], name = 'x.pdf') => {
  const f = join(dir, name);
  writeFileSync(f, bytes);
  return spawnSync('qpdf', [...args, f], { encoding: 'utf8' });
};

async function opensWith(bytes: Uint8Array, password?: string): Promise<number | null> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({ data: bytes.slice(), password } as never);
  try {
    return (await task.promise).numPages;
  } catch {
    return null;
  } finally {
    void task.destroy();
  }
}

describe('protéger par mot de passe', () => {
  it('mot de passe d’ouverture : refusé sans lui, ouvert avec', async () => {
    const r = await protectDocument(await makePdf(3), { userPassword: 'ouvre', ownerPassword: 'chef', permissions: ALL_ALLOWED }, undefined, 3);
    expect(r.wasProtected).toBe(false);
    expect(await opensWith(r.bytes)).toBeNull();
    expect(await opensWith(r.bytes, 'faux')).toBeNull();
    expect(await opensWith(r.bytes, 'ouvre')).toBe(3);
    expect((await readPages(await (await unprotectDocument(r.bytes, 'ouvre')).bytes)).length).toBe(3);
  });

  it('restrictions seules : s’ouvre sans mot de passe, copie et modification interdites', async () => {
    const r = await protectDocument(await makePdf(2), { userPassword: '', ownerPassword: 'chef', permissions: { ...ALL_ALLOWED, copying: false, modifying: false } });
    expect(await opensWith(r.bytes)).toBe(2);
    if (hasQpdf) {
      const out = qpdf(r.bytes, ['--show-encryption']).stdout;
      expect(out).toMatch(/extract for any purpose: not allowed/);
      expect(out).toMatch(/modify other: not allowed/);
      expect(out).toMatch(/print high resolution: allowed/);
    }
  });

  it.skipIf(!hasQpdf)('qpdf : AES-256 (R=6), mot de passe d’ouverture et propriétaire', async () => {
    const r = await protectDocument(await makePdf(1), { userPassword: 'ouvre', ownerPassword: 'chef', permissions: ALL_ALLOWED });
    expect(qpdf(r.bytes, ['--show-encryption', '--password=ouvre']).stdout).toMatch(/R = 6/);
    expect(qpdf(r.bytes, ['--show-encryption', '--password=ouvre']).stdout).toMatch(/User password = ouvre/);
    expect(qpdf(r.bytes, ['--show-encryption', '--password=chef']).stdout).toMatch(/Supplied password is owner password/);
    expect(qpdf(r.bytes, ['--check', '--password=ouvre']).status).toBeLessThanOrEqual(3);
  });

  it('refuse de « protéger » sans mot de passe ni restriction', async () => {
    await expect(protectDocument(await makePdf(1), { userPassword: '', ownerPassword: '', permissions: ALL_ALLOWED })).rejects.toBeInstanceOf(Error);
  });

  it('changer la protection d’un document déjà protégé : le nouveau mot de passe remplace l’ancien', async () => {
    const first = await protectDocument(await makePdf(2), { userPassword: 'ancien', ownerPassword: 'chef', permissions: ALL_ALLOWED });
    const second = await protectDocument(first.bytes, { userPassword: 'nouveau', ownerPassword: 'chef2', permissions: ALL_ALLOWED }, 'ancien');
    expect(second.wasProtected).toBe(true);
    expect(await opensWith(second.bytes, 'ancien')).toBeNull();
    expect(await opensWith(second.bytes, 'nouveau')).toBe(2);
  });

  it('retirer la protection : s’ouvre librement, sans chiffrement', async () => {
    const first = await protectDocument(await makePdf(2), { userPassword: 'ouvre', ownerPassword: 'chef', permissions: ALL_ALLOWED });
    const r = await unprotectDocument(first.bytes, 'ouvre', 2);
    expect(r.wasProtected).toBe(true);
    expect(await opensWith(r.bytes)).toBe(2);
    expect(new TextDecoder('latin1').decode(r.bytes)).not.toContain('/Encrypt'); // aucune référence au chiffrement ne reste
    expect((await PDFDocument.load(r.bytes)).getPageCount()).toBe(2); // pdf-lib non plus ne voit plus de chiffrement
    if (hasQpdf) expect(qpdf(r.bytes, ['--show-encryption']).stdout).toMatch(/not encrypted/);
  });

  it('les opérations suivantes conservent la nouvelle protection', async () => {
    const p = await protectDocument(await makePdf(3), { userPassword: 'ouvre', ownerPassword: 'chef', permissions: ALL_ALLOWED });
    const r = await applyOp(p.bytes, { op: 'rotate', pages: [0], delta: 90 }, 'ouvre', 3);
    expect(await opensWith(r.bytes)).toBeNull();
    expect(await opensWith(r.bytes, 'ouvre')).toBe(3);
  });

  it('un document non protégé : « retirer » ne change rien de visible', async () => {
    const r = await unprotectDocument(await makePdf(2));
    expect(r.wasProtected).toBe(false);
    expect(await opensWith(r.bytes)).toBe(2);
    void PDFDocument;
  });
});
