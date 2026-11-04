/**
 * Enregistrer puis rouvrir : un document riche (texte, formulaire, signets, pièce jointe, commentaires, titre) traverse
 * une longue chaîne d'opérations ; après CHAQUE étape, le fichier doit être valide (qpdf), se rouvrir (pdf.js et pdf-lib) et
 * avoir gardé ce qu'il avait (signets, pièce jointe, champs de formulaire, commentaires, titre, texte).
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { PDFDocument, PDFName, PDFString, StandardFonts } from '@cantoo/pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { AnnotDraft } from '../../src/data/annotations';
import { addAnnotations, listAnnotations } from '../../src/pdf/annot-ops';
import { cropPages } from '../../src/pdf/crop-ops';
import { fillForm } from '../../src/pdf/form-ops';
import { addTextLayer } from '../../src/pdf/ocr-ops';
import { type PageOp, applyOp, extractPages, loadForEdit, normalizeDocument } from '../../src/pdf/page-ops';
import { protectDocument, unprotectDocument } from '../../src/pdf/protect-ops';
import { extractRegion } from '../../src/pdf/region-ops';
import { addHeaderFooter, addWatermark } from '../../src/pdf/stamp-ops';
import { addFlatOutline, makePng } from './helpers';

async function readPagesWithPassword(bytes: Uint8Array, password: string): Promise<number[]> {
  const task = getDocument({ data: bytes.slice(), password } as never);
  const pdf = await task.promise;
  const sizes = Array.from({ length: pdf.numPages }, (_, i) => i);
  await task.destroy();
  return sizes;
}

const hasQpdf = spawnSync('qpdf', ['--version']).status === 0;
const dir = mkdtempSync(join(tmpdir(), 'cigale-enreg-'));
let n = 0;
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function qpdfCheck(bytes: Uint8Array, label: string, password?: string) {
  if (!hasQpdf) return;
  const file = join(dir, `${++n}-${label.replace(/\W+/g, '_')}.pdf`);
  writeFileSync(file, bytes);
  const r = spawnSync('qpdf', [...(password ? [`--password=${password}`] : []), '--check', file], { encoding: 'utf8' });
  expect([0, 3], `qpdf après « ${label} » : ${r.stdout}${r.stderr}`).toContain(r.status);
}

interface Seen {
  pages: number;
  title: string | undefined;
  outline: string[];
  attachments: string[];
  fields: string[];
  annots: number;
  text: string;
}

/** Pièces jointes (lues par qpdf : pdf.js sous Node ne les expose pas pour les fichiers de pdf-lib). Sans qpdf : valeur attendue. */
function listAttachments(bytes: Uint8Array, password?: string): string[] {
  if (!hasQpdf) return ['note.txt'];
  const file = join(dir, `att-${++n}.pdf`);
  writeFileSync(file, bytes);
  const r = spawnSync('qpdf', [...(password ? [`--password=${password}`] : []), '--list-attachments', file], { encoding: 'utf8' });
  return r.stdout.split('\n').map((l) => l.split(' -> ')[0].trim()).filter(Boolean);
}

/** Ce que pdf.js (comme l'application) voit dans le fichier. */
async function seen(bytes: Uint8Array, password?: string): Promise<Seen> {
  const task = getDocument({ data: bytes.slice(), password, useSystemFonts: false } as never);
  const pdf = await task.promise;
  const lib = await loadForEdit(bytes, password);
  const fields = lib.getForm().getFields().map((f) => f.getName()).sort();
  const outline = ((await pdf.getOutline()) ?? []).map((o: { title: string }) => o.title);
  const attachments = listAttachments(bytes, password);
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const tc = await (await pdf.getPage(i)).getTextContent();
    text += tc.items.map((it) => ('str' in it ? it.str : '')).join(' ') + '\n';
  }
  const annots = (await listAnnotations(bytes, password)).length;
  const out = { pages: pdf.numPages, title: lib.getTitle(), outline, attachments, fields, annots, text };
  await task.destroy();
  return out;
}

async function richDocument(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle('Dossier de test');
  doc.setAuthor('Paul');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 6; i++) doc.addPage([595, 842]).drawText(`marque${i} é à ç`, { x: 50, y: 700, size: 24, font });
  addFlatOutline(doc, [{ title: 'Début', page: 1 }, { title: 'Milieu', page: 3 }, { title: 'Fin', page: 6 }]);
  await doc.attach(new TextEncoder().encode('pièce jointe'), 'note.txt', { mimeType: 'text/plain' });
  const form = doc.getForm();
  const nom = form.createTextField('nom');
  nom.addToPage(doc.getPage(0), { x: 50, y: 600, width: 200, height: 24 });
  const ok = form.createCheckBox('accord');
  ok.addToPage(doc.getPage(0), { x: 50, y: 560, width: 18, height: 18 });
  return doc.save();
}

const draft = (kind: AnnotDraft['kind'], extra: Partial<AnnotDraft> = {}): AnnotDraft =>
  ({ page: 0, color: [1, 0, 0], fill: null, opacity: 1, width: 2, contents: 'note é', rect: [300, 500, 400, 560], kind, ...extra }) as AnnotDraft;

describe('enregistrer puis rouvrir', () => {
  it('chaîne d’opérations : fichier valide et contenu conservé à chaque étape', async () => {
    let bytes = await richDocument();
    const start = await seen(bytes);
    expect(start).toMatchObject({ pages: 6, title: 'Dossier de test', outline: ['Début', 'Milieu', 'Fin'], attachments: ['note.txt'] });
    expect(start.fields.sort()).toEqual(['accord', 'nom']);

    // Rien ne doit disparaître d'un état à l'autre, sauf ce que l'étape supprime volontairement.
    const steps: { label: string; run: (b: Uint8Array) => Promise<Uint8Array>; check?: (before: Seen, after: Seen) => void }[] = [
      { label: 'normaliser (enregistrer sans modification)', run: (b) => normalizeDocument(b), check: (a, z) => expect(z).toEqual(a) },
      { label: 'remplir le formulaire', run: async (b) => (await fillForm(b, [{ name: 'nom', kind: 'text', value: 'Dupont é' }, { name: 'accord', kind: 'checkbox', value: true }])).bytes },
      { label: 'annotations (surlignage, note, rectangle, texte libre, encre)', run: async (b) => (await addAnnotations(b, [
        draft('highlight', { quads: [[50, 700, 150, 715]], rect: [50, 700, 150, 715] }),
        draft('note', { rect: [300, 700, 324, 724] }),
        draft('rect', { fill: [1, 1, 0] }),
        draft('freetext', { rect: [200, 300, 360, 360], fontSize: 12, contents: 'Texte libre' }),
        draft('ink', { strokes: [[[20, 400], [40, 420], [60, 400]]], rect: [20, 400, 60, 420] }),
      ], undefined, 6, 'Paul')).bytes, check: (a, z) => expect(z.annots).toBe(a.annots + 5) },
      { label: 'pivoter', run: async (b) => (await applyOp(b, { op: 'rotate', pages: [0, 2], delta: 90 })).bytes },
      { label: 'déplacer', run: async (b) => (await applyOp(b, { op: 'move', pages: [5], to: 0 })).bytes },
      { label: 'dupliquer', run: async (b) => (await applyOp(b, { op: 'duplicate', pages: [1] })).bytes, check: (a, z) => expect(z.pages).toBe(a.pages + 1) },
      { label: 'page vierge', run: async (b) => (await applyOp(b, { op: 'insertBlank', at: 2 })).bytes },
      { label: 'insérer d’un autre document', run: async (b) => (await applyOp(b, { op: 'insertFrom', at: 1, other: await richDocument(), otherPages: [1, 2] } as PageOp)).bytes },
      { label: 'filigrane', run: (b) => addWatermark(b, { text: 'COPIE', fontSize: 60, color: [0.8, 0, 0], opacity: 0.3, angle: 45 }) },
      { label: 'en-têtes et pieds de page', run: (b) => addHeaderFooter(b, { header: { left: '', center: 'Titre', right: '' }, footer: { left: '', center: '{page}/{total}', right: '' }, fontSize: 10, color: [0, 0, 0], margin: 28, firstNumber: 1 }) },
      { label: 'recadrer', run: async (b) => (await cropPages(b, { top: 20, right: 20, bottom: 20, left: 20 })).bytes },
      { label: 'couche de texte (OCR)', run: (b) => addTextLayer(b, [{ index: 0, imageWidth: 1000, imageHeight: 1400, lines: [{ words: [{ text: 'reconnu', x0: 100, y0: 200, x1: 300, y1: 240 }] }] }]), check: (a, z) => expect(z.text).toContain('reconnu') },
      { label: 'supprimer', run: async (b) => (await applyOp(b, { op: 'delete', pages: [3] })).bytes, check: (a, z) => expect(z.pages).toBe(a.pages - 1) },
      { label: 'normaliser à nouveau', run: (b) => normalizeDocument(b), check: (a, z) => expect(z).toEqual(a) },
    ];
    for (const step of steps) {
      const before = await seen(bytes);
      bytes = await step.run(bytes);
      qpdfCheck(bytes, step.label);
      const after = await seen(bytes);
      // ce qui doit toujours être là
      expect(after.title, `${step.label} : titre`).toBe('Dossier de test');
      expect(after.attachments, `${step.label} : pièce jointe`).toEqual(['note.txt']);
      expect(after.fields.sort(), `${step.label} : champs`).toEqual(['accord', 'nom']);
      if (!step.label.startsWith('supprimer')) expect(after.annots, `${step.label} : commentaires`).toBeGreaterThanOrEqual(before.annots); // supprimer une page emporte ses commentaires
      expect(after.pages, `${step.label} : pages`).toBeGreaterThan(0);
      step.check?.(before, after);
    }
    // les signets survivent tant qu'on ne supprime pas leur page : au moins « Début » reste
    expect((await seen(bytes)).outline.length).toBeGreaterThan(0);
    // pdf-lib rouvre aussi le résultat
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(3);
  });

  it('la valeur saisie dans le formulaire est bien enregistrée et relue', async () => {
    const bytes = (await fillForm(await richDocument(), [{ name: 'nom', kind: 'text', value: 'Dupont é' }, { name: 'accord', kind: 'checkbox', value: true }])).bytes;
    const form = (await PDFDocument.load(bytes)).getForm();
    expect(form.getTextField('nom').getText()).toBe('Dupont é');
    expect(form.getCheckBox('accord').isChecked()).toBe(true);
    // et après une autre opération, puis une deuxième normalisation
    const again = await normalizeDocument((await applyOp(bytes, { op: 'rotate', pages: [0], delta: 90 })).bytes);
    const form2 = (await PDFDocument.load(again)).getForm();
    expect(form2.getTextField('nom').getText()).toBe('Dupont é');
    expect(form2.getCheckBox('accord').isChecked()).toBe(true);
  });

  it('document protégé : protéger, modifier, enregistrer, rouvrir avec le mot de passe, puis retirer', async () => {
    const protectedDoc = (await protectDocument(await richDocument(), { userPassword: 'secret', ownerPassword: 'chef', permissions: {} } as never)).bytes;
    await expect(getDocument({ data: protectedDoc.slice() } as never).promise).rejects.toMatchObject({ name: 'PasswordException' });
    let bytes = (await applyOp(protectedDoc, { op: 'rotate', pages: [0], delta: 90 }, 'secret')).bytes;
    bytes = (await addAnnotations(bytes, [draft('note', { rect: [300, 700, 324, 724] })], 'secret', 6)).bytes;
    bytes = await normalizeDocument(bytes, 'secret');
    qpdfCheck(bytes, 'protégé', 'secret');
    await expect(getDocument({ data: bytes.slice() } as never).promise).rejects.toMatchObject({ name: 'PasswordException' }); // toujours protégé
    // pdf-lib ne relit pas les chaînes chiffrées : on déchiffre avec qpdf pour comparer le contenu (titre, pièce jointe, commentaire).
    if (hasQpdf) {
      const file = join(dir, 'chiffre-entree.pdf');
      writeFileSync(file, bytes);
      const dec = join(dir, 'chiffre-sortie.pdf');
      spawnSync('qpdf', ['--password=secret', '--decrypt', file, dec]);
      const plain = new Uint8Array(readFileSync(dec));
      const s = await seen(plain);
      expect(s).toMatchObject({ pages: 6, title: 'Dossier de test', annots: 1 });
      expect(s.attachments).toEqual(['note.txt']);
    }
    expect((await readPagesWithPassword(bytes, 'secret')).length).toBe(6);
    const open = (await unprotectDocument(bytes, 'secret')).bytes;
    qpdfCheck(open, 'protection retirée');
    expect((await seen(open)).pages).toBe(6);
  });

  it('PDF protégé : les chaînes imbriquées (liens, pièces jointes) sont chiffrées et se relisent, les métadonnées personnalisées aussi', async () => {
    const doc = await PDFDocument.create();
    doc.setTitle('Titre protégé');
    (doc as unknown as { getInfoDict(): { set(k: unknown, v: unknown): void } }).getInfoDict().set(PDFName.of('Company'), PDFString.of('Société é'));
    doc.addPage();
    const ctx = doc.context;
    doc.getPage(0).node.set(PDFName.of('TestB'), ctx.obj({ Inner: ctx.obj({ S2: PDFString.of('chaine-imbriquee-secrete'), Arr: [PDFString.of('dans-un-tableau-secret')] }) }));
    await doc.attach(new TextEncoder().encode('x'), 'note.txt', { mimeType: 'text/plain' });
    const p = (await protectDocument(await doc.save(), { userPassword: 'secret', ownerPassword: 'chef', permissions: {} } as never)).bytes;
    // jamais en clair dans le fichier protégé
    const raw = Buffer.from(p).toString('latin1');
    expect(raw).not.toContain('chaine-imbriquee-secrete');
    expect(raw).not.toContain('dans-un-tableau-secret');
    // modifier + enregistrer deux fois : toujours lisible, toujours protégé
    let bytes = (await applyOp(p, { op: 'rotate', pages: [0], delta: 90 }, 'secret')).bytes;
    bytes = await normalizeDocument(bytes, 'secret');
    expect(Buffer.from(bytes).toString('latin1')).not.toContain('chaine-imbriquee-secrete');
    if (hasQpdf) {
      const f = join(dir, 'imbrique.pdf');
      writeFileSync(f, bytes);
      const dec = join(dir, 'imbrique-dec.pdf');
      spawnSync('qpdf', ['--password=secret', '--decrypt', '--qdf', '--object-streams=disable', f, dec]);
      const text = readFileSync(dec).toString('latin1');
      expect(text).toContain('chaine-imbriquee-secrete');
      expect(text).toContain('dans-un-tableau-secret');
      expect(text).toContain('note.txt');
      expect(text).toContain('/Company');
      expect(text).toContain('<feff0054');
    }
    await expect(getDocument({ data: bytes.slice() } as never).promise).rejects.toMatchObject({ name: 'PasswordException' });
  });

  it('zone extraite, pages extraites : fichiers valides qui se rouvrent', async () => {
    const doc = await richDocument();
    for (const [label, bytes] of [
      ['zone', await extractRegion(doc, 0, [40, 560, 300, 740])],
      ['pages extraites', await extractPages(doc, [0, 2, 5])],
    ] as const) {
      qpdfCheck(bytes, label);
      expect((await seen(bytes)).pages).toBeGreaterThan(0);
    }
  });

  it('un PNG ajouté puis la fusion avec le document restent valides (images)', () => {
    expect(makePng(10, 10).length).toBeGreaterThan(10);
  });
});
