import { type Page, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

export const fixture = (name: string) => fileURLToPath(new URL(`../fixtures/out/${name}`, import.meta.url));

export async function gotoHome(page: Page) {
  await page.goto('./');
  await expect(page.locator('#home')).toBeVisible();
}

/** Ouvre un PDF par le champ de fichier (le même que le sélecteur de l'application). */
export async function openPdf(page: Page, name: string) {
  await page.locator('#file-input').setInputFiles(fixture(name));
}

export async function waitFirstPage(page: Page) {
  await expect(page.locator('.doc-view:not([hidden]) .page canvas').first()).toBeVisible();
}
