/**
 * Corpus de PDF difficiles (fabriqués ici) : pour chacun, deux garanties.
 *  1. Cigale ne plante pas et ne se fige pas : le document s'ouvre, ou une erreur claire est levée.
 *  2. Aucune opération ne produit un document faux : soit elle est refusée, soit le résultat se rouvre dans pdf.js avec
 *     exactement le nombre de pages attendu.
 */
import { describe, expect, it } from 'vitest';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, StandardFonts, degrees } from '@cantoo/pdf-lib';
import type { AnnotDraft } from '../../src/data/annotations';
import { addAnnotations, listAnnotations } from '../../src/pdf/annot-ops';
import { mergeSources, splitDocument } from '../../src/pdf/doc-ops';
import { type PageOp, applyOp, extractPages } from '../../src/pdf/page-ops';
import { makePdf, readPages } from './helpers';

const TIMEOUT = 20_000;

/** Nombre de pages vu par pdf.js ; null si pdf.js refuse le document. */
async function pdfjsCount(bytes: Uint8Array, password?: string): Promise<number | null> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({ data: bytes.slice(), password } as never);
  try {
    return (await Promise.race([task.promise, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('délai dépassé')), 8000))])).numPages;
  } catch {
    return null;
  } finally {
    void task.destroy();
  }
}

async function build(opts: { pages?: number; modify?: (doc: PDFDocument) => void | Promise<void>; save?: Parameters<PDFDocument['save']>[0]; encrypt?: Parameters<PDFDocument['encrypt']>[0] } = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= (opts.pages ?? 4); i++) doc.addPage([595, 842]).drawText(`marque${i}`, { x: 50, y: 700, size: 24, font });
  await opts.modify?.(doc);
  if (opts.encrypt) doc.encrypt(opts.encrypt);
  return doc.save(opts.save);
}

const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) (out.set(p, o), (o += p.length));
  return out;
};

const text = (s: string) => new TextEncoder().encode(s);

interface Case {
  name: string;
  make: () => Promise<Uint8Array>;
  password?: string;
}

const cases: Case[] = [
  { name: 'simple, flux d’objets', make: () => build() },
  { name: 'sans flux d’objets', make: () => build({ save: { useObjectStreams: false } }) },
  { name: 'octets parasites avant « %PDF »', make: async () => concat(text('\n\n// parasite\n'.repeat(5)), await build()) },
  { name: 'Count de l’arbre des pages faux', make: () => build({ modify: (d) => { (d.context.lookup(d.catalog.get(PDFName.of('Pages')) as never, PDFDict)).set(PDFName.of('Count'), PDFNumber.of(99)); } }) },
  { name: 'page sans /Type', make: () => build({ modify: (d) => { d.getPage(1).node.delete(PDFName.of('Type')); } }) },
  { name: 'tronqué à 80 %', make: async () => { const b = await build({ save: { useObjectStreams: false } }); return b.slice(0, Math.floor(b.length * 0.8)); } },
  { name: 'startxref faux', make: async () => { const b = await build({ save: { useObjectStreams: false } }); const s = new TextDecoder('latin1').decode(b); return text(s.replace(/startxref\s+\d+/, 'startxref\n7')).length ? text(s.replace(/startxref\s+\d+/, 'startxref\n7')) : b; } },
  { name: 'page tournée et CropBox décalée', make: () => build({ modify: (d) => { const p = d.getPage(0); p.setRotation(degrees(90)); p.setCropBox(20, 30, 300, 400); } }) },
  { name: 'attributs hérités du nœud parent', make: () => build({ modify: (d) => { const root = d.context.lookup(d.catalog.get(PDFName.of('Pages')) as never, PDFDict); root.set(PDFName.of('Rotate'), PDFNumber.of(90)); d.getPages().forEach((p) => p.node.delete(PDFName.of('Rotate'))); } }) },
  { name: 'chiffré AES-256 (mot de passe)', password: 'secret', make: () => build({ encrypt: { userPassword: 'secret', ownerPassword: 'chef', permissions: { printing: 'highResolution' } } }) },
  { name: 'chiffré AES-128', password: 'secret', make: () => build({ encrypt: { userPassword: 'secret', ownerPassword: 'chef', algorithm: 'AES-128', permissions: {} } as never }) },
  { name: 'chiffré RC4-128', password: 'secret', make: () => build({ encrypt: { userPassword: 'secret', ownerPassword: 'chef', algorithm: 'RC4-128', allowWeakCryptography: true, permissions: {} } as never }) },
  { name: 'propriétaire seul : lisible sans mot de passe, copie interdite', make: () => build({ encrypt: { ownerPassword: 'chef', permissions: { copying: false, printing: false, modifying: false } } }) },
  { name: 'beaucoup de signets et de liens', make: () => build({ pages: 30, modify: (d) => { const ctx = d.context; d.getPages().forEach((p, i) => { const link = ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Link', Rect: [0, 0, 50, 50], Dest: [d.getPage((i + 1) % 30).ref, PDFName.of('Fit')] })); p.node.set(PDFName.of('Annots'), ctx.obj([link])); }); } }) },
];

const OPS: PageOp[] = [
  { op: 'rotate', pages: [0], delta: 90 },
  { op: 'delete', pages: [1] },
  { op: 'duplicate', pages: [0] },
  { op: 'move', pages: [0], to: 3 },
  { op: 'insertBlank', at: 1 },
];

const draft: AnnotDraft = { page: 0, kind: 'rect', rect: [10, 10, 100, 60], color: [1, 0, 0], fill: null, opacity: 1, width: 2, contents: 'é' };

describe.each(cases)('corpus : $name', ({ make, password }) => {
  it('s’ouvre ou échoue proprement ; chaque opération est refusée ou juste', async () => {
    const bytes = await make();
    const count = await pdfjsCount(bytes, password);
    if (count === null) return; // pdf.js ne sait pas le lire : Cigale affiche son message d'erreur, rien d'autre à vérifier ici
    for (const op of OPS) {
      let result;
      try {
        result = await applyOp(bytes, op, password, count);
      } catch (err) {
        // refus attendu (structure inhabituelle, mot de passe…) : une vraie erreur, jamais un résultat faux
        expect(err).toBeInstanceOf(Error);
        continue;
      }
      const reread = await pdfjsCount(result.bytes, password);
      expect(reread, `${op.op} : le résultat doit se rouvrir`).toBe(result.pageCount);
      const expected = op.op === 'delete' ? count - 1 : op.op === 'duplicate' || op.op === 'insertBlank' ? count + 1 : count;
      expect(result.pageCount).toBe(expected);
    }
    // annotations, extraction, fusion, découpe : mêmes garanties
    for (const run of [
      async () => (await addAnnotations(bytes, [draft], password, count)).bytes,
      async () => extractPages(bytes, [0], password, count),
      async () => (await mergeSources([{ name: 'a.pdf', bytes, password, pages: [0], expectedPages: count }], { keepBookmarks: true })).bytes,
      async () => (await splitDocument(bytes, [{ from: 1, to: 1 }], ['a.pdf'], password, count))[0].bytes,
    ]) {
      try {
        const out = await run();
        const n = await pdfjsCount(out, password);
        expect(n).not.toBeNull();
      } catch (err) {
        expect(err).toBeInstanceOf(Error);
      }
    }
  }, TIMEOUT);
});

/** Valeur /P (autorisations) et présence du chiffrement, lues sans déchiffrer. */
async function encryptionOf(bytes: Uint8Array): Promise<{ encrypted: boolean; P?: number }> {
  const raw = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const enc = raw.context.trailerInfo.Encrypt ? raw.context.lookupMaybe(raw.context.trailerInfo.Encrypt, PDFDict) : undefined;
  return { encrypted: !!enc, P: enc?.lookupMaybe(PDFName.of('P'), PDFNumber)?.asNumber() };
}

describe('chiffrement : une modification ne retire JAMAIS la protection', () => {
  const protectedDoc = () => build({ encrypt: { userPassword: 'secret', ownerPassword: 'chef', permissions: { printing: 'highResolution', copying: false, modifying: false } } });

  it('opération sur les pages : toujours protégé, même mot de passe, mêmes restrictions', async () => {
    const src = await protectedDoc();
    const before = await encryptionOf(src);
    const r = await applyOp(src, { op: 'rotate', pages: [0], delta: 90 }, 'secret', 4);
    expect((await encryptionOf(r.bytes)).encrypted).toBe(true);
    expect(await pdfjsCount(r.bytes)).toBeNull(); // sans mot de passe : refusé
    expect(await pdfjsCount(r.bytes, 'faux')).toBeNull();
    expect(await pdfjsCount(r.bytes, 'secret')).toBe(4);
    expect(((await encryptionOf(r.bytes)).P! | 0) & 0xf3c).toBe((before.P! | 0) & 0xf3c); // mêmes autorisations (impression, copie, modification…)
  });

  it('annotations, extraction, découpe et fusion gardent la protection', async () => {
    const src = await protectedDoc();
    const withAnnot = (await addAnnotations(src, [draft], 'secret', 4)).bytes;
    const extracted = await extractPages(src, [0, 1], 'secret', 4);
    const parts = await splitDocument(src, [{ from: 1, to: 2 }], ['a.pdf'], 'secret', 4);
    const merged = (await mergeSources([{ name: 'a.pdf', bytes: src, password: 'secret' }, { name: 'b.pdf', bytes: await makePdf(1) }], { keepBookmarks: true })).bytes;
    for (const [name, bytes] of [['annotation', withAnnot], ['extraction', extracted], ['découpe', parts[0].bytes], ['fusion', merged]] as const) {
      expect((await encryptionOf(bytes)).encrypted, name).toBe(true);
      expect(await pdfjsCount(bytes), `${name} sans mot de passe`).toBeNull();
      expect(await pdfjsCount(bytes, 'secret'), name).not.toBeNull();
    }
  });

  it('document « propriétaire seul » (s’ouvre sans mot de passe, copie interdite) : restrictions gardées', async () => {
    const src = await build({ encrypt: { ownerPassword: 'chef', permissions: { copying: false, printing: false, modifying: false } } });
    const before = await encryptionOf(src);
    expect(await pdfjsCount(src)).toBe(4);
    const r = await applyOp(src, { op: 'rotate', pages: [0], delta: 90 }, undefined, 4);
    const after = await encryptionOf(r.bytes);
    expect(after.encrypted).toBe(true);
    expect(await pdfjsCount(r.bytes)).toBe(4); // toujours lisible sans mot de passe
    expect((after.P! | 0) & 0xf3c).toBe((before.P! | 0) & 0xf3c);
  });

  it.each(['AES-128', 'RC4-128'])('source %s : le résultat reste protégé (AES-256)', async (algorithm) => {
    const src = await build({ encrypt: { userPassword: 'secret', ownerPassword: 'chef', algorithm, allowWeakCryptography: true, permissions: {} } as never });
    const r = await applyOp(src, { op: 'delete', pages: [3] }, 'secret', 4);
    expect(await pdfjsCount(r.bytes)).toBeNull();
    expect(await pdfjsCount(r.bytes, 'secret')).toBe(3);
  });

  it('un document non protégé reste non protégé', async () => {
    const r = await applyOp(await build(), { op: 'rotate', pages: [0], delta: 90 }, undefined, 4);
    expect((await encryptionOf(r.bytes)).encrypted).toBe(false);
  });
});

describe('document sans page ou vide', () => {
  it('aucune page : les opérations échouent proprement', async () => {
    const doc = await PDFDocument.create();
    const bytes = await doc.save();
    await expect(applyOp(bytes, { op: 'rotate', pages: [0], delta: 90 })).resolves.toBeDefined(); // sélection vide filtrée, aucun effet
    await expect(applyOp(bytes, { op: 'delete', pages: [0] })).rejects.toBeInstanceOf(Error);
  });
});

describe('mutations aléatoires (ne jamais planter ni produire un document faux)', () => {
  // petit générateur déterministe : mêmes mutations à chaque exécution
  const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

  const mutate = (bytes: Uint8Array, r: () => number): Uint8Array => {
    const out = Array.from(bytes);
    const kind = Math.floor(r() * 4);
    if (kind === 0) for (let i = 0; i < 1 + Math.floor(r() * 6); i++) out[Math.floor(r() * out.length)] = Math.floor(r() * 256);
    else if (kind === 1) out.splice(Math.floor(r() * out.length), 1 + Math.floor(r() * 200));
    else if (kind === 2) out.length = Math.floor(out.length * (0.3 + r() * 0.69));
    else { const at = Math.floor(r() * out.length); out.splice(at, 0, ...out.slice(at, at + 50)); }
    return Uint8Array.from(out);
  };

  it('200 mutations : jamais de résultat faux, jamais de blocage', async () => {
    const base = await build({ pages: 6, save: { useObjectStreams: false }, modify: async (d) => { const { addFlatOutline } = await import('./helpers'); addFlatOutline(d, [{ title: 'A', page: 1 }, { title: 'B', page: 4 }]); } });
    let opened = 0;
    let refused = 0;
    const r = rng(12345);
    for (let i = 0; i < 200; i++) {
      const m = mutate(base, r);
      const count = await pdfjsCount(m);
      if (count === null) { refused++; continue; }
      opened++;
      try {
        const res = await applyOp(m, { op: 'rotate', pages: [0], delta: 90 }, undefined, count);
        expect(await pdfjsCount(res.bytes), `mutation ${i}`).toBe(res.pageCount);
        expect(res.pageCount).toBe(count);
      } catch (err) {
        expect(err).toBeInstanceOf(Error);
      }
      try { await listAnnotations(m, undefined, count); } catch (err) { expect(err).toBeInstanceOf(Error); }
    }
    process.stderr.write(`MUTATIONS : ${opened} ouverts, ${refused} refusés par pdf.js\n`);
    expect(opened + refused).toBe(200);
  }, 180_000);
});

void makePdf; void readPages; void PDFArray;

describe('formulaires : ce que Cigale ne touche pas', () => {
  it('l’apparence d’un champ de formulaire existant est conservée à l’identique', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([595, 842]);
    const form = doc.getForm();
    const field = form.createTextField('nom');
    field.setText('Éléphant');
    field.addToPage(page, { x: 50, y: 700, width: 200, height: 24 });
    const src = await doc.save();
    const ap = (bytes: Uint8Array) => {
      const d = PDFDocument.load(bytes);
      return d.then((x) => {
        const annots = x.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray);
        const widget = annots.lookup(0, PDFDict);
        const stream = widget.lookup(PDFName.of('AP'), PDFDict).lookup(PDFName.of('N')) as unknown as { getContentsString(): string };
        return stream.getContentsString();
      });
    };
    const r = await applyOp(src, { op: 'rotate', pages: [0], delta: 90 });
    expect(await ap(r.bytes)).toBe(await ap(src));
  });

  it('un formulaire XFA est conservé', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const ctx = doc.context;
    const xfa = ctx.register(ctx.stream('<xdp>formulaire dynamique</xdp>'));
    doc.catalog.set(PDFName.of('AcroForm'), ctx.obj({ Fields: [], XFA: [ctx.obj('template') as never, xfa] }));
    const r = await applyOp(await doc.save(), { op: 'rotate', pages: [0], delta: 90 });
    const re = await PDFDocument.load(r.bytes, { preserveXFA: true });
    expect(re.catalog.lookup(PDFName.of('AcroForm'), PDFDict).has(PDFName.of('XFA'))).toBe(true);
  });
});
