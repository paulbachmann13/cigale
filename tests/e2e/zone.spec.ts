import { type Page, expect, test } from '@playwright/test';
import { PDFDocument } from '@cantoo/pdf-lib';
import { gotoHome, isDirty, openPdf, waitFirstPage, withoutFilePickers } from './helpers';

test.beforeEach(async ({ page }) => {
  await withoutFilePickers(page);
  await gotoHome(page);
  await openPdf(page, 'simple-3p.pdf');
  await waitFirstPage(page);
});

const pageBox = async (page: Page, n = 1) => (await page.locator(`.doc-view:not([hidden]) .page[data-page-number="${n}"]`).boundingBox())!;

async function drawZone(page: Page) {
  await page.click('#btn-tools');
  await page.click('[data-id="tool-region"]');
  await expect(page.locator('#toast')).toContainText('Tracez un rectangle');
  const bb = await pageBox(page);
  await page.mouse.move(bb.x + bb.width * 0.2, bb.y + bb.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(bb.x + bb.width * 0.7, bb.y + bb.height * 0.5, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('#dialog-region')).toBeVisible();
  return bb;
}

const lastDocBytes = (page: Page) =>
  page.evaluate(() => {
    const app = (window as unknown as { cigale: { app: { sessions: { history: { current: Uint8Array } }[] } } }).cigale.app;
    return Array.from(app.sessions.at(-1)!.history.current);
  });

test('extraire une zone (vectoriel) : nouveau PDF d’une page de la taille de la zone, original intact', async ({ page }) => {
  const bb = await drawZone(page);
  await page.click('#tool-apply');
  await expect.poll(() => page.evaluate(() => (window as unknown as { cigale: { app: { sessions: unknown[] } } }).cigale.app.sessions.length)).toBe(2);
  const doc = await PDFDocument.load(Uint8Array.from(await lastDocBytes(page)));
  expect(doc.getPageCount()).toBe(1);
  const { width, height } = doc.getPage(0).getSize();
  // la zone fait 50 % de la largeur et 30 % de la hauteur de la page affichée
  const sx = width / (bb.width * 0.5);
  expect(Math.abs(height / (bb.height * 0.3) - sx)).toBeLessThan(0.05);
  expect(width).toBeGreaterThan(100);
  expect(await isDirty(page, 0)).toBe(false); // le document d'origine n'a pas changé
});

test('extraire une zone (image) : nouveau PDF d’une page contenant une image', async ({ page }) => {
  await drawZone(page);
  await page.check('#region-image');
  await page.click('#tool-apply');
  await expect.poll(() => page.evaluate(() => (window as unknown as { cigale: { app: { sessions: unknown[] } } }).cigale.app.sessions.length), { timeout: 30_000 }).toBe(2);
  const bytes = Uint8Array.from(await lastDocBytes(page));
  const doc = await PDFDocument.load(bytes);
  expect(doc.getPageCount()).toBe(1);
  expect(Buffer.from(bytes).includes('/Subtype /Image')).toBe(true);
});
