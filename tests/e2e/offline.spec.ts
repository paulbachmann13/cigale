import { expect, test } from '@playwright/test';
import { gotoHome, openPdf, waitFirstPage } from './helpers';

test('hors ligne : l’application se recharge et affiche un PDF sans réseau', async ({ page, context }) => {
  await gotoHome(page);
  // attendre que le service worker contrôle la page (précache terminé)
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#home')).toBeVisible();
  await openPdf(page, 'signets.pdf'); // polices, wasm et worker viennent du cache
  await waitFirstPage(page);
  await expect(page.locator('#page-count')).toHaveText('sur 6');
});
