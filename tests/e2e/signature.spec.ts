import { type Page, expect, test } from '@playwright/test';
import { makePng } from '../unit/helpers';
import { gotoHome, isDirty, openPdf, waitFirstPage, withoutFilePickers } from './helpers';

type A = { kind: string; rect: number[] };
const annots = (page: Page) => page.evaluate(() => (window as unknown as { cigale: { app: { sessions: { annots: unknown[] }[] } } }).cigale.app.sessions[0].annots) as Promise<A[]>;

test.beforeEach(async ({ page }) => {
  await withoutFilePickers(page);
  await gotoHome(page);
  await openPdf(page, 'simple-3p.pdf');
  await waitFirstPage(page);
  await page.click('#btn-comment');
});

const pageBox = async (page: Page) => (await page.locator('.doc-view:not([hidden]) .page[data-page-number="1"]').boundingBox())!;

async function drawSignature(page: Page) {
  await page.click('#tool-sign');
  await expect(page.locator('#dialog-signature')).toBeVisible();
  const pad = (await page.locator('#sig-pad').boundingBox())!;
  await page.mouse.move(pad.x + 40, pad.y + 100);
  await page.mouse.down();
  for (let i = 0; i < 24; i++) await page.mouse.move(pad.x + 40 + i * 14, pad.y + 100 + Math.sin(i / 2) * 40);
  await page.mouse.up();
}

test('dessiner une signature et la poser sur la page', async ({ page }) => {
  await drawSignature(page);
  await page.click('#sig-use');
  await expect(page.locator('#toast')).toContainText('Cliquez sur la page');
  const pb = await pageBox(page);
  await page.mouse.click(pb.x + 300, pb.y + 420);
  await expect.poll(async () => (await annots(page)).map((a) => a.kind)).toEqual(['signature']);
  expect(await isDirty(page)).toBe(true);
  // l'encre est dans le rendu à l'endroit du clic
  await expect(page.locator('.doc-view:not([hidden]) .page[data-page-number="1"][data-loaded="true"]')).toHaveCount(1);
  await page.waitForTimeout(400);
  const ink = await page.evaluate(
    ({ x, y }) => {
      const c = document.querySelector('.doc-view:not([hidden]) .page[data-page-number="1"] canvas') as HTMLCanvasElement;
      const k = c.width / c.getBoundingClientRect().width;
      const d = c.getContext('2d')!.getImageData(Math.round((x - 90) * k), Math.round((y - 40) * k), Math.round(180 * k), Math.round(80 * k)).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] < 80 && d[i + 1] < 80 && d[i + 2] < 120) n++;
      return n;
    },
    { x: 300 - 9, y: 420 - 9 },
  );
  expect(ink).toBeGreaterThan(80);
});

test('une signature enregistrée est proposée la fois suivante', async ({ page }) => {
  await drawSignature(page);
  await page.click('#sig-use');
  await expect(page.locator('#toast')).toContainText('Cliquez sur la page');
  await page.click('#tool-select');
  await page.click('#tool-sign');
  await expect(page.locator('#sig-saved .sig-use')).toHaveCount(1);
  await page.locator('#sig-saved .sig-use').click();
  await expect(page.locator('#dialog-signature')).toHaveCount(0);
  await expect(page.locator('#tool-sign')).toHaveAttribute('aria-pressed', 'true'); // l'outil est prêt (le message précédent peut encore être affiché)
  const pb = await pageBox(page);
  await page.mouse.click(pb.x + 250, pb.y + 380);
  await expect.poll(async () => (await annots(page)).length).toBe(1);
});

test('signature tapée', async ({ page }) => {
  await page.click('#tool-sign');
  await page.click('#sig-tab-type');
  await page.fill('#sig-text', 'Paul Bachmann');
  await page.click('#sig-use');
  await expect(page.locator('#toast')).toContainText('Cliquez sur la page'); // l'outil est prêt
  const pb = await pageBox(page);
  await page.mouse.click(pb.x + 300, pb.y + 420);
  await expect.poll(async () => (await annots(page)).map((a) => a.kind)).toEqual(['signature']);
});

test('signature importée (image)', async ({ page }) => {
  await page.click('#tool-sign');
  await page.click('#sig-tab-image');
  await page.locator('#sig-file').setInputFiles({ name: 'ma-signature.png', mimeType: 'image/png', buffer: Buffer.from(makePng(200, 80)) });
  await page.waitForTimeout(500);
  await page.click('#sig-use');
  await expect(page.locator('#toast')).toContainText('Cliquez sur la page'); // l'outil est prêt
  const pb = await pageBox(page);
  await page.mouse.click(pb.x + 300, pb.y + 420);
  await expect.poll(async () => (await annots(page)).map((a) => a.kind)).toEqual(['signature']);
});

test('signature vide : message, rien n’est posé', async ({ page }) => {
  await page.click('#tool-sign');
  await page.click('#sig-use');
  await expect(page.locator('#sig-error')).toContainText('Rien');
  await expect(page.locator('#dialog-signature')).toBeVisible();
});

test('déplacer et redimensionner une signature, puis l’enregistrer', async ({ page }) => {
  await drawSignature(page);
  await page.click('#sig-use');
  await expect(page.locator('#toast')).toContainText('Cliquez sur la page'); // l'outil est prêt
  const pb = await pageBox(page);
  await page.mouse.click(pb.x + 300, pb.y + 420);
  await expect.poll(async () => (await annots(page)).length).toBe(1);
  await page.click('#tool-select');
  const before = (await annots(page))[0].rect;
  const hb = (await page.locator('.annot-hit').first().boundingBox())!;
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2 + 80, hb.y + hb.height / 2 + 40, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await annots(page))[0].rect[0]).toBeGreaterThan(before[0] + 30);
  expect((await annots(page))[0].kind).toBe('signature');
});
