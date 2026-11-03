import { expect, test } from '@playwright/test';
import { gotoHome, openPdf, waitFirstPage, withoutFilePickers } from './helpers';

test.beforeEach(async ({ page }) => {
  await withoutFilePickers(page);
  await page.addInitScript(() => {
    // La boîte d'impression du système ne se pilote pas : on note ce qui serait imprimé.
    (window as unknown as { print: () => void }).print = () => {
      const imgs = Array.from(document.querySelectorAll('#print-root img')) as HTMLImageElement[];
      (window as unknown as { __printed: unknown }).__printed = { count: imgs.length, sizes: imgs.map((i) => [i.naturalWidth, i.naturalHeight]), page: document.getElementById('print-style')?.textContent };
    };
  });
  await gotoHome(page);
  await openPdf(page, 'tailles-mixtes.pdf');
  await waitFirstPage(page);
});

const printed = (page: import('@playwright/test').Page) => page.evaluate(() => (window as unknown as { __printed?: { count: number; sizes: number[][]; page: string } }).__printed);

test('⌘P : toutes les pages sont préparées en images nettes', async ({ page }) => {
  await page.keyboard.press('Meta+p');
  await page.click('#print-go');
  await expect.poll(() => printed(page)).toBeDefined();
  const p = (await printed(page))!;
  expect(p.count).toBe(4);
  for (const [w, h] of p.sizes) {
    expect(w).toBeGreaterThan(1000); // ≈ 200 dpi : pas une vignette
    expect(h).toBeGreaterThan(1000);
  }
  expect(p.page).toContain('@page');
  await expect(page.locator('#print-root')).toHaveCount(1);
});

test('imprimer une plage de pages', async ({ page }) => {
  await page.click('#file-menu');
  await page.click('[data-id="print"]');
  await page.fill('#print-range-text', '2-3');
  await page.click('#print-go');
  await expect.poll(() => printed(page)).toBeDefined();
  expect((await printed(page))!.count).toBe(2);
});

test('plage invalide : message, rien n’est imprimé', async ({ page }) => {
  await page.keyboard.press('Meta+p');
  await page.fill('#print-range-text', '2-9');
  await page.click('#print-go');
  await expect(page.locator('#print-error')).toContainText('2-9');
  expect(await printed(page)).toBeUndefined();
});

test('les annotations sont imprimées', async ({ page }) => {
  await page.click('#btn-comment');
  const pb = (await page.locator('.doc-view:not([hidden]) .page[data-page-number="1"]').boundingBox())!;
  await page.click('#tool-rect');
  await page.mouse.move(pb.x + 100, pb.y + 200);
  await page.mouse.down();
  await page.mouse.move(pb.x + 300, pb.y + 320, { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => (window as unknown as { cigale: { app: { sessions: { annots: unknown[] }[] } } }).cigale.app.sessions[0].annots.length)).toBe(1);
  await page.waitForTimeout(500);
  await page.keyboard.press('Meta+p');
  await page.click('#print-current');
  await page.click('#print-go');
  await expect.poll(() => printed(page)).toBeDefined();
  // une image imprimée contient du rouge (le rectangle)
  const red = await page.evaluate(async () => {
    const img = document.querySelector('#print-root img') as HTMLImageElement;
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const x = c.getContext('2d')!;
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 180 && d[i + 1] < 90 && d[i + 2] < 90) n++;
    return n;
  });
  expect(red).toBeGreaterThan(500);
});
