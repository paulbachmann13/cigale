import { type Page, expect, test } from '@playwright/test';
import { PDFDocument } from '@cantoo/pdf-lib';
import { readFileSync } from 'node:fs';
import { docRotations, fixture, gotoHome, isDirty, waitFirstPage } from './helpers';

test.skip(({ browserName }) => browserName !== 'chromium', 'enregistrement sur place : Chrome seulement (Safari télécharge)');

/** Enregistrer, fermer, rouvrir le fichier du disque (OPFS = vrai FileSystemFileHandle) : rien ne doit avoir été oublié. */
async function putAndOpen(page: Page, name: string, bytes?: number[]) {
  await page.evaluate(
    async ({ name, bytes }) => {
      const dir = await navigator.storage.getDirectory();
      const handle = await dir.getFileHandle(name, { create: true });
      if (bytes) {
        const w = await handle.createWritable();
        await w.write(new Uint8Array(bytes));
        await w.close();
      }
      const app = (window as unknown as { cigale: { app: { openBytes(n: string, b: Uint8Array, o: object): Promise<boolean> } } }).cigale.app;
      await app.openBytes(name, new Uint8Array(await (await handle.getFile()).arrayBuffer()), { handle });
    },
    { name, bytes },
  );
}
const readOpfs = (page: Page, name: string) =>
  page.evaluate(async (name) => Array.from(new Uint8Array(await (await (await (await navigator.storage.getDirectory()).getFileHandle(name)).getFile()).arrayBuffer())), name);
const state = (page: Page) =>
  page.evaluate(() => {
    const s = (window as unknown as { cigale: { app: { sessions: { history: { dirty: boolean }; formModified: boolean }[] } } }).cigale.app.sessions.at(-1)!;
    return { dirty: s.history.dirty, formModified: s.formModified };
  });
const closeActive = async (page: Page) => {
  // un message « Enregistrer ? » ici voudrait dire que Cigale croit à tort que le document est modifié
  expect(await state(page), 'avant de fermer : rien à enregistrer').toEqual({ dirty: false, formModified: false });
  await page.evaluate(async () => {
    const app = (window as unknown as { cigale: { app: { sessions: { id: number }[]; close(id: number): Promise<void> } } }).cigale.app;
    await app.close(app.sessions.at(-1)!.id);
  });
};
const sessionCount = (page: Page) => page.evaluate(() => (window as unknown as { cigale: { app: { sessions: unknown[] } } }).cigale.app.sessions.length);
const field = (page: Page, name: string) => page.locator(`.doc-view:not([hidden]) .annotationLayer [name="${name}"]`).first();

test('formulaire : saisie → ⌘S (sans valider) → fermer → rouvrir : les valeurs sont là, puis une 2ᵉ modification', async ({ page }) => {
  test.setTimeout(90_000);
  await gotoHome(page);
  await putAndOpen(page, 'dossier.pdf', [...readFileSync(fixture('formulaire.pdf'))]);
  await waitFirstPage(page);
  await page.waitForSelector('.annotationLayer input');
  await field(page, 'nom').fill('Éléphant');
  await field(page, 'prenom').fill('Léa');
  await field(page, 'accord').check();
  await page.keyboard.press('Meta+s'); // sans « Valider la saisie » : l'enregistrement doit prendre la saisie en cours
  await expect(page.locator('#toast')).toContainText('enregistré');
  expect(await isDirty(page)).toBe(false);
  const form1 = (await PDFDocument.load(Uint8Array.from(await readOpfs(page, 'dossier.pdf')))).getForm();
  expect(form1.getTextField('nom').getText()).toBe('Éléphant');
  expect(form1.getCheckBox('accord').isChecked()).toBe(true);

  // fermer, rouvrir le fichier du disque
  await closeActive(page);
  await putAndOpen(page, 'dossier.pdf');
  await page.waitForSelector('.annotationLayer input');
  await expect(field(page, 'nom')).toHaveValue('Éléphant');
  await expect(field(page, 'prenom')).toHaveValue('Léa');
  await expect(field(page, 'accord')).toBeChecked();
  expect(await isDirty(page)).toBe(false);

  // 2ᵉ modification : pivoter, puis enregistrer, puis rouvrir de nouveau
  await page.locator('.left-panel .thumb[data-page="1"]').click();
  await page.click('#btn-rot-right');
  await expect.poll(() => docRotations(page)).toEqual([90]);
  await expect.poll(() => isDirty(page)).toBe(true); // la rotation est comptée
  await page.keyboard.press('Meta+s');
  await expect.poll(() => isDirty(page)).toBe(false);
  await closeActive(page);
  await putAndOpen(page, 'dossier.pdf');
  await waitFirstPage(page);
  await expect.poll(() => docRotations(page)).toEqual([90]);
  await page.waitForSelector('.annotationLayer input');
  await expect(field(page, 'nom')).toHaveValue('Éléphant');
  const doc = await PDFDocument.load(Uint8Array.from(await readOpfs(page, 'dossier.pdf')));
  expect(doc.getForm().getTextField('prenom').getText()).toBe('Léa');
  expect(doc.getPage(0).getRotation().angle).toBe(90);
  expect(await sessionCount(page)).toBe(1);
});

test('enregistrer deux fois de suite, puis annuler, puis ré-enregistrer : toujours cohérent', async ({ page }) => {
  await gotoHome(page);
  await putAndOpen(page, 'cycle.pdf', [...readFileSync(fixture('simple-3p.pdf'))]);
  await expect(page.locator('.left-panel .thumb')).toHaveCount(3);
  await page.locator('.left-panel .thumb[data-page="1"]').click();
  await page.click('#btn-rot-right');
  await expect.poll(() => isDirty(page)).toBe(true); // la rotation est appliquée
  await page.keyboard.press('Meta+s');
  await expect.poll(() => isDirty(page)).toBe(false);
  const first = await readOpfs(page, 'cycle.pdf');
  await page.keyboard.press('Meta+s'); // rien n'a changé : le fichier reste identique, aucune erreur
  await page.waitForTimeout(500);
  const second = await readOpfs(page, 'cycle.pdf');
  expect(second.length, 'taille après le 2e enregistrement').toBe(first.length);
  expect(second).toEqual(first);
  await page.click('#btn-undo');
  await expect.poll(() => isDirty(page)).toBe(true);
  await page.keyboard.press('Meta+s');
  await expect.poll(() => isDirty(page)).toBe(false); // attendre la fin de l'écriture (le message précédent est encore affiché)
  const doc = await PDFDocument.load(Uint8Array.from(await readOpfs(page, 'cycle.pdf')));
  expect(doc.getPageCount()).toBe(3);
  expect(doc.getPage(0).getRotation().angle).toBe(0);
  expect(await isDirty(page)).toBe(false);
});
