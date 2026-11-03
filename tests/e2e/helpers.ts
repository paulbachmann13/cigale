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

/** Navigateur « sans File System Access » (Safari, Firefox) : l'appli utilise le champ de fichier et le téléchargement. */
export async function withoutFilePickers(page: Page) {
  await page.addInitScript(() => {
    delete (window as unknown as Record<string, unknown>).showOpenFilePicker;
    delete (window as unknown as Record<string, unknown>).showSaveFilePicker;
  });
}

interface Cig {
  cigale: { app: { sessions: { view: { pdf: { numPages: number; getPage(n: number): Promise<{ rotate: number; view: number[]; getTextContent(): Promise<{ items: { str: string }[] }> }> } }; history: { dirty: boolean; current: Uint8Array; canUndo: boolean }; selection: number[]; name: string }[] } };
}

/** Texte (première ligne) de chaque page du document actif, relu par pdf.js dans l'appli. */
export async function docTitles(page: Page, index = 0): Promise<string[]> {
  return page.evaluate(async (i) => {
    const s = (window as unknown as Cig).cigale.app.sessions[i];
    const out: string[] = [];
    for (let n = 1; n <= s.view.pdf.numPages; n++) {
      const p = await s.view.pdf.getPage(n);
      const tc = await p.getTextContent();
      out.push(tc.items[0]?.str ?? '');
    }
    return out;
  }, index);
}

export async function docRotations(page: Page, index = 0): Promise<number[]> {
  return page.evaluate(async (i) => {
    const s = (window as unknown as Cig).cigale.app.sessions[i];
    const out: number[] = [];
    for (let n = 1; n <= s.view.pdf.numPages; n++) out.push((await s.view.pdf.getPage(n)).rotate);
    return out;
  }, index);
}

export const isDirty = (page: Page, index = 0) => page.evaluate((i) => (window as unknown as Cig).cigale.app.sessions[i].history.dirty, index);

/** Attend que la liste de miniatures du panneau soit passée à `n` pages (après une opération). */
export async function expectPages(page: Page, n: number) {
  await expect(page.locator('.left-panel .thumb')).toHaveCount(n);
  await expect(page.locator('#page-count')).toContainText(String(n));
}
