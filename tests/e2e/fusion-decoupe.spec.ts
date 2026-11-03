import { expect, test } from '@playwright/test';
import { unzipSync } from 'fflate';
import { readFileSync } from 'node:fs';
import { PDFDocument } from '@cantoo/pdf-lib';
import { docTitles, fixture, gotoHome, isDirty, openPdf, waitFirstPage, withoutFilePickers } from './helpers';

test.beforeEach(async ({ page }) => {
  await withoutFilePickers(page);
  await gotoHome(page);
});

async function addFiles(page: import('@playwright/test').Page, files: (string | { name: string; mimeType: string; buffer: Buffer })[]) {
  const chooser = page.waitForEvent('filechooser');
  await page.click('#combine-add');
  await (await chooser).setFiles(files.map((f) => (typeof f === 'string' ? { name: f, mimeType: 'application/pdf', buffer: readFileSync(fixture(f)) } : f)));
}

test('combiner deux PDF depuis l’accueil : ordre, signets, nouvel onglet non enregistré', async ({ page }) => {
  await page.click('#home-combine');
  await expect(page.locator('#dialog-combine')).toBeVisible();
  await expect(page.locator('#combine-go')).toBeDisabled();
  await addFiles(page, ['simple-3p.pdf', 'signets.pdf']);
  await expect(page.locator('.combine-row')).toHaveCount(2);
  await expect(page.locator('#combine-summary')).toContainText('2 fichier(s), 9 page(s)');
  // monter le 2e fichier
  await page.locator('.combine-row').nth(1).getByRole('button', { name: 'Monter' }).click();
  await expect(page.locator('.combine-row').first()).toHaveAttribute('data-name', 'signets.pdf');
  await page.click('#combine-go');
  await expect(page.locator('.tab.doc-tab.active .tab-label')).toContainText('Combiné.pdf');
  await waitFirstPage(page);
  expect(await docTitles(page)).toHaveLength(9);
  expect((await docTitles(page))[0]).toBe('Chapitre page 1');
  expect((await docTitles(page))[6]).toMatch(/^Page 1/);
  expect(await isDirty(page)).toBe(true);
  await page.click('#panel-tab-bookmarks');
  await expect(page.locator('.outline')).toContainText('signets');
  await expect(page.locator('.outline')).toContainText('simple-3p');
  await expect(page.locator('.outline')).toContainText('Section B.1');
});

test('combiner un document ouvert avec une plage de pages', async ({ page }) => {
  await openPdf(page, 'simple-3p.pdf');
  await waitFirstPage(page);
  await page.click('#file-menu');
  await page.click('[data-id="combine"]');
  await expect(page.locator('.combine-row')).toHaveCount(1);
  await addFiles(page, ['signets.pdf']);
  await page.locator('.combine-row').nth(1).locator('.range-input').fill('2-3, 6');
  await page.click('#combine-go');
  await expect(page.locator('.tab.doc-tab')).toHaveCount(2);
  await expect.poll(async () => (await docTitles(page, 1)).length).toBe(6);
  expect((await docTitles(page, 1)).slice(3)).toEqual(['Chapitre page 2', 'Chapitre page 3', 'Chapitre page 6']);
  expect(await isDirty(page, 0)).toBe(false); // l'original n'a pas bougé
});

test('plage invalide : message clair, rien n’est créé', async ({ page }) => {
  await page.click('#home-combine');
  await addFiles(page, ['simple-3p.pdf']);
  await page.locator('.range-input').first().fill('2-9');
  await page.click('#combine-go');
  await expect(page.locator('#combine-error')).toContainText('2-9');
  await expect(page.locator('.tab.doc-tab')).toHaveCount(0);
});

test('combiner des images (JPEG, PNG, WebP) avec un PDF', async ({ page }) => {
  const imgs = await page.evaluate(async () => {
    const make = async (type: string) => {
      const c = document.createElement('canvas');
      c.width = 400;
      c.height = 300;
      const x = c.getContext('2d')!;
      x.fillStyle = '#c33';
      x.fillRect(0, 0, 400, 300);
      x.fillStyle = '#fff';
      x.fillRect(50, 50, 100, 100);
      const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), type, 0.9));
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    };
    return { jpg: await make('image/jpeg'), png: await make('image/png'), webp: await make('image/webp') };
  });
  await page.click('#home-combine');
  await addFiles(page, [
    'simple-3p.pdf',
    { name: 'photo.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(imgs.jpg) },
    { name: 'dessin.png', mimeType: 'image/png', buffer: Buffer.from(imgs.png) },
    { name: 'web.webp', mimeType: 'image/webp', buffer: Buffer.from(imgs.webp) },
  ]);
  await expect(page.locator('.combine-row')).toHaveCount(4);
  await expect(page.locator('.combine-row').nth(1)).toContainText('Image');
  await expect(page.locator('.combine-row').nth(1).locator('.range-input')).toBeDisabled();
  await page.click('#combine-go');
  await expect(page.locator('.tab.doc-tab.active .tab-label')).toContainText('Combiné.pdf');
  await waitFirstPage(page);
  const info = await page.evaluate(async () => {
    const s = (window as unknown as { cigale: { app: { sessions: { view: { pdf: { numPages: number; getPage(n: number): Promise<{ view: number[] }> } } }[] } } }).cigale.app.sessions[0];
    return { n: s.view.pdf.numPages, size: (await s.view.pdf.getPage(4)).view };
  });
  expect(info.n).toBe(6);
  expect(info.size.slice(2).map(Math.round)).toEqual([400, 300]);
});

test('diviser par plages : ouvrir dans des onglets', async ({ page }) => {
  await openPdf(page, 'signets.pdf');
  await waitFirstPage(page);
  await page.click('#file-menu');
  await page.click('[data-id="split"]');
  await page.fill('#split-ranges', '1-2, 3-6');
  await expect(page.locator('#split-preview li')).toHaveCount(2);
  await expect(page.locator('#split-preview li').first()).toContainText('signets - pages 1–2.pdf');
  await page.click('#split-tabs');
  await expect(page.locator('.tab.doc-tab')).toHaveCount(3);
  expect(await docTitles(page, 1)).toHaveLength(2);
  expect(await docTitles(page, 2)).toHaveLength(4);
  expect(await isDirty(page, 0)).toBe(false);
});

test('diviser tous les N pages : aperçu et limite d’onglets', async ({ page }) => {
  await openPdf(page, 'long-500p.pdf');
  await waitFirstPage(page);
  await page.click('#file-menu');
  await page.click('[data-id="split"]');
  await page.click('#split-mode-every');
  await page.fill('#split-every', '100');
  await expect(page.locator('#split-preview li')).toHaveCount(5);
  await expect(page.locator('#split-tabs')).toBeEnabled();
  await page.fill('#split-every', '10'); // 50 parties : trop pour des onglets
  await expect(page.locator('#split-preview li')).toHaveCount(50);
  await expect(page.locator('#split-tabs')).toBeDisabled();
  await expect(page.locator('#split-zip')).toBeEnabled();
});

test('diviser en .zip : noms et contenus', async ({ page }) => {
  await openPdf(page, 'signets.pdf');
  await waitFirstPage(page);
  await page.click('#file-menu');
  await page.click('[data-id="split"]');
  await page.click('#split-mode-every');
  await page.fill('#split-every', '2');
  await page.fill('#split-name', 'Rapport: été');
  const download = page.waitForEvent('download');
  await page.click('#split-zip');
  const file = await download;
  expect(file.suggestedFilename().normalize('NFC')).toBe('Rapport été.zip'); // WebKit renvoie les accents décomposés
  const files = unzipSync(new Uint8Array(readFileSync((await file.path())!)));
  expect(Object.keys(files).sort()).toEqual(['Rapport été - pages 1–2.pdf', 'Rapport été - pages 3–4.pdf', 'Rapport été - pages 5–6.pdf']);
  for (const bytes of Object.values(files)) expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2);
});

test('diviser par signets de premier niveau', async ({ page }) => {
  await openPdf(page, 'signets.pdf');
  await waitFirstPage(page);
  await page.click('#file-menu');
  await page.click('[data-id="split"]');
  await expect(page.locator('#split-mode-bookmarks')).toBeEnabled();
  await page.click('#split-mode-bookmarks');
  await expect(page.locator('#split-preview li')).toHaveCount(3);
  await expect(page.locator('#split-preview li').nth(1)).toContainText('Partie A');
  await page.click('#split-tabs');
  await expect(page.locator('.tab.doc-tab')).toHaveCount(4);
  expect(await docTitles(page, 2)).toHaveLength(3); // Partie A : pages 2 à 4
});

test('diviser : plage invalide, rien ne part', async ({ page }) => {
  await openPdf(page, 'signets.pdf');
  await waitFirstPage(page);
  await page.click('#file-menu');
  await page.click('[data-id="split"]');
  await page.fill('#split-ranges', '3-12');
  await expect(page.locator('#split-error')).toContainText('3-12');
  await expect(page.locator('#split-zip')).toBeDisabled();
});
