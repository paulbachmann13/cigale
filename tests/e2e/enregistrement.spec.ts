import { expect, test } from '@playwright/test';
import { PDFDocument } from '@cantoo/pdf-lib';
import { readFileSync } from 'node:fs';
import { docRotations, fixture, gotoHome, isDirty } from './helpers';

test.skip(({ browserName }) => browserName !== 'chromium', 'Safari n’a ni « createWritable » ni « Enregistrer sous » : il télécharge (testé dans pages.spec.ts)');

/**
 * Enregistrement « sur place » : on utilise le système de fichiers privé du navigateur (OPFS), qui fournit de vrais
 * FileSystemFileHandle avec createWritable : c'est exactement le chemin qu'emprunte Chrome pour un fichier du Mac.
 */
async function openFromOpfs(page: import('@playwright/test').Page, name: string, bytes: number[]) {
  await page.evaluate(
    async ({ name, bytes }) => {
      const dir = await navigator.storage.getDirectory();
      const handle = await dir.getFileHandle(name, { create: true });
      const w = await handle.createWritable();
      await w.write(new Uint8Array(bytes));
      await w.close();
      const app = (window as unknown as { cigale: { app: { openBytes(n: string, b: Uint8Array, o: object): Promise<boolean> } } }).cigale.app;
      await app.openBytes(name, new Uint8Array(await (await handle.getFile()).arrayBuffer()), { handle });
    },
    { name, bytes },
  );
}

async function readOpfs(page: import('@playwright/test').Page, name: string): Promise<number[]> {
  return page.evaluate(async (name) => {
    const dir = await navigator.storage.getDirectory();
    const f = await (await dir.getFileHandle(name)).getFile();
    return Array.from(new Uint8Array(await f.arrayBuffer()));
  }, name);
}

test('⌘S remplace le fichier, garde l’ancienne version et vérifie l’écriture', async ({ page }) => {
  await gotoHome(page);
  const original = [...readFileSync(fixture('simple-3p.pdf'))];
  await openFromOpfs(page, 'rapport.pdf', original);
  await expect(page.locator('.left-panel .thumb')).toHaveCount(3);
  await page.locator('.left-panel .thumb[data-page="2"]').click();
  await page.click('#btn-rot-right');
  await expect.poll(() => docRotations(page)).toEqual([0, 90, 0]);

  // avant l'enregistrement, le fichier d'origine n'a PAS bougé
  expect(await readOpfs(page, 'rapport.pdf')).toEqual(original);

  await page.keyboard.press('Meta+s');
  await expect(page.locator('#toast')).toContainText('enregistré');
  await expect(page.locator('#toast')).toContainText('ancienne version');
  expect(await isDirty(page)).toBe(false);
  await expect(page.locator('#status')).toContainText('Enregistré à');

  const saved = await PDFDocument.load(Uint8Array.from(await readOpfs(page, 'rapport.pdf')));
  expect(saved.getPageCount()).toBe(3);
  expect(saved.getPage(1).getRotation().angle).toBe(90);

  // l'ancienne version est dans « Versions précédentes » et identique à l'original
  await page.click('#file-menu');
  await page.click('[data-id="versions"]');
  await expect(page.locator('#versions-list li')).toHaveCount(1);
  const backup = await page.evaluate(async () => {
    const open = indexedDB.open('cigale');
    const db: IDBDatabase = await new Promise((res) => (open.onsuccess = () => res(open.result)));
    const index: { id: string }[] = await new Promise((res) => {
      const r = db.transaction('kv').objectStore('kv').get('backups-index');
      r.onsuccess = () => res(r.result);
    });
    const bytes: Uint8Array = await new Promise((res) => {
      const r = db.transaction('kv').objectStore('kv').get(`backup:${index[0].id}`);
      r.onsuccess = () => res(r.result);
    });
    return Array.from(bytes);
  });
  expect(backup).toEqual(original);
});

test('annuler après enregistrement : le document redevient « modifié »', async ({ page }) => {
  await gotoHome(page);
  await openFromOpfs(page, 'a.pdf', [...readFileSync(fixture('simple-3p.pdf'))]);
  await page.locator('.left-panel .thumb[data-page="1"]').click();
  await page.click('#btn-duplicate');
  await expect(page.locator('.left-panel .thumb')).toHaveCount(4);
  await page.keyboard.press('Meta+s');
  await expect(page.locator('#status')).toContainText('Enregistré');
  await page.click('#btn-undo');
  await expect(page.locator('.left-panel .thumb')).toHaveCount(3);
  expect(await isDirty(page)).toBe(true);
});

test('⌘⇧S propose « Enregistrer sous » et ne touche pas l’original', async ({ page }) => {
  await gotoHome(page);
  const original = [...readFileSync(fixture('simple-3p.pdf'))];
  await openFromOpfs(page, 'source.pdf', original);
  // On remplace le sélecteur « Enregistrer sous » par un fichier de l'espace privé (le vrai ouvre une fenêtre du système).
  await page.evaluate(() => {
    (window as unknown as { showSaveFilePicker: () => Promise<FileSystemFileHandle> }).showSaveFilePicker = async () => {
      const dir = await navigator.storage.getDirectory();
      return dir.getFileHandle('copie.pdf', { create: true });
    };
  });
  await page.locator('.left-panel .thumb[data-page="3"]').click();
  await page.click('#btn-delete');
  await expect(page.locator('.left-panel .thumb')).toHaveCount(2);
  await page.keyboard.press('Meta+Shift+s');
  await expect(page.locator('#toast')).toContainText('copie.pdf');
  expect(await readOpfs(page, 'source.pdf')).toEqual(original);
  expect((await PDFDocument.load(Uint8Array.from(await readOpfs(page, 'copie.pdf')))).getPageCount()).toBe(2);
  await expect(page.locator('.tab.doc-tab.active .tab-label')).toContainText('copie.pdf');
});

test('caviardage : enregistrer ne garde aucune copie de l’ancienne version (elle contiendrait le texte caviardé)', async ({ page }) => {
  await gotoHome(page);
  const original = [...readFileSync(fixture('simple-3p.pdf'))];
  await openFromOpfs(page, 'confidentiel.pdf', original);
  await page.waitForSelector('.textLayer span');
  const bb = (await page.locator('.doc-view:not([hidden]) .page[data-page-number="1"] .textLayer span').first().boundingBox())!;
  await page.click('#btn-tools');
  await page.click('[data-id="tool-redact"]');
  await page.mouse.move(bb.x, bb.y);
  await page.mouse.down();
  await page.mouse.move(bb.x + 300, bb.y + bb.height, { steps: 5 });
  await page.mouse.up();
  await page.click('#redact-apply');
  await page.click('#redact-go');
  await expect.poll(() => page.evaluate(async () => (await (await (window as any).cigale.app.sessions[0].view.pdf.getPage(1)).getTextContent()).items.length)).toBe(0);
  await page.keyboard.press('Meta+s');
  await expect(page.locator('#toast')).toContainText('enregistré');
  await expect(page.locator('#toast')).not.toContainText('ancienne version');
  // le fichier a bien été remplacé, et aucune version précédente n'est gardée dans Cigale
  expect(await readOpfs(page, 'confidentiel.pdf')).not.toEqual(original);
  await page.click('#file-menu');
  await page.click('[data-id="versions"]');
  await expect(page.locator('#versions-list li.empty')).toHaveCount(1);
});
