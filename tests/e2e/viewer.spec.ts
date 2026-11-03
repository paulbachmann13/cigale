import { expect, test } from '@playwright/test';
import { gotoHome, openPdf, waitFirstPage } from './helpers';

test.describe('affichage', () => {
  test.beforeEach(async ({ page }) => {
    await gotoHome(page);
  });

  test('zoom : boutons, liste et raccourcis', async ({ page }) => {
    await openPdf(page, 'simple-3p.pdf');
    await waitFirstPage(page);
    await page.selectOption('#zoom-select', '1');
    await expect.poll(() => page.evaluate(() => (window as any).cigale.app.sessions[0].view.scale)).toBeCloseTo(1);
    await page.click('#btn-zoom-in');
    await expect.poll(() => page.evaluate(() => (window as any).cigale.app.sessions[0].view.scale)).toBeCloseTo(1.25);
    await page.keyboard.press('Control+-');
    await page.keyboard.press('Control+-');
    await expect.poll(() => page.evaluate(() => (window as any).cigale.app.sessions[0].view.scale)).toBeCloseTo(0.75);
    await page.keyboard.press('Control+0');
    await expect(page.locator('#zoom-select')).toHaveValue('page-fit');
    await page.keyboard.press('Control+2');
    await expect(page.locator('#zoom-select')).toHaveValue('page-width');
  });

  test('navigation : aller à la page, suivant, modes d’affichage, rotation', async ({ page }) => {
    await openPdf(page, 'simple-3p.pdf');
    await waitFirstPage(page);
    await page.fill('#page-input', '3');
    await page.press('#page-input', 'Enter');
    await expect.poll(() => page.evaluate(() => (window as any).cigale.app.sessions[0].view.page)).toBe(3);
    await page.click('.thumb[data-page="1"]');
    await expect.poll(() => page.evaluate(() => (window as any).cigale.app.sessions[0].view.page)).toBe(1);

    await page.selectOption('#view-mode', 'single');
    await page.locator('.viewer-container').focus();
    await page.keyboard.press('PageDown');
    await expect.poll(() => page.evaluate(() => (window as any).cigale.app.sessions[0].view.page)).toBe(2);
    await page.keyboard.press('End');
    await expect.poll(() => page.evaluate(() => (window as any).cigale.app.sessions[0].view.page)).toBe(3);

    const before = await page.locator('.page').first().boundingBox();
    await page.click('#btn-rotate');
    await expect.poll(async () => (await page.locator('.page').first().boundingBox())!.height).not.toBeCloseTo(before!.height, 0);
  });

  test('recherche : surlignage, compteur, suivant, accents', async ({ page }) => {
    await openPdf(page, 'simple-3p.pdf');
    await waitFirstPage(page);
    await page.keyboard.press('Control+f');
    await expect(page.locator('#findbar')).toBeVisible();
    await page.fill('#find-input', 'cigale');
    await expect(page.locator('#find-count')).toHaveText('1 sur 3');
    await expect(page.locator('.textLayer .highlight').first()).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.locator('#find-count')).toHaveText('2 sur 3');
    await page.keyboard.press('Shift+Enter');
    await expect(page.locator('#find-count')).toHaveText('1 sur 3');
    // sans accents : « elephant » trouve « Éléphant » (3 pages)
    await page.fill('#find-input', 'elephant');
    await expect(page.locator('#find-count')).toHaveText('1 sur 3');
    await page.fill('#find-input', 'introuvable');
    await expect(page.locator('#find-count')).toHaveText('Aucun résultat');
    await page.keyboard.press('Escape');
    await expect(page.locator('#findbar')).toBeHidden();
  });

  test('signets imbriqués : affichage et navigation', async ({ page }) => {
    await openPdf(page, 'signets.pdf');
    await waitFirstPage(page);
    await page.click('#panel-tab-bookmarks');
    await expect(page.locator('.outline-link', { hasText: 'Partie A' })).toBeVisible();
    await page.locator('.outline summary', { hasText: 'Partie A' }).click(); // replie puis déplie
    await page.locator('.outline summary', { hasText: 'Partie A' }).click();
    await page.locator('.outline-link', { hasText: 'Section A.2' }).click();
    await expect.poll(() => page.evaluate(() => (window as any).cigale.app.sessions[0].view.page)).toBe(4);
  });

  test('plusieurs documents dans des onglets', async ({ page }) => {
    await openPdf(page, 'simple-3p.pdf');
    await waitFirstPage(page);
    await page.locator('#file-input').setInputFiles(['tests/fixtures/out/signets.pdf']);
    await expect(page.locator('.tab.doc-tab')).toHaveCount(2);
    await expect(page.locator('#page-count')).toHaveText('sur 6');
    await page.locator('.tab.doc-tab').first().locator('.tab-label').click();
    await expect(page.locator('#page-count')).toHaveText('sur 3');
    await page.locator('.tab.doc-tab').first().locator('.tab-close').click();
    await expect(page.locator('.tab.doc-tab')).toHaveCount(1);
    await page.locator('.tab.doc-tab .tab-close').click();
    await expect(page.locator('#home')).toBeVisible();
    await expect(page.locator('.recent')).toHaveCount(2);
  });

  test('pages de tailles et rotations mélangées', async ({ page }) => {
    await openPdf(page, 'tailles-mixtes.pdf');
    await waitFirstPage(page);
    await page.selectOption('#zoom-select', '1');
    const boxes = await page.locator('.page').evaluateAll((els) => els.map((e) => [Math.round(e.clientWidth), Math.round(e.clientHeight)]));
    expect(boxes).toHaveLength(4);
    expect(new Set(boxes.map((b) => b.join('x'))).size).toBe(4);
  });
});
