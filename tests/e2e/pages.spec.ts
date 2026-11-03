import { expect, test } from '@playwright/test';
import { PDFDocument } from '@cantoo/pdf-lib';
import { docRotations, docTitles, expectPages, fixture, gotoHome, isDirty, openPdf, waitFirstPage, withoutFilePickers } from './helpers';

test.beforeEach(async ({ page }) => {
  await withoutFilePickers(page);
  await gotoHome(page);
  await openPdf(page, 'simple-3p.pdf');
  await waitFirstPage(page);
  await expect(page.locator('.left-panel .thumb')).toHaveCount(3);
});

const thumb = (page: import('@playwright/test').Page, n: number) => page.locator(`.left-panel .thumb[data-page="${n}"]`);

test('sélection : clic, ⌘-clic, Maj-clic', async ({ page }) => {
  await thumb(page, 1).click();
  await thumb(page, 3).click({ modifiers: ['Shift'] });
  await expect(page.locator('.left-panel .thumb.selected')).toHaveCount(3);
  await thumb(page, 2).click({ modifiers: ['Meta'] });
  await expect(page.locator('.left-panel .thumb.selected')).toHaveCount(2);
  await thumb(page, 2).click();
  await expect(page.locator('.left-panel .thumb.selected')).toHaveCount(1);
});

test('boutons de pages désactivés sans sélection', async ({ page }) => {
  await expect(page.locator('#btn-delete')).toBeDisabled();
  await expect(page.locator('#btn-undo')).toBeDisabled();
  await thumb(page, 2).click();
  await expect(page.locator('#btn-delete')).toBeEnabled();
});

test('pivoter une page puis annuler et rétablir', async ({ page }) => {
  expect(await isDirty(page)).toBe(false);
  await thumb(page, 2).click();
  await page.click('#btn-rot-right');
  await expect.poll(() => docRotations(page)).toEqual([0, 90, 0]);
  expect(await isDirty(page)).toBe(true);
  await expect(page.locator('.tab.doc-tab.dirty')).toHaveCount(1);
  await expect(page.locator('#status')).toContainText('non enregistrées');
  await page.click('#btn-rot-left');
  await expect.poll(() => docRotations(page)).toEqual([0, 0, 0]);
  await page.click('#btn-undo');
  await expect.poll(() => docRotations(page)).toEqual([0, 90, 0]);
  await page.click('#btn-undo');
  await expect.poll(() => docRotations(page)).toEqual([0, 0, 0]);
  expect(await isDirty(page)).toBe(false); // retour à l'état enregistré
  await page.click('#btn-redo');
  await expect.poll(() => docRotations(page)).toEqual([0, 90, 0]);
});

test('supprimer avec la touche Retour arrière, puis annuler', async ({ page }) => {
  await thumb(page, 2).click();
  await page.keyboard.press('Backspace');
  await expectPages(page, 2);
  expect((await docTitles(page)).map((s) => s.slice(0, 6))).toEqual(['Page 1', 'Page 3']);
  await page.keyboard.press('Meta+z');
  await expectPages(page, 3);
  expect((await docTitles(page)).map((s) => s.slice(0, 6))).toEqual(['Page 1', 'Page 2', 'Page 3']);
});

test('impossible de supprimer toutes les pages', async ({ page }) => {
  await thumb(page, 1).click();
  await thumb(page, 3).click({ modifiers: ['Shift'] });
  await page.click('#btn-delete');
  await expect(page.locator('#toast')).toContainText('au moins une page');
  await expectPages(page, 3);
});

test('dupliquer', async ({ page }) => {
  await thumb(page, 1).click();
  await page.click('#btn-duplicate');
  await expectPages(page, 4);
  expect((await docTitles(page)).map((s) => s.slice(0, 6))).toEqual(['Page 1', 'Page 1', 'Page 2', 'Page 3']);
  await expect(page.locator('.left-panel .thumb.selected')).toHaveCount(1);
});

test('insérer une page vierge', async ({ page }) => {
  await thumb(page, 2).click();
  await page.click('#btn-insert');
  await page.click('[data-id="insert-blank-after"]');
  await expectPages(page, 4);
  expect((await docTitles(page)).map((s) => s.slice(0, 6))).toEqual(['Page 1', 'Page 2', '', 'Page 3']);
});

test('menu contextuel : déplacer au début et à la fin', async ({ page }) => {
  await thumb(page, 3).click({ button: 'right' });
  await page.click('[data-id="move-start"]');
  await expect.poll(async () => (await docTitles(page)).map((s) => s.slice(0, 6))).toEqual(['Page 3', 'Page 1', 'Page 2']);
  await thumb(page, 1).click({ button: 'right' });
  await page.click('[data-id="move-end"]');
  await expect.poll(async () => (await docTitles(page)).map((s) => s.slice(0, 6))).toEqual(['Page 1', 'Page 2', 'Page 3']);
});

test('déplacer vers un numéro de page', async ({ page }) => {
  await thumb(page, 1).click({ button: 'right' });
  await page.click('[data-id="move-to"]');
  await page.fill('#number-input', '4'); // 4 = après la dernière page
  await page.click('#number-ok');
  await expect.poll(async () => (await docTitles(page)).map((s) => s.slice(0, 6))).toEqual(['Page 2', 'Page 3', 'Page 1']);
});

test('glisser-déposer une miniature', async ({ page }) => {
  await thumb(page, 3).dragTo(thumb(page, 1), { targetPosition: { x: 20, y: 5 } });
  await expect.poll(async () => (await docTitles(page)).map((s) => s.slice(0, 6))).toEqual(['Page 3', 'Page 1', 'Page 2']);
});

test('Organiser les pages : grille, sélection et glisser-déposer', async ({ page }) => {
  await page.click('#btn-organize');
  await expect(page.locator('.organizer .thumb')).toHaveCount(3);
  await expect(page.locator('.doc-view:not([hidden])')).toHaveCount(0);
  await page.locator('.organizer .thumb[data-page="1"]').click();
  await page.locator('.organizer .thumb[data-page="2"]').click({ modifiers: ['Meta'] });
  await expect(page.locator('#selection-info')).toContainText('2 pages sélectionnées');
  await page.locator('.organizer .thumb[data-page="1"]').dragTo(page.locator('.organizer .thumb[data-page="3"]'), { targetPosition: { x: 150, y: 20 } });
  await expect.poll(async () => (await docTitles(page)).map((s) => s.slice(0, 6))).toEqual(['Page 3', 'Page 1', 'Page 2']);
  // la sélection suit les pages déplacées
  await expect(page.locator('.organizer .thumb.selected')).toHaveCount(2);
  await page.locator('.organizer .thumb[data-page="2"]').dblclick();
  await expect(page.locator('.organizer')).toBeHidden();
  await expect(page.locator('.doc-view:not([hidden])')).toHaveCount(1);
});

test('insérer les pages d’un autre PDF', async ({ page }) => {
  await thumb(page, 1).click();
  await page.click('#btn-insert');
  const chooser = page.waitForEvent('filechooser');
  await page.click('[data-id="insert-file"]');
  await (await chooser).setFiles(new URL('../fixtures/out/signets.pdf', import.meta.url).pathname);
  await expectPages(page, 9);
  const titles = (await docTitles(page)).map((s) => s.slice(0, 8));
  expect(titles[0]).toBe('Page 1 —');
  expect(titles[1]).toBe('Chapitre');
});

test('extraire des pages : nouveau document non enregistré', async ({ page }) => {
  await thumb(page, 2).click();
  await thumb(page, 3).click({ modifiers: ['Shift'] });
  await page.click('#btn-extract');
  await expect(page.locator('.tab.doc-tab')).toHaveCount(2);
  await expect(page.locator('.tab.doc-tab.active .tab-label')).toContainText('(extrait)');
  await expect(page.locator('.tab.doc-tab.dirty')).toHaveCount(1);
  expect((await docTitles(page, 1)).map((s) => s.slice(0, 6))).toEqual(['Page 2', 'Page 3']);
  // le document d'origine n'a pas bougé
  expect(await isDirty(page, 0)).toBe(false);
  expect(await docTitles(page, 0)).toHaveLength(3);
});

test('la recherche et le texte fonctionnent après modification', async ({ page }) => {
  await thumb(page, 1).click();
  await page.click('#btn-duplicate');
  await expectPages(page, 4);
  await page.keyboard.press('Meta+f');
  await page.fill('#find-input', 'marmotte1');
  await expect(page.locator('#find-count')).toContainText('2'); // deux pages « 1 » maintenant
});

test('les pages non touchées sont identiques au pixel près', async ({ page }) => {
  const canvasOf = (n: number) =>
    page.evaluate(async (n) => {
      const el = document.querySelector(`.doc-view:not([hidden]) .page[data-page-number="${n}"][data-loaded="true"] canvas`) as HTMLCanvasElement | null;
      return el ? el.toDataURL() : null;
    }, n);
  await expect.poll(() => canvasOf(1)).not.toBeNull();
  const before = await canvasOf(1);
  await thumb(page, 3).click();
  await page.click('#btn-rot-right');
  await expect.poll(() => docRotations(page)).toEqual([0, 0, 90]);
  await expect.poll(() => canvasOf(1)).not.toBeNull();
  expect(await canvasOf(1)).toBe(before);
});

test('fermer un document modifié : confirmation (annuler, ne pas enregistrer)', async ({ page }) => {
  await thumb(page, 2).click();
  await page.click('#btn-rot-right');
  await expect(page.locator('.tab.doc-tab.dirty')).toHaveCount(1);
  await page.locator('.tab.doc-tab .tab-close').click();
  await expect(page.locator('#dialog-unsaved')).toBeVisible();
  await page.click('#unsaved-cancel');
  await expect(page.locator('.tab.doc-tab')).toHaveCount(1);
  await page.locator('.tab.doc-tab .tab-close').click();
  await page.click('#unsaved-discard');
  await expect(page.locator('.tab.doc-tab')).toHaveCount(0);
});

test('enregistrer sans accès au fichier : télécharge une copie correcte', async ({ page }) => {
  await thumb(page, 2).click();
  await page.click('#btn-rot-right');
  await page.click('#btn-delete'); // supprime la page 2 pivotée
  await expectPages(page, 2);
  const download = page.waitForEvent('download');
  await page.keyboard.press('Meta+s');
  const file = await download;
  expect(file.suggestedFilename()).toBe('simple-3p.pdf');
  const path = await file.path();
  const { readFileSync } = await import('node:fs');
  const saved = await PDFDocument.load(readFileSync(path));
  expect(saved.getPageCount()).toBe(2);
  expect(await isDirty(page)).toBe(false);
  await expect(page.locator('.tab.doc-tab.dirty')).toHaveCount(0);
});

test('annuler très vite plusieurs fois : un seul document affiché, aucun reste en mémoire', async ({ page }) => {
  await thumb(page, 1).click();
  await page.click('#btn-duplicate');
  await expectPages(page, 4);
  await page.click('#btn-rot-right');
  await expect.poll(() => docRotations(page)).toEqual([0, 90, 0, 0]);
  await page.click('#btn-duplicate');
  await expectPages(page, 5);
  // trois ⌘Z d'affilée, sans attendre
  await page.keyboard.press('Meta+z');
  await page.keyboard.press('Meta+z');
  await page.keyboard.press('Meta+z');
  await expectPages(page, 3);
  expect(await docRotations(page)).toEqual([0, 0, 0]);
  expect(await isDirty(page)).toBe(false);
  await expect(page.locator('.doc-view')).toHaveCount(1);
  await expect(page.locator('.left-panel .thumbs')).toHaveCount(1);
});

test('un PDF protégé par mot de passe le reste après modification et enregistrement', async ({ page }) => {
  await page.click('#tab-home').catch(() => undefined);
  await page.locator('#file-input').setInputFiles(fixture('chiffre.pdf'));
  await page.fill('#password-input', 'secret');
  await page.click('#password-ok');
  await page.waitForSelector('.tab.doc-tab.active .tab-label:has-text("chiffre.pdf")');
  await page.locator('.doc-view:not([hidden]) .page canvas').first().waitFor();
  await page.click('.doc-view:not([hidden])'); // focus
  await page.locator('.left-panel .thumb').first().click();
  await page.click('#btn-rot-right');
  // avertissement : la protection est gardée, l'ancien mot de passe propriétaire est remplacé
  await expect(page.locator('#dialog-confirm')).toContainText('protégé');
  await page.click('#confirm-ok');
  await expect.poll(() => page.evaluate(() => (window as unknown as { cigale: { app: { sessions: { history: { dirty: boolean } }[] } } }).cigale.app.sessions.at(-1)!.history.dirty)).toBe(true);
  const download = page.waitForEvent('download');
  await page.keyboard.press('Meta+s');
  const file = await download;
  const { readFileSync } = await import('node:fs');
  const bytes = readFileSync((await file.path())!);
  // sans mot de passe, pdf-lib refuse : le fichier est toujours chiffré
  await expect(PDFDocument.load(bytes)).rejects.toThrow(/encrypted/i);
  expect((await PDFDocument.load(bytes, { ignoreEncryption: true })).context.trailerInfo.Encrypt).toBeDefined();
});
