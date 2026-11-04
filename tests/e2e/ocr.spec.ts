import { type Page, expect, test } from '@playwright/test';
import { PDFDocument, StandardFonts } from '@cantoo/pdf-lib';
import { gotoHome, isDirty, waitFirstPage, withoutFilePickers } from './helpers';

test.beforeEach(async ({ page }) => {
  await withoutFilePickers(page);
  await gotoHome(page);
});

const tool = async (page: Page, id: string) => {
  await page.click('#btn-tools');
  await page.click(`[data-id="${id}"]`);
};

/** Un « scan » : une image de texte (dessinée par le navigateur), sans aucun texte dans le PDF. Page 2 : texte numérique. */
async function makeScan(page: Page): Promise<Buffer> {
  const png = await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 1700;
    c.height = 2200; // 200 dpi sur une page Lettre
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#000';
    g.font = 'bold 64px Helvetica, Arial, sans-serif';
    g.fillText('Facture numero 2026', 200, 400);
    g.font = '56px Helvetica, Arial, sans-serif';
    g.fillText('Cigale reconnait le texte', 200, 700);
    const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png'));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  const doc = await PDFDocument.create();
  const img = await doc.embedPng(Uint8Array.from(png));
  doc.addPage([612, 792]).drawImage(img, { x: 0, y: 0, width: 612, height: 792 });
  const p2 = doc.addPage([612, 792]);
  p2.drawText('Deja du texte', { x: 72, y: 700, size: 20, font: await doc.embedFont(StandardFonts.Helvetica) });
  return Buffer.from(await doc.save());
}

interface Item { str: string; x: number; y: number }
const textItems = (page: Page, n: number): Promise<Item[]> =>
  page.evaluate(async (n) => {
    const pdf = (window as unknown as { cigale: { app: { sessions: { view: { pdf: { getPage(n: number): Promise<any> } } }[] } } }).cigale.app.sessions.at(-1)!.view.pdf;
    const p = await pdf.getPage(n);
    const vp = p.getViewport({ scale: 1 });
    const tc = await p.getTextContent();
    return tc.items.map((it: any) => {
      const [x, y] = vp.convertToViewportPoint(it.transform[4], it.transform[5]);
      return { str: it.str, x, y };
    });
  }, n);

test('OCR : un scan devient cherchable, au bon endroit, sans toucher aux pages qui ont déjà du texte', async ({ page }) => {
  test.setTimeout(180_000);
  await page.locator('#file-input').setInputFiles({ name: 'scan.pdf', mimeType: 'application/pdf', buffer: await makeScan(page) });
  await waitFirstPage(page);
  expect(await textItems(page, 1)).toHaveLength(0);
  await tool(page, 'tool-ocr');
  await expect(page.locator('#dialog-ocr')).toBeVisible();
  await page.selectOption('#ocr-lang', 'fra');
  await page.click('#tool-apply');
  await expect.poll(async () => (await textItems(page, 1)).map((i) => i.str).join(' '), { timeout: 150_000 }).toContain('Facture');
  const items = await textItems(page, 1);
  const all = items.map((i) => i.str).join(' ');
  expect(all).toMatch(/numero/);
  expect(all).toMatch(/2026/);
  expect(all).toMatch(/reconnait/);
  // « Facture » est dessiné à x = 200 px, ligne de base à y = 400 px (sur 1700 × 2200) → 72 pt, 144 pt à l'écran
  const facture = items.find((i) => i.str.startsWith('Facture'))!;
  expect(Math.abs(facture.x - 72)).toBeLessThan(6);
  expect(Math.abs(facture.y - 144)).toBeLessThan(8);
  // la page 2 avait déjà du texte : inchangée
  expect((await textItems(page, 2)).map((i) => i.str).join(' ')).toBe('Deja du texte');
  expect(await isDirty(page)).toBe(true);
  // annulable comme toute modification
  await page.keyboard.press('Meta+z');
  await expect.poll(async () => (await textItems(page, 1)).length).toBe(0);
});

test('OCR : rien à faire si toutes les pages ont déjà du texte', async ({ page }) => {
  await page.locator('#file-input').setInputFiles({ name: 'scan.pdf', mimeType: 'application/pdf', buffer: await makeScan(page) });
  await waitFirstPage(page);
  await tool(page, 'tool-ocr');
  await page.check('#scope-range');
  await page.fill('#scope-range-text', '2');
  await page.click('#tool-apply');
  await expect(page.locator('#toast')).toContainText('contiennent déjà du texte');
  expect(await isDirty(page)).toBe(false);
});

test('OCR : Annuler rend la main tout de suite et ne modifie pas le document', async ({ page }) => {
  await page.locator('#file-input').setInputFiles({ name: 'scan.pdf', mimeType: 'application/pdf', buffer: await makeScan(page) });
  await waitFirstPage(page);
  await tool(page, 'tool-ocr');
  await page.click('#tool-apply');
  await page.click('#loading-cancel');
  await expect(page.locator('#loading-cancel')).toBeHidden();
  await page.waitForTimeout(4000); // le traitement abandonné ne doit rien appliquer ensuite
  expect(await textItems(page, 1)).toHaveLength(0);
  expect(await isDirty(page)).toBe(false);
});
