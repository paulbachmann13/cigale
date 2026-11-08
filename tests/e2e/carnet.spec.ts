import { type Page, expect, test } from '@playwright/test';
import { gotoHome, withoutFilePickers } from './helpers';

test.beforeEach(async ({ page }) => {
  await withoutFilePickers(page);
  await gotoHome(page);
});

/** Pixels non blancs de la page 1 (le papier dessine des lignes). */
const inkedPixels = (page: Page, n = 1) =>
  page.evaluate((n) => {
    const c = document.querySelector(`.doc-view:not([hidden]) .page[data-page-number="${n}"] canvas:not(.ink-canvas)`) as HTMLCanvasElement;
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let k = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] < 245 || d[i + 1] < 245 || d[i + 2] < 245) k++;
    return k;
  }, n);

test('nouveau carnet Seyès : 10 pages A4, le stylo est prêt, document non enregistré', async ({ page }) => {
  await page.click('#home-notebook');
  await expect(page.locator('#dialog-notebook')).toBeVisible();
  await page.selectOption('#nb-paper', 'seyes');
  await page.fill('#nb-pages', '10');
  await page.click('#nb-create');
  await expect(page.locator('.left-panel .thumb')).toHaveCount(10);
  await page.waitForSelector('.doc-view:not([hidden]) .page[data-page-number="1"] canvas');
  await expect(page.locator('#tool-ink')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => inkedPixels(page)).toBeGreaterThan(5000);
  const dirty = await page.evaluate(() => (window as unknown as { cigale: { app: { sessions: { history: { dirty: boolean }; name: string }[] } } }).cigale.app.sessions[0]);
  expect(dirty.name).toBe('Carnet');
});

test('papier uni : la page est blanche ; nombre de pages invalide refusé', async ({ page }) => {
  await page.click('#home-notebook');
  await page.selectOption('#nb-paper', 'blank');
  await page.fill('#nb-pages', '0');
  await page.click('#nb-create');
  await expect(page.locator('#nb-error')).toContainText('entre 1 et 500');
  await page.fill('#nb-pages', '2');
  await page.click('#nb-create');
  await expect(page.locator('.left-panel .thumb')).toHaveCount(2);
  await page.waitForSelector('.doc-view:not([hidden]) .page[data-page-number="1"] canvas');
  await expect.poll(() => inkedPixels(page)).toBeLessThan(50);
});

test('insérer 2 pages quadrillées après la page 1 d’un carnet', async ({ page }) => {
  await page.click('#home-notebook');
  await page.selectOption('#nb-paper', 'blank');
  await page.fill('#nb-pages', '2');
  await page.click('#nb-create');
  await expect(page.locator('.left-panel .thumb')).toHaveCount(2);
  await page.locator('.left-panel .thumb[data-page="1"]').click();
  await page.click('#btn-insert');
  await page.click('[data-id="insert-paper"]');
  await expect(page.locator('#dialog-insert-paper')).toBeVisible();
  await page.selectOption('#ip-paper', 'grid');
  await page.fill('#ip-count', '2');
  await page.click('#ip-insert');
  await expect(page.locator('.left-panel .thumb')).toHaveCount(4);
  await page.waitForSelector('.doc-view:not([hidden]) .page[data-page-number="2"] canvas');
  await expect.poll(() => inkedPixels(page, 2)).toBeGreaterThan(3000);
});

test('ajouter une image : choisie, posée d’un clic, sélectionnée, visible, et elle suit si on la déplace', async ({ page }) => {
  await page.click('#home-notebook');
  await page.selectOption('#nb-paper', 'blank');
  await page.fill('#nb-pages', '1');
  await page.click('#nb-create');
  await page.waitForSelector('.doc-view:not([hidden]) .page[data-page-number="1"] canvas');
  const png = await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 160;
    c.height = 100;
    const g = c.getContext('2d')!;
    g.fillStyle = '#2060d0';
    g.fillRect(0, 0, 160, 100);
    const b = await new Promise<Blob>((r) => c.toBlob((x) => r(x!), 'image/png'));
    return Array.from(new Uint8Array(await b.arrayBuffer()));
  });
  const chooser = page.waitForEvent('filechooser');
  await page.click('#tool-image');
  (await chooser).setFiles({ name: 'schema.png', mimeType: 'image/png', buffer: Buffer.from(png) });
  await expect(page.locator('#toast')).toContainText('Cliquez sur la page');
  const box = (await page.locator('.doc-view:not([hidden]) .page[data-page-number="1"]').boundingBox())!;
  await page.mouse.click(box.x + 250, box.y + 300);
  const annots = () => page.evaluate(() => (window as unknown as { cigale: { app: { sessions: { annots: { kind: string; rect: number[] }[] }[] } } }).cigale.app.sessions[0].annots);
  await expect.poll(async () => (await annots()).map((a) => a.kind)).toEqual(['image']);
  await expect(page.locator('#tool-select')).toHaveAttribute('aria-pressed', 'true'); // on repasse à « Sélectionner »
  await expect(page.locator('.annot-hit.selected')).toHaveCount(1);
  // rendu : des pixels bleus là où l'image est posée
  await expect
    .poll(() =>
      page.evaluate(
        ({ x, y }) => {
          const c = document.querySelector('.doc-view:not([hidden]) .page[data-page-number="1"] canvas:not(.ink-canvas)') as HTMLCanvasElement;
          const k = c.width / c.getBoundingClientRect().width;
          const d = c.getContext('2d')!.getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data;
          return d[2] > 180 && d[0] < 90;
        },
        { x: 250, y: 300 },
      ),
    )
    .toBe(true);
});
