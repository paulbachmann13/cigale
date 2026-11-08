import { type Page, expect, test } from '@playwright/test';
import { PDFArray, PDFDocument, PDFName } from '@cantoo/pdf-lib';
import { readFileSync } from 'node:fs';
import { gotoHome, openPdf, waitFirstPage, withoutFilePickers } from './helpers';

type A = { id: string; kind: string; pen?: string; opacity: number; width: number; color: number[]; strokes?: number[][][]; pressures?: number[][] };
type Cig = { cigale: { app: { sessions: { annots: A[]; ink: { hasPending: boolean; forPage(n: number): unknown[] }; history: { dirty: boolean } }[] } } };
const annots = (page: Page) => page.evaluate(() => (window as unknown as Cig).cigale.app.sessions[0].annots);
const pending = (page: Page) => page.evaluate(() => (window as unknown as Cig).cigale.app.sessions[0].ink.forPage(0).length);

test.skip(({ browserName }) => browserName !== 'chromium', 'tracé : Chromium (WebKit : mêmes événements, vérifiés à la main sur iPad)');

test.beforeEach(async ({ page }) => {
  await withoutFilePickers(page);
  await gotoHome(page);
  await openPdf(page, 'simple-3p.pdf');
  await waitFirstPage(page);
  await page.waitForSelector('.textLayer span');
  await page.click('#btn-comment');
});

const pageBox = async (page: Page) => (await page.locator('.doc-view:not([hidden]) .page[data-page-number="1"]').boundingBox())!;

/** Trait à la souris : une vague. */
async function wave(page: Page, x: number, y: number, len = 160) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 24; i++) await page.mouse.move(x + (i * len) / 24, y + Math.sin(i / 3) * 14);
  await page.mouse.up();
}

/** Trait au stylet (événements « pen » avec pression), envoyés au calque de la page. */
async function penStroke(page: Page, x: number, y: number, pressures: number[]) {
  await page.evaluate(
    ({ x, y, pressures }) => {
      const layer = document.querySelector('.doc-view:not([hidden]) .page[data-page-number="1"] .annot-layer') as HTMLElement;
      const mk = (type: string, i: number, p: number) =>
        new PointerEvent(type, { pointerId: 7, pointerType: 'pen', isPrimary: true, bubbles: true, cancelable: true, clientX: x + i * 6, clientY: y + Math.sin(i / 3) * 10, pressure: p, button: 0, buttons: type === 'pointerup' ? 0 : 1 });
      layer.dispatchEvent(mk('pointerdown', 0, pressures[0]));
      pressures.forEach((p, i) => i > 0 && layer.dispatchEvent(mk('pointermove', i, p)));
      layer.dispatchEvent(mk('pointerup', pressures.length - 1, pressures[pressures.length - 1]));
    },
    { x, y, pressures },
  );
}

test('stylo à la souris : le trait apparaît tout de suite, puis entre dans le PDF (une seule étape Annuler)', async ({ page }) => {
  const pb = await pageBox(page);
  await page.click('#tool-ink');
  await expect(page.locator('#annot-pen')).toBeVisible();
  await wave(page, pb.x + 100, pb.y + 300);
  await wave(page, pb.x + 100, pb.y + 340);
  expect(await pending(page)).toBe(2); // à l'écran, pas encore dans le fichier
  const inked = () =>
    page.evaluate(() => {
      const c = document.querySelector('.doc-view:not([hidden]) .page[data-page-number="1"] .ink-canvas.normal') as HTMLCanvasElement | null;
      if (!c) return 0;
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 100) n++;
      return n;
    });
  expect(await inked()).toBeGreaterThan(200);
  await expect.poll(async () => (await annots(page)).length, { timeout: 8000 }).toBe(2);
  const list = await annots(page);
  expect(list.every((a) => a.kind === 'ink' && a.pen === 'pen')).toBe(true);
  expect(await pending(page)).toBe(0);
  // les traits sont dans la page pdf.js (rendu du fichier) : pixels sombres près du trait
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const c = document.querySelector('.doc-view:not([hidden]) .page[data-page-number="1"] canvas:not(.ink-canvas)') as HTMLCanvasElement;
        const k = c.width / c.getBoundingClientRect().width;
        const d = c.getContext('2d')!.getImageData(Math.round(100 * k), Math.round(290 * k), Math.round(170 * k), Math.round(30 * k)).data;
        let n = 0;
        for (let i = 0; i < d.length; i += 4) if (d[i] < 90 && d[i + 1] < 90) n++;
        return n;
      }),
    )
    .toBeGreaterThan(100);
  // une seule étape pour les deux traits
  await page.keyboard.press('Meta+z');
  await expect.poll(async () => (await annots(page)).length).toBe(0);
});

test('Annuler défait les traits un par un tant qu’ils ne sont pas dans le PDF, Rétablir les rend', async ({ page }) => {
  const pb = await pageBox(page);
  await page.click('#tool-ink');
  await wave(page, pb.x + 100, pb.y + 300);
  await wave(page, pb.x + 100, pb.y + 340);
  await page.keyboard.press('Meta+z');
  await expect.poll(() => pending(page)).toBe(1);
  await page.keyboard.press('Meta+z');
  await expect.poll(() => pending(page)).toBe(0);
  await page.keyboard.press('Meta+Shift+z');
  await expect.poll(() => pending(page)).toBe(1);
  await expect.poll(async () => (await annots(page)).length, { timeout: 8000 }).toBe(1);
});

test('chaque stylo retrouve sa couleur et son épaisseur', async ({ page }) => {
  await page.click('#tool-ink');
  const color = () => page.evaluate(() => (window as unknown as { cigale: { app: { annotStyle: { color: number[]; width: number } } } }).cigale.app.annotStyle);
  expect((await color()).color[0]).toBeLessThan(0.2); // stylo : presque noir, pas rouge
  await page.selectOption('#annot-pen', 'highlighter');
  expect(await color()).toMatchObject({ width: 14 });
  await page.click('.swatch[data-color="Bleu"]');
  await page.selectOption('#annot-pen', 'pen');
  expect((await color()).color[0]).toBeLessThan(0.2);
  await page.selectOption('#annot-pen', 'highlighter');
  expect((await color()).color[2]).toBeGreaterThan(0.9); // le bleu choisi est retenu pour le surligneur
});

test('un trait lent (plus de 1,5 s) n’est pas coupé par l’envoi du précédent au document', async ({ page }) => {
  const pb = await pageBox(page);
  await page.click('#tool-ink');
  await wave(page, pb.x + 100, pb.y + 300);
  await page.mouse.move(pb.x + 100, pb.y + 400);
  await page.mouse.down();
  await page.mouse.move(pb.x + 140, pb.y + 410, { steps: 5 });
  await page.waitForTimeout(2200); // le délai d'envoi du 1er trait est passé : il doit attendre la fin de celui-ci
  await page.mouse.move(pb.x + 260, pb.y + 420, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await annots(page)).length, { timeout: 9000 }).toBe(2);
  const last = (await annots(page)).map((a) => a.strokes![0].length);
  expect(Math.max(...last)).toBeGreaterThan(10); // le trait lent est entier
});

test('Rétablir reste possible même si l’envoi différé passe entre-temps', async ({ page }) => {
  const pb = await pageBox(page);
  await page.click('#tool-ink');
  await wave(page, pb.x + 100, pb.y + 300);
  await wave(page, pb.x + 100, pb.y + 340);
  await page.keyboard.press('Meta+z');
  await expect.poll(() => pending(page)).toBe(1);
  await page.waitForTimeout(2200); // envoi du trait restant
  await expect.poll(async () => (await annots(page)).length, { timeout: 8000 }).toBe(1);
});

test('la gomme ne supprime rien si le geste est annulé par le système', async ({ page }) => {
  const pb = await pageBox(page);
  await page.click('#tool-ink');
  await wave(page, pb.x + 100, pb.y + 300);
  await page.click('#tool-eraser');
  await page.evaluate(
    ({ x, y }) => {
      const layer = document.querySelector('.doc-view:not([hidden]) .page[data-page-number="1"] .annot-layer') as HTMLElement;
      const mk = (type: string, dy: number) => new PointerEvent(type, { pointerId: 5, pointerType: 'pen', isPrimary: true, bubbles: true, cancelable: true, clientX: x, clientY: y + dy, pressure: 0.5, button: 0, buttons: 1 });
      layer.dispatchEvent(mk('pointerdown', -20));
      layer.dispatchEvent(mk('pointermove', 0));
      layer.dispatchEvent(mk('pointercancel', 0));
    },
    { x: pb.x + 160, y: pb.y + 300 },
  );
  expect(await pending(page)).toBe(1); // le trait est toujours là
  await expect.poll(async () => (await annots(page)).length, { timeout: 8000 }).toBe(1);
});

test('stylet : la pression est gardée dans le fichier ; la plume s’épaissit avec la pression', async ({ page }) => {
  const pb = await pageBox(page);
  await page.click('#tool-ink');
  await page.selectOption('#annot-pen', 'fountain');
  const ramp = Array.from({ length: 30 }, (_, i) => 0.1 + (i / 29) * 0.85);
  await penStroke(page, pb.x + 100, pb.y + 300, ramp);
  await expect.poll(async () => (await annots(page)).length, { timeout: 8000 }).toBe(1);
  const [a] = await annots(page);
  expect(a.pen).toBe('fountain');
  expect(a.pressures![0]).toHaveLength(a.strokes![0].length);
  expect(Math.max(...a.pressures![0])).toBeGreaterThan(0.8);
  expect(Math.min(...a.pressures![0])).toBeLessThan(0.2);
});

test('surligneur : translucide, large, par-dessus le texte', async ({ page }) => {
  const pb = await pageBox(page);
  await page.click('#tool-ink');
  await page.selectOption('#annot-pen', 'highlighter');
  await expect(page.locator('#annot-width option')).toHaveText(['8 pt', '14 pt', '20 pt', '28 pt']);
  await wave(page, pb.x + 100, pb.y + 200, 200);
  await expect.poll(async () => (await annots(page)).length, { timeout: 8000 }).toBe(1);
  const [a] = await annots(page);
  expect(a).toMatchObject({ pen: 'highlighter', opacity: 0.4, width: 14 });
  expect(a.color[0]).toBeGreaterThan(0.9); // jaune par défaut
});

test('gomme : efface le trait touché (en attente ou déjà enregistré), pas les autres', async ({ page }) => {
  const pb = await pageBox(page);
  await page.click('#tool-ink');
  await wave(page, pb.x + 100, pb.y + 300);
  await wave(page, pb.x + 100, pb.y + 400);
  await expect.poll(async () => (await annots(page)).length, { timeout: 8000 }).toBe(2);
  await wave(page, pb.x + 100, pb.y + 500); // en attente
  await page.click('#tool-eraser');
  const [{ id: topId }, { id: midId }] = await annots(page);
  // deux gestes de gomme : sur le trait du haut (enregistré), puis sur celui du bas (en attente) ; celui du milieu reste
  for (const y of [300, 500]) {
    await page.mouse.move(pb.x + 160, pb.y + y - 25);
    await page.mouse.down();
    await page.mouse.move(pb.x + 160, pb.y + y + 25, { steps: 8 });
    await page.mouse.up();
    // le 1er geste envoie d'abord le trait en attente au document puis supprime le haut : on attend la relecture
    if (y === 300) await expect.poll(async () => (await annots(page)).map((a) => a.id).includes(topId) || (await annots(page)).length, { timeout: 8000 }).toBe(2);
  }
  await expect.poll(async () => (await annots(page)).length, { timeout: 8000 }).toBe(1);
  expect(await pending(page)).toBe(0);
  const [left] = await annots(page);
  expect(left.id).toBe(midId); // c'est bien celui du milieu
});

test('enregistrer tout de suite après avoir écrit : le trait est dans le fichier', async ({ page }) => {
  const pb = await pageBox(page);
  await page.click('#tool-ink');
  await wave(page, pb.x + 100, pb.y + 300);
  expect(await pending(page)).toBe(1); // pas encore envoyé au document
  const [download] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Meta+s')]);
  const doc = await PDFDocument.load(readFileSync((await download.path())!));
  const annotsArr = doc.getPage(0).node.lookupMaybe(PDFName.of('Annots'), PDFArray);
  expect(annotsArr?.size()).toBe(1);
  expect(await pending(page)).toBe(0);
});

test('un doigt fait défiler au lieu d’écrire dès qu’un stylet a servi', async ({ page }) => {
  const pb = await pageBox(page);
  await page.click('#tool-ink');
  await penStroke(page, pb.x + 100, pb.y + 300, Array.from({ length: 10 }, () => 0.5));
  expect(await pending(page)).toBe(1);
  await page.evaluate(
    ({ x, y }) => {
      const layer = document.querySelector('.doc-view:not([hidden]) .page[data-page-number="1"] .annot-layer') as HTMLElement;
      const mk = (type: string, dy: number) => new PointerEvent(type, { pointerId: 9, pointerType: 'touch', isPrimary: true, bubbles: true, cancelable: true, clientX: x, clientY: y + dy, pressure: 0.5, button: 0, buttons: 1 });
      layer.dispatchEvent(mk('pointerdown', 0));
      for (let i = 1; i < 8; i++) layer.dispatchEvent(mk('pointermove', i * 10));
      layer.dispatchEvent(mk('pointerup', 80));
    },
    { x: pb.x + 300, y: pb.y + 200 },
  );
  expect(await pending(page)).toBe(1); // aucun trait de plus
});
