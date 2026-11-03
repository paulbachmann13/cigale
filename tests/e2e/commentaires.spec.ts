import { type Page, expect, test } from '@playwright/test';
import { PDFDocument, PDFHexString, PDFName } from '@cantoo/pdf-lib';
import { readFileSync } from 'node:fs';
import { gotoHome, isDirty, openPdf, waitFirstPage, withoutFilePickers } from './helpers';

type A = { id: string; kind: string; page: number; rect: number[]; contents: string; author: string; color: number[]; strokes?: number[][][]; foreign: boolean; stamp?: string; replyTo?: string };
const annots = (page: Page) => page.evaluate(() => (window as unknown as { cigale: { app: { sessions: { annots: unknown[] }[] } } }).cigale.app.sessions[0].annots) as Promise<A[]>;
const waitKinds = async (page: Page, kinds: string[]) => expect.poll(async () => (await annots(page)).map((a) => a.kind).join(',')).toBe(kinds.join(','));

test.beforeEach(async ({ page }) => {
  await withoutFilePickers(page);
  await gotoHome(page);
  await openPdf(page, 'simple-3p.pdf');
  await waitFirstPage(page);
  await page.waitForSelector('.textLayer span');
  await page.click('#btn-comment');
});

const pageBox = async (page: Page, n = 1) => (await page.locator(`.doc-view:not([hidden]) .page[data-page-number="${n}"]`).boundingBox())!;

/** Couleur du pixel du canevas de la page à (x, y) en pixels CSS depuis le coin de la page. */
async function pixel(page: Page, x: number, y: number, n = 1): Promise<number[]> {
  return page.evaluate(
    ({ x, y, n }) => {
      const c = document.querySelector(`.doc-view:not([hidden]) .page[data-page-number="${n}"] canvas`) as HTMLCanvasElement;
      const r = c.getBoundingClientRect();
      const k = c.width / r.width;
      return Array.from(c.getContext('2d')!.getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data);
    },
    { x, y, n },
  );
}
/** Cherche dans la zone (px CSS depuis le coin du canevas) un pixel qui vérifie `ok` : renvoie le nombre de pixels trouvés. */
async function countPixels(page: Page, box: { x: number; y: number; w: number; h: number }, ok: string): Promise<number> {
  return page.evaluate(
    ({ box, ok }) => {
      const c = document.querySelector('.doc-view:not([hidden]) .page[data-page-number="1"] canvas') as HTMLCanvasElement;
      const k = c.width / c.getBoundingClientRect().width;
      const d = c.getContext('2d')!.getImageData(Math.round(box.x * k), Math.round(box.y * k), Math.round(box.w * k), Math.round(box.h * k)).data;
      const test = new Function('r', 'g', 'b', `return ${ok}`) as (r: number, g: number, b: number) => boolean;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (test(d[i], d[i + 1], d[i + 2])) n++;
      return n;
    },
    { box, ok },
  );
}

/** Attend que le canevas de la page soit redessiné avec l'annotation (data-loaded) puis rend le pixel. */
const settledPixel = async (page: Page, x: number, y: number) => {
  await expect(page.locator('.doc-view:not([hidden]) .page[data-page-number="1"][data-loaded="true"]')).toHaveCount(1);
  await page.waitForTimeout(300);
  return pixel(page, x, y);
};

async function drag(page: Page, x1: number, y1: number, x2: number, y2: number) {
  await page.mouse.move(x1, y1);
  await page.mouse.down();
  await page.mouse.move(x2, y2, { steps: 8 });
  await page.mouse.up();
}

test('surligner du texte : vraie annotation, couleur jaune visible dans le rendu', async ({ page }) => {
  await page.click('#tool-highlight');
  const span = page.locator('.doc-view:not([hidden]) .page[data-page-number="1"] .textLayer span').nth(2);
  const bb = (await span.boundingBox())!;
  await drag(page, bb.x + 2, bb.y + bb.height / 2, bb.x + bb.width - 2, bb.y + bb.height / 2);
  await waitKinds(page, ['highlight']);
  const [a] = await annots(page);
  expect(a.color[0]).toBeGreaterThan(0.9);
  expect(a.color[2]).toBeLessThan(0.3);
  expect(a.author).toBe('Utilisateur');
  // le rendu de pdf.js (donc de l'annotation écrite dans le fichier) est jaune là où le texte est surligné
  const pb = await pageBox(page);
  await settledPixel(page, 10, 10);
  // pixels jaunes (beaucoup de rouge et de vert, peu de bleu) dans la zone surlignée ; le papier blanc n'en a aucun
  const yellow = await countPixels(page, { x: bb.x - pb.x - 9, y: bb.y - pb.y - 9, w: bb.width, h: bb.height }, 'r > 230 && g > 200 && b < 200');
  expect(yellow).toBeGreaterThan(500);
  await expect(page.locator('#comments-badge')).toHaveText('1');
});

test('souligner et barrer', async ({ page }) => {
  const span = page.locator('.doc-view:not([hidden]) .page[data-page-number="1"] .textLayer span').nth(3);
  const bb = (await span.boundingBox())!;
  await page.click('#tool-underline');
  await drag(page, bb.x + 2, bb.y + bb.height / 2, bb.x + bb.width / 2, bb.y + bb.height / 2);
  await waitKinds(page, ['underline']);
  await page.click('#tool-strikeout');
  await expect(page.locator('.doc-view:not([hidden]) .page[data-page-number="1"] .textLayer span').nth(3)).toBeVisible(); // le document a été rechargé
  const bb2 = (await page.locator('.doc-view:not([hidden]) .page[data-page-number="1"] .textLayer span').nth(3).boundingBox())!;
  await drag(page, bb2.x + 2, bb2.y + bb2.height / 2, bb2.x + bb2.width / 2, bb2.y + bb2.height / 2);
  await waitKinds(page, ['underline', 'strikeout']);
});

test('rectangle, ellipse, ligne, flèche, dessin : tous écrits dans le PDF', async ({ page }) => {
  const pb = await pageBox(page);
  for (const [tool, k] of [['rect', 0], ['ellipse', 1], ['line', 2], ['arrow', 3], ['ink', 4]] as const) {
    await page.click(`#tool-${tool}`);
    await drag(page, pb.x + 100, pb.y + 300 + k * 70, pb.x + 220, pb.y + 340 + k * 70);
    await expect.poll(async () => (await annots(page)).length).toBe(k + 1);
  }
  expect((await annots(page)).map((a) => a.kind)).toEqual(['rect', 'ellipse', 'line', 'arrow', 'ink']);
  // rendu : le bord gauche du rectangle est rouge (couleur par défaut)
  await settledPixel(page, 10, 10);
  expect(await countPixels(page, { x: 80, y: 280, w: 150, h: 80 }, 'r > 180 && g < 90 && b < 90')).toBeGreaterThan(100);
});

test('note, réponse, suppression du fil', async ({ page }) => {
  const pb = await pageBox(page);
  await page.click('#tool-note');
  await page.mouse.click(pb.x + 400, pb.y + 120);
  await page.fill('.annot-pop textarea', 'À vérifier avec la comptabilité');
  await page.click('#annot-save');
  await waitKinds(page, ['note']);
  await page.click('#panel-tab-comments');
  await expect(page.locator('.comment')).toHaveCount(1);
  await expect(page.locator('.comment')).toContainText('À vérifier avec la comptabilité');
  await page.click('[data-reply]');
  await page.fill('.comment textarea', 'Fait, merci');
  await page.click('[data-send]');
  await expect.poll(async () => (await annots(page)).length).toBe(2);
  await expect(page.locator('.comment-reply')).toContainText('Fait, merci');
  expect((await annots(page)).find((a) => a.replyTo)).toBeTruthy();
  await page.locator('.comment > .comment-head .mini-tool').click();
  await expect.poll(async () => (await annots(page)).length).toBe(0); // la réponse part avec le parent
});

test('note vide : rien n’est créé', async ({ page }) => {
  const pb = await pageBox(page);
  await page.click('#tool-note');
  await page.mouse.click(pb.x + 400, pb.y + 120);
  await page.click('#annot-save');
  await expect(page.locator('#toast')).toContainText('vide');
  expect(await annots(page)).toHaveLength(0);
  expect(await isDirty(page)).toBe(false);
});

test('zone de texte : texte lisible dans le rendu, accents compris', async ({ page }) => {
  const pb = await pageBox(page);
  await page.click('#tool-freetext');
  await drag(page, pb.x + 100, pb.y + 500, pb.x + 400, pb.y + 560);
  await page.fill('.annot-pop textarea', 'Éléphant à l’été — vérifié');
  await page.click('#annot-save');
  await waitKinds(page, ['freetext']);
  const [a] = await annots(page);
  expect(a.contents).toBe('Éléphant à l’été — vérifié');
  // des pixels sombres (le texte) existent dans la zone
  await expect(page.locator('.doc-view:not([hidden]) .page[data-page-number="1"][data-loaded="true"]')).toHaveCount(1);
  await page.waitForTimeout(400);
  const ink = await countPixels(page, { x: 85, y: 485, w: 320, h: 70 }, 'r < 250 || g < 250 || b < 250');
  expect(ink).toBeGreaterThan(300); // du texte rouge a été dessiné dans la zone
});

test('tampon', async ({ page }) => {
  const pb = await pageBox(page);
  await page.click('#tool-stamp');
  await page.click('[data-id="stamp-confidential"]');
  await page.mouse.click(pb.x + 300, pb.y + 600);
  await waitKinds(page, ['stamp']);
  expect((await annots(page))[0].stamp).toBe('confidential');
});

test('sélectionner, déplacer, redimensionner, supprimer', async ({ page }) => {
  const pb = await pageBox(page);
  await page.click('#tool-rect');
  await drag(page, pb.x + 100, pb.y + 300, pb.x + 220, pb.y + 360);
  await waitKinds(page, ['rect']);
  await page.click('#tool-select');
  const before = (await annots(page))[0].rect;
  const hit = page.locator('.annot-hit').first();
  const hb = (await hit.boundingBox())!;
  await drag(page, hb.x + hb.width / 2, hb.y + hb.height / 2, hb.x + hb.width / 2 + 60, hb.y + hb.height / 2 + 30);
  await expect.poll(async () => (await annots(page))[0].rect[0]).toBeGreaterThan(before[0] + 30);
  const moved = (await annots(page))[0].rect;
  expect(moved[2] - moved[0]).toBeCloseTo(before[2] - before[0], 0); // même taille
  // redimensionner par le coin bas-droit
  const hb2 = (await page.locator('.annot-hit.selected').boundingBox())!;
  await drag(page, hb2.x + hb2.width, hb2.y + hb2.height, hb2.x + hb2.width + 40, hb2.y + hb2.height + 20);
  await expect.poll(async () => { const r = (await annots(page))[0].rect; return r[2] - r[0]; }).toBeGreaterThan(moved[2] - moved[0] + 20);
  await page.keyboard.press('Delete');
  await expect.poll(async () => (await annots(page)).length).toBe(0);
});

test('changer la couleur d’un commentaire sélectionné', async ({ page }) => {
  const pb = await pageBox(page);
  await page.click('#tool-rect');
  await drag(page, pb.x + 100, pb.y + 300, pb.x + 220, pb.y + 360);
  await waitKinds(page, ['rect']);
  await page.click('#tool-select');
  await page.locator('.annot-hit').first().click();
  await page.click('[data-color="Bleu"]');
  await expect.poll(async () => (await annots(page))[0].color[2]).toBeGreaterThan(0.8);
});

test('annuler / rétablir un commentaire ; le document devient « modifié »', async ({ page }) => {
  const pb = await pageBox(page);
  await page.click('#tool-ellipse');
  await drag(page, pb.x + 100, pb.y + 300, pb.x + 220, pb.y + 360);
  await waitKinds(page, ['ellipse']);
  expect(await isDirty(page)).toBe(true);
  await page.keyboard.press('Meta+z');
  await expect.poll(async () => (await annots(page)).length).toBe(0);
  expect(await isDirty(page)).toBe(false);
  await page.keyboard.press('Meta+Shift+z');
  await waitKinds(page, ['ellipse']);
});

test('enregistrer : les commentaires sont dans le fichier, avec apparence, et se relisent', async ({ page }) => {
  const pb = await pageBox(page);
  await page.click('#tool-rect');
  await drag(page, pb.x + 100, pb.y + 300, pb.x + 220, pb.y + 360);
  await waitKinds(page, ['rect']);
  await page.click('#tool-note');
  await page.mouse.click(pb.x + 400, pb.y + 120);
  await page.fill('.annot-pop textarea', 'Note enregistrée');
  await page.click('#annot-save');
  await waitKinds(page, ['rect', 'note']);
  const download = page.waitForEvent('download');
  await page.keyboard.press('Meta+s');
  const file = await download;
  const bytes = readFileSync((await file.path())!);
  const doc = await PDFDocument.load(bytes);
  const arr = doc.getPage(0).node.lookup(PDFName.of('Annots'), (await import('@cantoo/pdf-lib')).PDFArray);
  expect(arr.size()).toBeGreaterThanOrEqual(2);
  // rouvrir le fichier téléchargé : les commentaires sont relus
  await page.click('#tab-home');
  await page.locator('#file-input').setInputFiles({ name: 'relu.pdf', mimeType: 'application/pdf', buffer: bytes });
  await expect.poll(() => page.evaluate(() => (window as unknown as { cigale: { app: { sessions: { annots: unknown[] }[] } } }).cigale.app.sessions[1]?.annots.length)).toBe(2);
});

test('commentaire créé par un autre logiciel : listé, signalé, supprimable', async ({ page }) => {
  const doc = await PDFDocument.create();
  const p = doc.addPage([595, 842]);
  const ctx = doc.context;
  const hl = ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Highlight', Rect: [50, 700, 200, 720], QuadPoints: [50, 720, 200, 720, 50, 700, 200, 700], C: [1, 1, 0], T: PDFHexString.fromText('Marie'), Contents: PDFHexString.fromText('À relire') }));
  p.node.set(PDFName.of('Annots'), ctx.obj([hl]));
  const bytes = Buffer.from(await doc.save());
  await page.click('#tab-home');
  await page.locator('#file-input').setInputFiles({ name: 'marie.pdf', mimeType: 'application/pdf', buffer: bytes });
  await page.waitForSelector('.tab.doc-tab.active .tab-label:has-text("marie.pdf")');
  await page.click('#panel-tab-comments');
  await expect(page.locator('.comment')).toContainText('Marie');
  await expect(page.locator('.comment')).toContainText('autre logiciel');
  await page.locator('.comment > .comment-head .mini-tool').click();
  await expect(page.locator('.comment')).toHaveCount(0);
});

test('filtrer les commentaires et aller au commentaire', async ({ page }) => {
  const pb = await pageBox(page);
  for (const [i, text] of ['alpha', 'bravo'].entries()) {
    await page.click('#tool-note');
    await page.mouse.click(pb.x + 400, pb.y + 120 + i * 80);
    await page.fill('.annot-pop textarea', text);
    await page.click('#annot-save');
    await expect.poll(async () => (await annots(page)).length).toBe(i + 1);
  }
  await page.click('#panel-tab-comments');
  await expect(page.locator('.comment')).toHaveCount(2);
  await page.fill('#comments-filter', 'brav');
  await expect(page.locator('.comment')).toHaveCount(1);
  await page.locator('.comment').click();
  await expect(page.locator('.annot-hit.selected')).toHaveCount(1);
});

test('nom d’auteur réglable', async ({ page }) => {
  await page.click('#tab-home');
  await page.click('#home-settings');
  await page.fill('#setting-author', 'Paul B.');
  await page.locator('#setting-author').blur();
  await page.keyboard.press('Escape');
  await page.locator('.tab.doc-tab .tab-label').click();
  const pb = await pageBox(page);
  await page.click('#tool-rect');
  await drag(page, pb.x + 100, pb.y + 300, pb.x + 220, pb.y + 360);
  await waitKinds(page, ['rect']);
  expect((await annots(page))[0].author).toBe('Paul B.');
});

test('après un ajout, on reste à la même position de défilement et au même zoom', async ({ page }) => {
  await page.selectOption('#zoom-select', '2');
  await page.waitForTimeout(500);
  await page.evaluate(() => { document.querySelector('.doc-view:not([hidden]) .viewer-container')!.scrollTop = 700; });
  await page.waitForTimeout(300);
  const before = await page.evaluate(() => document.querySelector('.doc-view:not([hidden]) .viewer-container')!.scrollTop);
  await page.click('#tool-rect');
  const view = (await page.locator('.doc-view:not([hidden]) .viewer-container').boundingBox())!;
  await drag(page, view.x + 200, view.y + 200, view.x + 400, view.y + 300);
  await waitKinds(page, ['rect']);
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => document.querySelector('.doc-view:not([hidden]) .viewer-container')!.scrollTop);
  expect(Math.abs(after - before)).toBeLessThan(30);
  await expect(page.locator('#zoom-select')).toHaveValue('2');
});

test('panneau : Échap annule la modification du texte, ⌘Entrée l’enregistre une seule fois', async ({ page }) => {
  const pb = await pageBox(page);
  await page.click('#tool-note');
  await page.mouse.click(pb.x + 400, pb.y + 120);
  await page.fill('.annot-pop textarea', 'avant');
  await page.click('#annot-save');
  await waitKinds(page, ['note']);
  await page.click('#panel-tab-comments');
  await page.locator('.comment-text').first().click();
  await page.locator('.comments textarea').fill('Échap : ne doit rien changer');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  expect((await annots(page))[0].contents).toBe('avant');
  const count = await page.evaluate(() => (window as unknown as { cigale: { app: { sessions: { history: { canUndo: boolean } }[] } } }).cigale.app.sessions[0].history.canUndo);
  expect(count).toBe(true);
  await page.locator('.comment-text').first().click();
  await page.locator('.comments textarea').fill('après');
  await page.keyboard.press('Meta+Enter');
  await expect.poll(async () => (await annots(page))[0].contents).toBe('après');
  await page.keyboard.press('Meta+z'); // une seule étape à annuler : on revient à « avant »
  await expect.poll(async () => (await annots(page))[0].contents).toBe('avant');
});

test('dans la vue « Organiser les pages », Suppr supprime des pages, pas un commentaire', async ({ page }) => {
  const pb = await pageBox(page);
  await page.click('#tool-rect');
  await drag(page, pb.x + 100, pb.y + 300, pb.x + 220, pb.y + 360);
  await waitKinds(page, ['rect']);
  await page.click('#tool-select');
  await page.locator('.annot-hit').first().click();
  await page.click('#btn-organize');
  await page.locator('.organizer .thumb[data-page="2"]').click();
  await page.keyboard.press('Delete');
  await expect(page.locator('.organizer .thumb')).toHaveCount(2);
  expect(await annots(page)).toHaveLength(1);
});
