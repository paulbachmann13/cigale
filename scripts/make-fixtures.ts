// Génère les PDF de test dans tests/fixtures/out/ (non versionnés : recréés par `npm run fixtures`).
// Aucun contenu réel : tout est synthétique.
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, type PDFRef, StandardFonts, degrees, rgb } from '@cantoo/pdf-lib';

const out = new URL('../tests/fixtures/out/', import.meta.url);
mkdirSync(out, { recursive: true });
const write = (name: string, bytes: Uint8Array | string) => writeFileSync(new URL(name, out), bytes);

const A4: [number, number] = [595.28, 841.89];

async function textPage(doc: PDFDocument, size: [number, number], title: string, body: string[]) {
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage(size);
  page.drawText(title, { x: 50, y: size[1] - 80, size: 24, font, color: rgb(0.1, 0.1, 0.1) });
  body.forEach((l, i) => page.drawText(l, { x: 50, y: size[1] - 130 - i * 22, size: 12, font }));
  return page;
}

interface OutlineItem {
  title: string;
  page: number;
  children?: OutlineItem[];
}

/** pdf-lib n'a pas d'API de signets : on écrit l'arbre /Outlines à la main. */
function addOutline(doc: PDFDocument, items: OutlineItem[]) {
  const ctx = doc.context;
  const pages = doc.getPages();
  const build = (list: OutlineItem[], parent: PDFRef): { first: PDFRef; last: PDFRef; count: number } => {
    const refs = list.map(() => ctx.nextRef());
    let count = list.length;
    list.forEach((it, i) => {
      const dict = ctx.obj({
        Title: PDFHexString.fromText(it.title),
        Parent: parent,
        Dest: [pages[it.page - 1].ref, PDFName.of('Fit')],
      }) as PDFDict;
      if (i > 0) dict.set(PDFName.of('Prev'), refs[i - 1]);
      if (i < list.length - 1) dict.set(PDFName.of('Next'), refs[i + 1]);
      if (it.children?.length) {
        const sub = build(it.children, refs[i]);
        dict.set(PDFName.of('First'), sub.first);
        dict.set(PDFName.of('Last'), sub.last);
        dict.set(PDFName.of('Count'), PDFNumber.of(sub.count));
        count += sub.count;
      }
      ctx.assign(refs[i], dict);
    });
    return { first: refs[0], last: refs[refs.length - 1], count };
  };
  const rootRef = ctx.nextRef();
  const tree = build(items, rootRef);
  ctx.assign(rootRef, ctx.obj({ Type: 'Outlines', First: tree.first, Last: tree.last, Count: tree.count }));
  doc.catalog.set(PDFName.of('Outlines'), rootRef);
}

// 1. Document simple, texte français avec accents
{
  const doc = await PDFDocument.create();
  doc.setTitle('Document simple');
  for (let i = 1; i <= 3; i++) {
    await textPage(doc, A4, `Page ${i} — Éléphant à l’été`, [
      'Ceci est un texte de test avec des accents : é è ê à ù ç œ.',
      `Le mot unique de la page ${i} est : marmotte${i}.`,
      'Le mot commun à toutes les pages est : cigale.',
    ]);
  }
  write('simple-3p.pdf', await doc.save());
}

// 2. Signets imbriqués
{
  const doc = await PDFDocument.create();
  for (let i = 1; i <= 6; i++) await textPage(doc, A4, `Chapitre page ${i}`, [`Contenu de la page ${i}.`]);
  addOutline(doc, [
    { title: 'Introduction', page: 1 },
    { title: 'Partie A', page: 2, children: [{ title: 'Section A.1', page: 3 }, { title: 'Section A.2', page: 4 }] },
    { title: 'Partie B', page: 5, children: [{ title: 'Section B.1', page: 6 }] },
  ]);
  write('signets.pdf', await doc.save());
}

// 3. Tailles et rotations mélangées
{
  const doc = await PDFDocument.create();
  await textPage(doc, A4, 'A4 portrait', ['Page 1']);
  await textPage(doc, [595.28, 419.53], 'A5 paysage', ['Page 2']);
  await textPage(doc, [612, 792], 'Letter', ['Page 3']);
  const rotated = await textPage(doc, A4, 'A4 pivotée de 90°', ['Page 4']);
  rotated.setRotation(degrees(90));
  write('tailles-mixtes.pdf', await doc.save());
}

// 4. 500 pages
{
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 500; i++) {
    const p = doc.addPage(A4);
    p.drawText(`Page ${i} sur 500`, { x: 50, y: 780, size: 20, font });
    for (let l = 0; l < 30; l++) p.drawText(`Ligne ${l + 1} de la page ${i} : texte de remplissage pour le test.`, { x: 50, y: 740 - l * 20, size: 10, font });
  }
  write('long-500p.pdf', await doc.save());
}

// 5. Chiffré (mot de passe utilisateur : « secret »)
{
  const doc = await PDFDocument.create();
  await textPage(doc, A4, 'Document chiffré', ['Mot de passe : secret', 'Le mot caché est : sphinx.']);
  doc.encrypt({ userPassword: 'secret', ownerPassword: 'proprietaire', permissions: { printing: 'highResolution', copying: true } });
  write('chiffre.pdf', await doc.save());
}

// 6. Scan : pages composées d'une seule image (PNG gris 200 dpi), sans texte
function grayPng(w: number, h: number, seed: number): Uint8Array {
  const raw = Buffer.alloc((w + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (w + 1);
    raw[row] = 0;
    const line = y % 60 < 3 && y > 200 && y < h - 200; // « lignes manuscrites » synthétiques
    for (let x = 0; x < w; x++) raw[row + 1 + x] = line && x > 150 && x < w - 150 ? 40 : 245 - ((x * 7 + y * 3 + seed) % 5);
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // profondeur
  ihdr[9] = 0; // niveaux de gris
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
{
  const doc = await PDFDocument.create();
  for (let i = 0; i < 3; i++) {
    const img = await doc.embedPng(grayPng(1654, 2339, i));
    const page = doc.addPage(A4);
    page.drawImage(img, { x: 0, y: 0, width: A4[0], height: A4[1] });
  }
  write('scan-image.pdf', await doc.save());
}

// 7. Fichiers invalides
{
  const doc = await PDFDocument.create();
  for (let i = 0; i < 20; i++) await textPage(doc, A4, `Page ${i + 1}`, ['Fichier destiné à être tronqué.']);
  const full = Buffer.from(await doc.save());
  write('tronque.pdf', full.subarray(0, Math.floor(full.length * 0.6)));
  write('pas-un-pdf.pdf', 'Ceci est un fichier texte, pas un PDF.\n');
  write('vide.pdf', '');
}
console.log('Fixtures générées dans tests/fixtures/out/');

// 9. Formulaire : texte, case à cocher, boutons radio, liste déroulante
{
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage(A4);
  page.drawText('Formulaire de test', { x: 50, y: 780, size: 22, font });
  const form = doc.getForm();
  const label = (t: string, y: number) => page.drawText(t, { x: 50, y: y + 6, size: 12, font });
  label('Nom', 720);
  form.createTextField('nom').addToPage(page, { x: 160, y: 715, width: 220, height: 22 });
  label('Prénom', 680);
  form.createTextField('prenom').addToPage(page, { x: 160, y: 675, width: 220, height: 22 });
  label('J’accepte', 640);
  form.createCheckBox('accord').addToPage(page, { x: 160, y: 637, width: 18, height: 18 });
  label('Civilité', 600);
  const radio = form.createRadioGroup('civilite');
  radio.addOptionToPage('madame', page, { x: 160, y: 597, width: 16, height: 16 });
  radio.addOptionToPage('monsieur', page, { x: 200, y: 597, width: 16, height: 16 });
  label('Ville', 560);
  const dd = form.createDropdown('ville');
  dd.addOptions(['Lyon', 'Paris', 'Marseille']);
  dd.addToPage(page, { x: 160, y: 555, width: 160, height: 22 });
  write('formulaire.pdf', await doc.save());
}
