import { expect, test } from '@playwright/test';
import { PDFDocument } from '@cantoo/pdf-lib';
import { readFileSync } from 'node:fs';
import { gotoHome, openPdf, waitFirstPage, withoutFilePickers } from './helpers';

test.beforeEach(async ({ page }) => {
  await withoutFilePickers(page);
  await gotoHome(page);
  await openPdf(page, 'formulaire.pdf');
  await waitFirstPage(page);
  await page.waitForSelector('.annotationLayer input');
});

const field = (page: import('@playwright/test').Page, name: string) => page.locator(`.doc-view:not([hidden]) .annotationLayer [name="${name}"]`).first();

test('un document avec des champs est signalé comme formulaire', async ({ page }) => {
  await expect(page.locator('#form-banner')).toContainText('formulaire');
});

test('remplir, valider la saisie, enregistrer : les valeurs sont dans le fichier', async ({ page }) => {
  await field(page, 'nom').fill('Éléphant');
  await field(page, 'prenom').fill('Léa');
  await field(page, 'accord').check();
  await expect(page.locator('#form-commit')).toBeVisible();
  await expect(page.locator('.tab.doc-tab.dirty')).toHaveCount(1); // la saisie compte comme une modification
  await page.click('#form-commit');
  await expect(page.locator('#form-commit')).toHaveCount(0);
  // relu depuis le document : les champs affichent les valeurs écrites
  await expect(field(page, 'nom')).toHaveValue('Éléphant');
  await page.click('#btn-undo'); // une étape annuler/rétablir
  await expect(field(page, 'nom')).toHaveValue('');
  await page.click('#btn-redo');
  await expect(field(page, 'nom')).toHaveValue('Éléphant');
  const download = page.waitForEvent('download');
  await page.keyboard.press('Meta+s');
  const file = await download;
  const form = (await PDFDocument.load(readFileSync((await file.path())!))).getForm();
  expect(form.getTextField('nom').getText()).toBe('Éléphant');
  expect(form.getTextField('prenom').getText()).toBe('Léa');
  expect(form.getCheckBox('accord').isChecked()).toBe(true);
});

test('⌘S enregistre aussi la saisie qu’on n’a pas validée', async ({ page }) => {
  await field(page, 'nom').fill('Direct');
  const download = page.waitForEvent('download');
  await page.keyboard.press('Meta+s');
  const file = await download;
  expect((await PDFDocument.load(readFileSync((await file.path())!))).getForm().getTextField('nom').getText()).toBe('Direct');
});

test('une autre opération (pivoter) garde la saisie', async ({ page }) => {
  await field(page, 'nom').fill('Gardé');
  await page.locator('.left-panel .thumb').first().click();
  await page.click('#btn-rot-right');
  await expect.poll(() => page.evaluate(() => (window as unknown as { cigale: { app: { sessions: { view: { pdf: { getPage(n: number): Promise<{ rotate: number }> } } }[] } } }).cigale.app.sessions[0].view.pdf.getPage(1).then((p) => p.rotate))).toBe(90);
  await expect(field(page, 'nom')).toHaveValue('Gardé');
});

test('liste déroulante et boutons radio', async ({ page }) => {
  await field(page, 'ville').selectOption('Paris');
  await page.locator('.doc-view:not([hidden]) .annotationLayer [name="civilite"]').nth(1).check();
  await page.click('#form-commit');
  await expect(field(page, 'ville')).toHaveValue('Paris');
  const download = page.waitForEvent('download');
  await page.keyboard.press('Meta+s');
  const form = (await PDFDocument.load(readFileSync((await (await download).path())!))).getForm();
  expect(form.getDropdown('ville').getSelected()).toEqual(['Paris']);
  expect(form.getRadioGroup('civilite').getSelected()).toBe('monsieur');
});

test('fermer avec une saisie non enregistrée : la question est posée', async ({ page }) => {
  await field(page, 'nom').fill('X');
  await page.locator('.tab.doc-tab .tab-close').click();
  await expect(page.locator('#dialog-unsaved')).toBeVisible();
});
