import { type Page, expect, test } from '@playwright/test';
import { docTitles, expectPages, gotoHome, openPdf, waitFirstPage, withoutFilePickers } from './helpers';

test.beforeEach(async ({ page }) => {
  await withoutFilePickers(page);
  await gotoHome(page);
  await openPdf(page, 'simple-3p.pdf');
  await waitFirstPage(page);
});

const info = (page: Page) =>
  page.evaluate(async () => {
    const s = (window as unknown as { cigale: { app: { sessions: { view: { pdf: { getMetadata(): Promise<{ info: Record<string, string> }> } }; history: { dirty: boolean; canUndo: boolean } }[] } } }).cigale.app.sessions[0];
    const meta = await s.view.pdf.getMetadata();
    return { ...meta.info, dirty: s.history.dirty } as { Title?: string; Author?: string; dirty: boolean };
  });

test('propriétés du document : informations affichées, titre et auteur modifiables, annulable', async ({ page }) => {
  await page.click('#file-menu');
  await page.click('[data-id="properties"]');
  await expect(page.locator('#dialog-properties')).toBeVisible();
  const table = page.locator('#prop-table');
  await expect(table).toContainText('simple-3p.pdf');
  await expect(table).toContainText('3'); // pages
  await expect(table).toContainText('mm'); // format de la page
  await expect(table).toContainText('Non protégé');
  await page.fill('#prop-title', 'Cours de physique éàç');
  await page.fill('#prop-author', 'Jérôme');
  await page.click('#prop-apply');
  await expect.poll(async () => (await info(page)).Title).toBe('Cours de physique éàç');
  const after = await info(page);
  expect(after.Author).toBe('Jérôme');
  expect(after.dirty).toBe(true);
  // annuler : le titre d'origine revient
  await page.keyboard.press('Meta+z');
  await expect.poll(async () => (await info(page)).Author).not.toBe('Jérôme');
  // rouvrir la boîte sans rien changer : aucune modification
  await page.click('#file-menu');
  await page.click('[data-id="properties"]');
  await page.click('#prop-apply');
  await page.waitForTimeout(300);
  expect((await info(page)).dirty).toBe(false);
});

test('remplacer des pages par celles d’un autre PDF : confirmation, puis les pages changent', async ({ page }) => {
  await page.locator('.left-panel .thumb[data-page="2"]').click();
  await page.click('#btn-insert');
  const chooser = page.waitForEvent('filechooser');
  await page.click('[data-id="replace-pages"]');
  await (await chooser).setFiles(new URL('../fixtures/out/signets.pdf', import.meta.url).pathname);
  await expect(page.locator('#dialog-confirm')).toContainText('la page 2');
  await page.click('#confirm-ok');
  await expectPages(page, 3 - 1 + 6); // signets.pdf a 6 pages
  const titles = (await docTitles(page)).map((s) => s.slice(0, 8));
  expect(titles[0]).toBe('Page 1 —'); // la 1re page d'origine est intacte
  expect(titles.slice(-1)[0]).toBe('Page 3 —'); // la dernière aussi
  expect(titles[1]).not.toBe('Page 2 —'); // la page 2 d'origine a été remplacée
  await page.keyboard.press('Meta+z');
  await expectPages(page, 3);
});

test('remplacer : annuler la confirmation ne change rien', async ({ page }) => {
  await page.click('#btn-insert');
  const chooser = page.waitForEvent('filechooser');
  await page.click('[data-id="replace-pages"]');
  await (await chooser).setFiles(new URL('../fixtures/out/signets.pdf', import.meta.url).pathname);
  await page.click('#confirm-cancel');
  await page.waitForTimeout(300);
  await expectPages(page, 3);
});

test('comparer un PDF avec lui-même : aucune différence', async ({ page }) => {
  await page.click('#btn-tools');
  const chooser = page.waitForEvent('filechooser');
  await page.click('[data-id="tool-compare"]');
  await (await chooser).setFiles(new URL('../fixtures/out/simple-3p.pdf', import.meta.url).pathname);
  await expect(page.locator('#dialog-compare')).toBeVisible();
  await expect(page.locator('#cmp-summary')).toHaveText('Aucune différence de texte.');
  await expect(page.locator('#cmp-names')).toContainText('3 pages');
});

test('comparer deux PDF différents : pages différentes, mots ajoutés et supprimés, lien vers la page', async ({ page }) => {
  await page.click('#btn-tools');
  const chooser = page.waitForEvent('filechooser');
  await page.click('[data-id="tool-compare"]');
  await (await chooser).setFiles(new URL('../fixtures/out/signets.pdf', import.meta.url).pathname);
  await expect(page.locator('#dialog-compare')).toBeVisible();
  await expect(page.locator('#cmp-summary')).toContainText('différente');
  await expect(page.locator('#cmp-summary')).toContainText('mots ajoutés');
  await page.locator('.cmp-page[data-page="1"] summary').click(); // le détail d'une page s'ouvre au clic
  await expect(page.locator('.cmp-page[data-page="1"] .cmp-add, .cmp-page[data-page="1"] .cmp-del').first()).toBeVisible();
  await expect(page.locator('#cmp-names')).toContainText('6 pages'); // signets.pdf
  await page.locator('.cmp-page[data-page="2"] summary').click();
  await page.locator('.cmp-page[data-page="2"] button.link').click(); // « Voir cette page »
  await page.click('#cmp-close');
  await expect.poll(() => page.evaluate(() => (window as unknown as { cigale: { app: { sessions: { view: { page: number } }[] } } }).cigale.app.sessions[0].view.page)).toBe(2);
});
