import { expect, test } from '@playwright/test';
import { gotoHome, openPdf, waitFirstPage } from './helpers';

// Cible du cahier des charges : première page d'un PDF de 500 pages en moins de 2 s.
test('500 pages : première page en moins de 2 s', async ({ page }) => {
  await gotoHome(page);
  await openPdf(page, 'long-500p.pdf');
  await waitFirstPage(page);
  const ms = await page.evaluate(() => (window as any).cigale.app.sessions[0].view.firstRenderMs as number);
  console.log(`PERF première page (500 pages) : ${Math.round(ms)} ms`);
  expect(ms).toBeLessThan(2000);
  await expect(page.locator('#page-count')).toHaveText('sur 500');
  // le défilement ne dessine que les pages visibles : peu de canevas à la fois
  await page.fill('#page-input', '400');
  await page.press('#page-input', 'Enter');
  await expect.poll(() => page.evaluate(() => (window as any).cigale.app.sessions[0].view.page)).toBe(400);
  const canvases = await page.locator('.page canvas').count();
  expect(canvases).toBeLessThan(30);
});

// Une modification sur un document de 500 pages (worker + rechargement + miniatures) reste fluide.
test('500 pages : pivoter, supprimer et annuler en moins de 3 s chacun', async ({ page }) => {
  await gotoHome(page);
  await openPdf(page, 'long-500p.pdf');
  await waitFirstPage(page);
  await page.locator('.left-panel .thumb[data-page="250"]').scrollIntoViewIfNeeded();
  await page.locator('.left-panel .thumb[data-page="250"]').click();
  const measure = async (label: string, action: () => Promise<void>, ready: () => Promise<unknown>) => {
    const t0 = Date.now();
    await action();
    await ready();
    const ms = Date.now() - t0;
    console.log(`PERF ${label} : ${ms} ms`);
    expect(ms, label).toBeLessThan(3000);
  };
  const rotation = () => page.evaluate(async () => (await (window as any).cigale.app.sessions[0].view.pdf.getPage(250)).rotate as number);
  await measure('pivoter une page (500 p.)', () => page.click('#btn-rot-right'), () => expect.poll(rotation).toBe(90));
  await measure('supprimer une page (500 p.)', () => page.click('#btn-delete'), () => expect(page.locator('#page-count')).toHaveText('sur 499'));
  await measure('annuler (500 p.)', () => page.click('#btn-undo'), () => expect(page.locator('#page-count')).toHaveText('sur 500'));
});
