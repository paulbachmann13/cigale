import { expect, test } from '@playwright/test';
import { gotoHome, openPdf, waitFirstPage } from './helpers';

test('accueil : version, boutons et aucune requête externe', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (!['localhost', '127.0.0.1'].includes(u.hostname) && u.protocol.startsWith('http')) external.push(r.url());
  });
  await gotoHome(page);
  await expect(page.locator('#app-version')).toContainText('Version 0.1.0');
  await expect(page.locator('#home-open')).toBeVisible();
  await expect(page.locator('#home-combine')).toBeDisabled();
  await openPdf(page, 'simple-3p.pdf');
  await waitFirstPage(page);
  expect(external).toEqual([]);
});

test('ouverture et affichage d’un PDF simple', async ({ page }) => {
  await gotoHome(page);
  await openPdf(page, 'simple-3p.pdf');
  await waitFirstPage(page);
  await expect(page.locator('#page-count')).toHaveText('sur 3');
  await expect(page.locator('.tab.doc-tab')).toHaveCount(1);
  await expect(page).toHaveTitle(/simple-3p\.pdf — Cigale/);
  // les miniatures se dessinent
  await expect(page.locator('.thumb')).toHaveCount(3);
  await expect.poll(async () => page.locator('.thumb canvas').first().evaluate((c: HTMLCanvasElement) => c.width)).toBeGreaterThan(50);
});
