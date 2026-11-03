import { expect, test } from '@playwright/test';
import { docRotations, gotoHome, openPdf, waitFirstPage, withoutFilePickers } from './helpers';

test.beforeEach(async ({ page }) => {
  await withoutFilePickers(page);
  page.on('dialog', (d) => void d.accept()); // « quitter la page ? » (modifications non enregistrées)
  await gotoHome(page);
});

async function modify(page: import('@playwright/test').Page) {
  await openPdf(page, 'simple-3p.pdf');
  await waitFirstPage(page);
  await page.locator('.left-panel .thumb[data-page="2"]').click();
  await page.click('#btn-rot-right');
  await expect.poll(() => docRotations(page)).toEqual([0, 90, 0]);
}

test('travail non enregistré : sauvegardé automatiquement, proposé après une fermeture imprévue, repris', async ({ page }) => {
  await modify(page);
  await page.waitForTimeout(2600); // la sauvegarde se fait 2 s après la dernière modification
  await page.reload();
  await expect(page.locator('#home')).toBeVisible();
  await expect(page.locator('#toast')).toContainText('non enregistré');
  await expect(page.locator('#drafts-list li[data-draft]')).toHaveCount(1);
  await expect(page.locator('#drafts-list')).toContainText('simple-3p.pdf');
  await page.click('[data-resume]');
  await page.waitForSelector('.tab.doc-tab.active');
  await waitFirstPage(page);
  await expect.poll(() => docRotations(page)).toEqual([0, 90, 0]); // la modification est là
  await expect(page.locator('.tab.doc-tab.dirty')).toHaveCount(1); // toujours « non enregistré »
  // la reprise a retiré la sauvegarde (une nouvelle sera refaite si on modifie)
  await page.click('#tab-home');
  await expect(page.locator('#drafts-list li[data-draft]')).toHaveCount(0);
});

test('supprimer une sauvegarde', async ({ page }) => {
  await modify(page);
  await page.waitForTimeout(2600);
  await page.reload();
  await expect(page.locator('#drafts-list li[data-draft]')).toHaveCount(1);
  await page.click('[data-discard]');
  await expect(page.locator('#no-drafts')).toBeVisible();
});

test('fermer en choisissant « Ne pas enregistrer » supprime la sauvegarde', async ({ page }) => {
  await modify(page);
  await page.waitForTimeout(2600);
  await page.locator('.tab.doc-tab .tab-close').click();
  await page.click('#unsaved-discard');
  await page.waitForTimeout(400);
  await page.reload();
  await expect(page.locator('#no-drafts')).toBeVisible();
});

test('enregistrer supprime la sauvegarde', async ({ page }) => {
  await modify(page);
  await page.waitForTimeout(2600);
  const download = page.waitForEvent('download');
  await page.keyboard.press('Meta+s');
  await download;
  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.locator('#no-drafts')).toBeVisible();
});

test('réglage : sans sauvegarde automatique, rien n’est gardé', async ({ page }) => {
  await page.click('#home-settings');
  await page.uncheck('#setting-autosave');
  await page.keyboard.press('Escape');
  await modify(page);
  await page.waitForTimeout(2600);
  await page.reload();
  await expect(page.locator('#no-drafts')).toBeVisible();
});
