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
