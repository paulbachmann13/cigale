import { type Page, expect, test } from '@playwright/test';
import { PDFDocument } from '@cantoo/pdf-lib';
import { readFileSync } from 'node:fs';
import { everything } from '../unit/helpers';
import { docTitles, gotoHome, isDirty, openPdf, waitFirstPage, withoutFilePickers } from './helpers';

test.beforeEach(async ({ page }) => {
  await withoutFilePickers(page);
  await gotoHome(page);
});

const open = async (page: Page, name: string) => {
  await openPdf(page, name);
  await waitFirstPage(page);
};
const tool = async (page: Page, id: string) => {
  await page.click('#btn-tools');
  await page.click(`[data-id="${id}"]`);
};

interface Item { str: string; x: number; y: number; upright: boolean; width: number; vw: number; vh: number }
/** Éléments de texte d'une page, avec leur position à l'ÉCRAN (viewport de pdf.js, rotation de la page comprise). */
const textItems = (page: Page, n: number): Promise<Item[]> =>
  page.evaluate(async (n) => {
    const pdf = (window as unknown as { cigale: { app: { sessions: { view: { pdf: { getPage(n: number): Promise<any> } } }[] } } }).cigale.app.sessions.at(-1)!.view.pdf;
    const p = await pdf.getPage(n);
    const vp = p.getViewport({ scale: 1 });
    const tc = await p.getTextContent();
    const m = vp.transform;
    return tc.items.map((it: any) => {
      const t = it.transform;
      const r = [m[0] * t[0] + m[2] * t[1], m[1] * t[0] + m[3] * t[1], m[0] * t[2] + m[2] * t[3], m[1] * t[2] + m[3] * t[3], m[0] * t[4] + m[2] * t[5] + m[4], m[1] * t[4] + m[3] * t[5] + m[5]];
      return { str: it.str, x: r[4], y: r[5], upright: Math.abs(r[1]) < 0.01 && r[0] > 0, width: it.width, vw: vp.width, vh: vp.height };
    });
  }, n);

test('filigrane : texte au centre de la page, lisible, visible dans le rendu', async ({ page }) => {
  await open(page, 'simple-3p.pdf');
  await tool(page, 'tool-watermark');
  await page.selectOption('#wm-angle', '0');
  await page.click('#tool-apply');
  await expect.poll(async () => (await textItems(page, 1)).some((i) => i.str === 'CONFIDENTIEL')).toBe(true);
  const w = (await textItems(page, 2)).find((i) => i.str === 'CONFIDENTIEL')!;
  expect(w.upright).toBe(true);
  expect(Math.abs(w.x + w.width / 2 - w.vw / 2)).toBeLessThan(w.vw * 0.05); // centré horizontalement
  expect(Math.abs(w.y - w.vh / 2)).toBeLessThan(w.vh * 0.06); // et verticalement (ligne de base proche du milieu)
  expect(await isDirty(page)).toBe(true);
});

test('filigrane sur une page tournée : droit et centré à l’écran', async ({ page }) => {
  await open(page, 'tailles-mixtes.pdf');
  await tool(page, 'tool-watermark');
  await page.selectOption('#wm-angle', '0');
  await page.check('#scope-range');
  await page.fill('#scope-range-text', '4');
  await page.click('#tool-apply');
  await expect.poll(async () => (await textItems(page, 4)).some((i) => i.str === 'CONFIDENTIEL')).toBe(true);
  const w = (await textItems(page, 4)).find((i) => i.str === 'CONFIDENTIEL')!;
  expect(w.upright, 'texte droit à l’écran').toBe(true);
  expect(Math.abs(w.x + w.width / 2 - w.vw / 2)).toBeLessThan(w.vw * 0.06);
  expect(Math.abs(w.y - w.vh / 2)).toBeLessThan(w.vh * 0.08);
  expect((await textItems(page, 1)).some((i) => i.str === 'CONFIDENTIEL')).toBe(false); // seulement la page 4
});

test('numérotation : « Page 2 sur 3 » en bas de chaque page, en-tête avec le titre', async ({ page }) => {
  await open(page, 'simple-3p.pdf');
  await tool(page, 'tool-headerfooter');
  await page.fill('#hf-header-right', '{title}');
  await page.click('#tool-apply');
  await expect.poll(async () => (await textItems(page, 2)).some((i) => i.str === 'Page 2 sur 3')).toBe(true);
  for (const n of [1, 3]) expect((await textItems(page, n)).some((i) => i.str === `Page ${n} sur 3`)).toBe(true);
  const footer = (await textItems(page, 2)).find((i) => i.str === 'Page 2 sur 3')!;
  expect(footer.upright).toBe(true);
  expect(footer.y).toBeGreaterThan(footer.vh - 60); // en bas
  expect((await textItems(page, 1)).some((i) => i.str === 'Document simple')).toBe(true); // {title}
});

test('numérotation sur une page tournée : en bas et droite à l’écran', async ({ page }) => {
  await open(page, 'tailles-mixtes.pdf');
  await tool(page, 'tool-headerfooter');
  await page.click('#tool-apply');
  await expect.poll(async () => (await textItems(page, 4)).some((i) => i.str === 'Page 4 sur 4')).toBe(true);
  const f = (await textItems(page, 4)).find((i) => i.str === 'Page 4 sur 4')!;
  expect(f.upright).toBe(true);
  expect(f.y).toBeGreaterThan(f.vh - 60);
  expect(Math.abs(f.x + f.width / 2 - f.vw / 2)).toBeLessThan(f.vw * 0.06);
});

test('recadrer : la zone visible diminue des marges demandées', async ({ page }) => {
  await open(page, 'simple-3p.pdf');
  const before = await page.evaluate(async () => (await (window as any).cigale.app.sessions[0].view.pdf.getPage(1)).view as number[]);
  await tool(page, 'tool-crop');
  await page.fill('#crop-top', '20');
  await page.fill('#crop-bottom', '20');
  await page.fill('#crop-left', '10');
  await page.fill('#crop-right', '10');
  await page.click('#tool-apply');
  await expect.poll(async () => page.evaluate(async () => Math.round((await (window as any).cigale.app.sessions[0].view.pdf.getPage(1)).view[2] as number))).toBeLessThan(Math.round(before[2]));
  const after = await page.evaluate(async () => (await (window as any).cigale.app.sessions[0].view.pdf.getPage(2)).view as number[]);
  const mm = 72 / 25.4;
  expect(after[2] - after[0]).toBeCloseTo(before[2] - before[0] - 20 * mm, 0);
  expect(after[3] - after[1]).toBeCloseTo(before[3] - before[1] - 40 * mm, 0);
});

test('plage invalide dans un outil : message, rien n’est fait', async ({ page }) => {
  await open(page, 'simple-3p.pdf');
  await tool(page, 'tool-watermark');
  await page.check('#scope-range');
  await page.fill('#scope-range-text', '2-9');
  await page.click('#tool-apply');
  await expect(page.locator('#wm-error')).toContainText('2-9');
  expect(await isDirty(page)).toBe(false);
});

test('les outils de page sont annulables', async ({ page }) => {
  await open(page, 'simple-3p.pdf');
  await tool(page, 'tool-headerfooter');
  await page.click('#tool-apply');
  await expect.poll(async () => (await textItems(page, 1)).some((i) => i.str === 'Page 1 sur 3')).toBe(true);
  await page.keyboard.press('Meta+z');
  await expect.poll(async () => (await textItems(page, 1)).some((i) => i.str === 'Page 1 sur 3')).toBe(false);
});

test('caviarder : le texte disparaît du fichier, le reste est intact', async ({ page }) => {
  await open(page, 'simple-3p.pdf');
  await page.waitForSelector('.textLayer span');
  const span = page.locator('.doc-view:not([hidden]) .page[data-page-number="1"] .textLayer span').nth(2); // « Le mot unique … marmotte1. »
  const bb = (await span.boundingBox())!;
  await tool(page, 'tool-redact');
  await page.mouse.move(bb.x - 5, bb.y - 3);
  await page.mouse.down();
  await page.mouse.move(bb.x + bb.width + 5, bb.y + bb.height + 3, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('#redact-apply')).toBeVisible();
  await page.click('#redact-apply');
  await expect(page.locator('#dialog-redact')).toContainText('1 zone');
  await page.click('#redact-go');
  // la page 1 est devenue une image : plus aucun texte ; les pages 2 et 3 gardent le leur
  await expect.poll(async () => (await docTitles(page)).map((s) => s.slice(0, 6))).toEqual(['', 'Page 2', 'Page 3']);
  expect(await page.evaluate(async () => ((await (await (window as any).cigale.app.sessions[0].view.pdf.getPage(1)).getTextContent()).items as unknown[]).length)).toBe(0);
  // le rendu contient du noir à l'endroit caviardé
  await expect(page.locator('.doc-view:not([hidden]) .page[data-page-number="1"][data-loaded="true"]')).toHaveCount(1);
  await page.waitForTimeout(400);
  const pb = (await page.locator('.doc-view:not([hidden]) .page[data-page-number="1"]').boundingBox())!;
  const black = await page.evaluate(
    ({ x, y, w, h }) => {
      const c = document.querySelector('.doc-view:not([hidden]) .page[data-page-number="1"] canvas') as HTMLCanvasElement;
      const k = c.width / c.getBoundingClientRect().width;
      const d = c.getContext('2d')!.getImageData(Math.round(x * k), Math.round(y * k), Math.round(w * k), Math.round(h * k)).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] < 40 && d[i + 1] < 40 && d[i + 2] < 40) n++;
      return n;
    },
    { x: bb.x - pb.x - 9, y: bb.y - pb.y - 9, w: bb.width, h: bb.height },
  );
  expect(black).toBeGreaterThan(2000);
  // le fichier enregistré ne contient plus le texte caviardé, nulle part (même compressé)
  const download = page.waitForEvent('download');
  await page.keyboard.press('Meta+s');
  const bytes = readFileSync((await (await download).path())!);
  const all = everything(new Uint8Array(bytes));
  expect(all).not.toContain('marmotte1');
  expect(all).toContain('marmotte2'); // une autre page garde son texte
  expect((await PDFDocument.load(bytes)).getPageCount()).toBe(3);
});

test('caviarder : annuler redonne le texte', async ({ page }) => {
  await open(page, 'simple-3p.pdf');
  await page.waitForSelector('.textLayer span');
  const bb = (await page.locator('.doc-view:not([hidden]) .page[data-page-number="1"] .textLayer span').first().boundingBox())!;
  await tool(page, 'tool-redact');
  await page.mouse.move(bb.x, bb.y);
  await page.mouse.down();
  await page.mouse.move(bb.x + 200, bb.y + bb.height, { steps: 5 });
  await page.mouse.up();
  await page.click('#redact-apply');
  await page.uncheck('#redact-history'); // garder l'historique pour pouvoir annuler
  await page.click('#redact-go');
  await expect.poll(async () => (await docTitles(page))[0]).toBe('');
  await page.keyboard.press('Meta+z');
  await expect.poll(async () => (await docTitles(page))[0].slice(0, 6)).toBe('Page 1');
});

test('recadrer une page tournée : le haut à l’écran est le bord gauche de la page non tournée', async ({ page }) => {
  await open(page, 'tailles-mixtes.pdf');
  const before = await page.evaluate(async () => (await (window as any).cigale.app.sessions[0].view.pdf.getPage(4)).view as number[]);
  await tool(page, 'tool-crop');
  await page.fill('#crop-top', '20');
  await page.fill('#crop-bottom', '0');
  await page.fill('#crop-left', '0');
  await page.fill('#crop-right', '0');
  await page.check('#scope-range');
  await page.fill('#scope-range-text', '4');
  await page.click('#tool-apply');
  await expect.poll(async () => page.evaluate(async () => Math.round((await (window as any).cigale.app.sessions[0].view.pdf.getPage(4)).view[0] as number))).toBeGreaterThan(Math.round(before[0]) + 40);
  const after = await page.evaluate(async () => (await (window as any).cigale.app.sessions[0].view.pdf.getPage(4)).view as number[]);
  expect(after[0] - before[0]).toBeCloseTo(20 * (72 / 25.4), 0); // bord gauche (non tourné) = haut (affiché)
  expect(after[1]).toBeCloseTo(before[1], 0);
});

test('caviarder : par défaut l’historique « Annuler » est effacé', async ({ page }) => {
  await open(page, 'simple-3p.pdf');
  await page.waitForSelector('.textLayer span');
  const bb = (await page.locator('.doc-view:not([hidden]) .page[data-page-number="1"] .textLayer span').first().boundingBox())!;
  await tool(page, 'tool-redact');
  await page.mouse.move(bb.x, bb.y);
  await page.mouse.down();
  await page.mouse.move(bb.x + 200, bb.y + bb.height, { steps: 5 });
  await page.mouse.up();
  await page.click('#redact-apply');
  await expect(page.locator('#redact-history')).toBeChecked();
  await expect(page.locator('#redact-attachments')).toBeChecked();
  await page.click('#redact-go');
  await expect.poll(async () => (await docTitles(page))[0]).toBe('');
  await expect(page.locator('#btn-undo')).toBeDisabled(); // l'original n'est plus récupérable
  expect(await isDirty(page)).toBe(true);
});

test('caviarder sur une page tournée : le noir est à l’endroit marqué', async ({ page }) => {
  await open(page, 'tailles-mixtes.pdf');
  await page.locator('.left-panel .thumb[data-page="4"]').click();
  const pageEl = page.locator('.doc-view:not([hidden]) .page[data-page-number="4"]');
  await expect(pageEl.locator('canvas')).toBeVisible();
  await page.waitForTimeout(800);
  // zone marquée : un rectangle dans la partie de la page visible à l'écran
  const view = (await page.locator('.doc-view:not([hidden]) .viewer-container').boundingBox())!;
  const pb = (await pageEl.boundingBox())!;
  const x1 = Math.max(pb.x, view.x) + 80;
  const y1 = Math.max(pb.y, view.y) + 60;
  const w = 140;
  const h = 90;
  await tool(page, 'tool-redact');
  await page.mouse.move(x1, y1);
  await page.mouse.down();
  await page.mouse.move(x1 + w, y1 + h, { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => (window as any).cigale.app.sessions[0].annots.length)).toBe(1);
  await page.click('#redact-apply');
  await page.click('#redact-go');
  await expect.poll(async () => (await docTitles(page))[3]).toBe('');
  await expect(pageEl.locator('canvas')).toBeVisible();
  await expect(page.locator('.doc-view:not([hidden]) .page[data-page-number="4"][data-loaded="true"]')).toHaveCount(1);
  await page.waitForTimeout(600);
  const pb2 = (await pageEl.boundingBox())!;
  const black = await page.evaluate(
    ({ x, y, w, h }) => {
      const c = document.querySelector('.doc-view:not([hidden]) .page[data-page-number="4"] canvas') as HTMLCanvasElement;
      const k = c.width / c.getBoundingClientRect().width;
      const d = c.getContext('2d')!.getImageData(Math.round(x * k), Math.round(y * k), Math.round(w * k), Math.round(h * k)).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] < 40 && d[i + 1] < 40 && d[i + 2] < 40) n++;
      return { n, total: d.length / 4 };
    },
    { x: x1 - pb2.x - 9 + 8, y: y1 - pb2.y - 9 + 8, w: w - 16, h: h - 16 }, // l'intérieur du rectangle (sans les bords)
  );
  expect(black.n).toBeGreaterThan(black.total * 0.9); // le rectangle marqué est noir, à la bonne place malgré la rotation de la page
});

test('exporter les pages en images : archive .zip de PNG', async ({ page }) => {
  await open(page, 'simple-3p.pdf');
  await tool(page, 'tool-export-images');
  await page.selectOption('#img-dpi', '72');
  await page.check('#scope-range');
  await page.fill('#scope-range-text', '1-2');
  const download = page.waitForEvent('download');
  await page.click('#tool-apply');
  const file = await download;
  const { unzipSync } = await import('fflate');
  const files = unzipSync(new Uint8Array(readFileSync((await file.path())!)));
  expect(Object.keys(files).sort()).toEqual(['simple-3p - page 1.png', 'simple-3p - page 2.png']);
  for (const bytes of Object.values(files)) {
    expect([...bytes.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]); // en-tête PNG
    expect(bytes.length).toBeGreaterThan(2000);
  }
});
