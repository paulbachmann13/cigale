import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string };
import { fixture, gotoHome, openPdf, waitFirstPage, withoutFilePickers } from './helpers';

test('accueil : version, boutons et aucune requête externe', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (!['localhost', '127.0.0.1'].includes(u.hostname) && u.protocol.startsWith('http')) external.push(r.url());
  });
  await gotoHome(page);
  await expect(page.locator('#app-version')).toContainText(`Version ${version}`);
  await expect(page.locator('#home-open')).toBeVisible();
  await expect(page.locator('#home-combine')).toBeEnabled();
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

test('accueil : un clic sur « Version » ouvre les Nouveautés', async ({ page }) => {
  await gotoHome(page);
  await page.click('#app-version');
  await expect(page.locator('#dialog-news')).toBeVisible();
  await expect(page.locator('#dialog-news')).toContainText(version);
  await expect(page.locator('#news-check-update')).toHaveCount(0); // seulement dans l'application Mac
});

test('accueil : « Tous les outils » — on choisit un PDF, puis l’outil s’ouvre dessus', async ({ page }) => {
  await withoutFilePickers(page);
  await gotoHome(page);
  const ids = ['split', 'crop', 'watermark', 'headerfooter', 'protect', 'unprotect', 'redact', 'ocr', 'exportimages', 'exporttext', 'compare', 'region'];
  for (const id of ids) await expect(page.locator(`#home-tool-${id}`)).toBeVisible();
  const chooser = page.waitForEvent('filechooser');
  await page.click('#home-tool-crop');
  await (await chooser).setFiles(fixture('simple-3p.pdf'));
  await waitFirstPage(page);
  await expect(page.locator('#dialog-crop')).toBeVisible();
});

test('accueil : avec un document déjà ouvert, la tuile d’un outil l’utilise sans redemander de fichier', async ({ page }) => {
  await withoutFilePickers(page);
  await gotoHome(page);
  await openPdf(page, 'simple-3p.pdf');
  await waitFirstPage(page);
  await page.click('#tab-home'); // retour à l'accueil, le document reste ouvert
  await expect(page.locator('#home-tool-crop')).toBeVisible();
  let chooser = false;
  page.on('filechooser', () => (chooser = true));
  await page.click('#home-tool-crop');
  await expect(page.locator('#dialog-crop')).toBeVisible();
  expect(chooser).toBe(false);
  expect(await page.evaluate(() => (window as unknown as { cigale: { app: { sessions: unknown[] } } }).cigale.app.sessions.length)).toBe(1);
});
