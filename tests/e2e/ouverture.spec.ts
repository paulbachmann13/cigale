import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string };
import { gotoHome, openPdf, waitFirstPage } from './helpers';

test.beforeEach(async ({ page }) => {
  await gotoHome(page);
});

test('PDF chiffré : demande le mot de passe, refuse un mauvais, accepte le bon', async ({ page }) => {
  await openPdf(page, 'chiffre.pdf');
  await expect(page.locator('#dialog-password')).toBeVisible();
  await page.fill('#password-input', 'faux');
  await page.click('#password-ok');
  await expect(page.locator('#dialog-password .dialog-error')).toHaveText(/incorrect/);
  await page.fill('#password-input', 'secret');
  await page.click('#password-ok');
  await waitFirstPage(page);
  await page.keyboard.press('Control+f');
  await page.fill('#find-input', 'sphinx');
  await expect(page.locator('#find-count')).toHaveText('1 sur 1');
});

test('PDF chiffré : annuler ne laisse rien d’ouvert, sans erreur silencieuse', async ({ page }) => {
  await openPdf(page, 'chiffre.pdf');
  await page.click('#password-cancel');
  await expect(page.locator('#toast')).toContainText('annulée');
  await expect(page.locator('.tab.doc-tab')).toHaveCount(0);
  await expect(page.locator('#loading')).toBeHidden();
});

test('fichiers invalides : message clair', async ({ page }) => {
  await openPdf(page, 'pas-un-pdf.pdf');
  await expect(page.locator('#dialog-message')).toContainText('n’est pas un fichier PDF');
  await page.click('#dialog-message button');
  await openPdf(page, 'vide.pdf');
  await expect(page.locator('#dialog-message')).toContainText('est vide');
  await page.click('#dialog-message button');
  await expect(page.locator('.tab.doc-tab')).toHaveCount(0);
});

test('PDF tronqué : s’ouvre (réparation de pdf.js) ou explique pourquoi pas', async ({ page }) => {
  await openPdf(page, 'tronque.pdf');
  await expect(page.locator('.doc-view .page canvas, #dialog-message').first()).toBeVisible();
});

test('scan en image seule : affichage net', async ({ page }) => {
  await openPdf(page, 'scan-image.pdf');
  await waitFirstPage(page);
  await expect(page.locator('#page-count')).toHaveText('sur 3');
  await page.selectOption('#zoom-select', '1');
  // le canevas de la page n'est pas vide (il contient autre chose que du blanc pur)
  await expect
    .poll(() =>
      page.locator('.page canvas').first().evaluate((c: HTMLCanvasElement) => {
        const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
        let dark = 0;
        for (let i = 0; i < d.length; i += 4) if (d[i] < 100) dark++;
        return dark;
      }),
    )
    .toBeGreaterThan(100);
});

test('récents : un fichier ouvert apparaît sur l’accueil', async ({ page }) => {
  await openPdf(page, 'simple-3p.pdf');
  await waitFirstPage(page);
  await page.click('#tab-home');
  await expect(page.locator('.recent', { hasText: 'simple-3p.pdf' })).toBeVisible();
  await page.click('#clear-recents');
  await expect(page.locator('#no-recents')).toBeVisible();
});

test('paramètres et nouveautés', async ({ page }) => {
  await page.click('#home-news');
  await expect(page.locator('#dialog-news')).toContainText(version);
  await page.click('#dialog-news button');
  await page.click('#home-settings');
  await page.selectOption('#setting-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});
