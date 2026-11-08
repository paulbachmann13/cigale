import { type Page, expect, test } from '@playwright/test';
import { docRotations, expectPages, gotoHome, openPdf, waitFirstPage, withoutFilePickers } from './helpers';

test.beforeEach(async ({ page }) => {
  await withoutFilePickers(page);
  await gotoHome(page);
});

/** Pixels non blancs de la page 1 (le papier dessine des lignes). */
const inkedPixels = (page: Page, n = 1) =>
  page.evaluate((n) => {
    const c = document.querySelector(`.doc-view:not([hidden]) .page[data-page-number="${n}"] canvas:not(.ink-canvas)`) as HTMLCanvasElement;
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let k = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] < 245 || d[i + 1] < 245 || d[i + 2] < 245) k++;
    return k;
  }, n);

test('nouveau carnet Seyès : 10 pages A4, le stylo est prêt, document non enregistré', async ({ page }) => {
  await page.click('#home-notebook');
  await expect(page.locator('#dialog-notebook')).toBeVisible();
  await page.click('#nb-paper-seyes');
  await page.fill('#nb-pages', '10');
  await page.click('#nb-create');
  await expect(page.locator('.left-panel .thumb')).toHaveCount(10);
  await page.waitForSelector('.doc-view:not([hidden]) .page[data-page-number="1"] canvas');
  await expect(page.locator('#tool-ink')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => inkedPixels(page)).toBeGreaterThan(5000);
  const dirty = await page.evaluate(() => (window as unknown as { cigale: { app: { sessions: { history: { dirty: boolean }; name: string }[] } } }).cigale.app.sessions[0]);
  expect(dirty.name).toBe('Carnet');
});

test('papier uni : la page est blanche ; nombre de pages invalide refusé', async ({ page }) => {
  await page.click('#home-notebook');
  await page.click('#nb-paper-blank');
  await page.fill('#nb-pages', '0');
  await page.click('#nb-create');
  await expect(page.locator('#nb-error')).toContainText('entre 1 et 500');
  await page.fill('#nb-pages', '2');
  await page.click('#nb-create');
  await expect(page.locator('.left-panel .thumb')).toHaveCount(2);
  await page.waitForSelector('.doc-view:not([hidden]) .page[data-page-number="1"] canvas');
  await expect.poll(() => inkedPixels(page)).toBeLessThan(50);
});

test('insérer 2 pages quadrillées après la page 1 d’un carnet', async ({ page }) => {
  await page.click('#home-notebook');
  await page.click('#nb-paper-blank');
  await page.fill('#nb-pages', '2');
  await page.click('#nb-create');
  await expect(page.locator('.left-panel .thumb')).toHaveCount(2);
  await page.locator('.left-panel .thumb[data-page="1"]').click();
  await page.click('#btn-insert');
  await page.click('[data-id="insert-pages"]');
  await expect(page.locator('#dialog-insert-paper')).toBeVisible();
  await page.click('#ip-paper-grid');
  await page.fill('#ip-count', '2');
  await page.click('#ip-insert');
  await expect(page.locator('.left-panel .thumb')).toHaveCount(4);
  await page.waitForSelector('.doc-view:not([hidden]) .page[data-page-number="2"] canvas');
  await expect.poll(() => inkedPixels(page, 2)).toBeGreaterThan(3000);
});

test('ajouter une image : choisie, posée d’un clic, sélectionnée, visible, et elle suit si on la déplace', async ({ page }) => {
  await page.click('#home-notebook');
  await page.click('#nb-paper-blank');
  await page.fill('#nb-pages', '1');
  await page.click('#nb-create');
  await page.waitForSelector('.doc-view:not([hidden]) .page[data-page-number="1"] canvas');
  const png = await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 160;
    c.height = 100;
    const g = c.getContext('2d')!;
    g.fillStyle = '#2060d0';
    g.fillRect(0, 0, 160, 100);
    const b = await new Promise<Blob>((r) => c.toBlob((x) => r(x!), 'image/png'));
    return Array.from(new Uint8Array(await b.arrayBuffer()));
  });
  const chooser = page.waitForEvent('filechooser');
  await page.click('#tool-image');
  (await chooser).setFiles({ name: 'schema.png', mimeType: 'image/png', buffer: Buffer.from(png) });
  await expect(page.locator('#toast')).toContainText('Cliquez sur la page');
  const box = (await page.locator('.doc-view:not([hidden]) .page[data-page-number="1"]').boundingBox())!;
  await page.mouse.click(box.x + 250, box.y + 300);
  const annots = () => page.evaluate(() => (window as unknown as { cigale: { app: { sessions: { annots: { kind: string; rect: number[] }[] }[] } } }).cigale.app.sessions[0].annots);
  await expect.poll(async () => (await annots()).map((a) => a.kind)).toEqual(['image']);
  await expect(page.locator('#tool-select')).toHaveAttribute('aria-pressed', 'true'); // on repasse à « Sélectionner »
  await expect(page.locator('.annot-hit.selected')).toHaveCount(1);
  // rendu : des pixels bleus là où l'image est posée
  await expect
    .poll(() =>
      page.evaluate(
        ({ x, y }) => {
          const c = document.querySelector('.doc-view:not([hidden]) .page[data-page-number="1"] canvas:not(.ink-canvas)') as HTMLCanvasElement;
          const k = c.width / c.getBoundingClientRect().width;
          const d = c.getContext('2d')!.getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data;
          return d[2] > 180 && d[0] < 90;
        },
        { x: 250, y: 300 },
      ),
    )
    .toBe(true);
});

test('nouveau carnet : 9 papiers avec aperçu (vignettes dessinées), couleur de papier, Cornell crème', async ({ page }) => {
  await page.click('#home-notebook');
  await expect(page.locator('.paper-card')).toHaveCount(9);
  // chaque vignette (sauf l'uni) montre des lignes ou des points
  for (const k of ['lined', 'grid', 'dots', 'seyes', 'cornell', 'music', 'mm', 'checklist']) {
    const drawn = await page.evaluate((k) => {
      const c = document.querySelector(`#nb-paper-${k} canvas`) as HTMLCanvasElement;
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] < 235 || d[i + 1] < 235 || d[i + 2] < 235) n++;
      return n;
    }, k);
    expect(drawn, `aperçu ${k}`).toBeGreaterThan(30);
  }
  // l'aperçu de l'uni reste blanc, et change de couleur avec le papier choisi
  const bg = () => page.evaluate(() => Array.from((document.querySelector('#nb-paper-blank canvas') as HTMLCanvasElement).getContext('2d')!.getImageData(2, 2, 1, 1).data));
  expect((await bg()).slice(0, 3)).toEqual([255, 255, 255]);
  await page.click('.paper-color[data-color="cream"]');
  expect((await bg())[2]).toBeLessThan(240);
  // l'orientation change la forme des vignettes
  const ratio = () => page.evaluate(() => { const c = document.querySelector('#nb-paper-grid canvas') as HTMLCanvasElement; return c.width / c.height; });
  const portrait = await ratio();
  await page.selectOption('#nb-orient', 'landscape');
  expect(await ratio()).toBeGreaterThan(portrait * 1.5);
  await page.selectOption('#nb-orient', 'portrait');
  await page.click('#nb-paper-cornell');
  await page.fill('#nb-pages', '2');
  await page.click('#nb-create');
  await expect(page.locator('.left-panel .thumb')).toHaveCount(2);
  await page.waitForSelector('.doc-view:not([hidden]) .page[data-page-number="1"] canvas');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const c = document.querySelector('.doc-view:not([hidden]) .page[data-page-number="1"] canvas:not(.ink-canvas)') as HTMLCanvasElement;
        const d = c.getContext('2d')!.getImageData(3, 3, 1, 1).data;
        return d[0] > 240 && d[2] < 238; // fond crème
      }),
    )
    .toBe(true);
});

test.describe('sur un PDF existant, sans rien sélectionner', () => {
  test.beforeEach(async ({ page }) => {
    await openPdf(page, 'simple-3p.pdf');
    await waitFirstPage(page);
  });

  test('pivoter marche sur la page affichée sans sélection', async ({ page }) => {
    await expect(page.locator('#btn-rot-right')).toBeEnabled();
    await page.click('#btn-rot-right');
    await expect.poll(() => docRotations(page)).toEqual([90, 0, 0]);
  });

  test('insérer 2 copies de la page 2 après la page 1', async ({ page }) => {
    await page.click('#btn-insert');
    await page.click('[data-id="insert-pages"]');
    await expect(page.locator('#dialog-insert-paper')).toBeVisible();
    await page.check('#ip-source-copy');
    await expect(page.locator('#ip-paper-box')).toBeHidden();
    await page.fill('#ip-copy-from', '2');
    await page.fill('#ip-count', '2');
    await expect(page.locator('#ip-where option').first()).toHaveText('Après la page 1');
    await page.click('#ip-insert');
    await expectPages(page, 5);
  });

  test('insérer une page à ligne tout au début, puis une page vierge à la fin', async ({ page }) => {
    await page.click('#btn-insert');
    await page.click('[data-id="insert-pages"]');
    await page.click('#ip-paper-lined');
    await page.selectOption('#ip-where', 'start');
    await page.click('#ip-insert');
    await expectPages(page, 4);
    await page.click('#btn-insert');
    await page.click('[data-id="insert-pages"]');
    await page.click('#ip-paper-blank');
    await page.selectOption('#ip-where', 'end');
    await page.click('#ip-insert');
    await expectPages(page, 5);
  });

  test('copie d’une page inexistante : message, rien n’est inséré', async ({ page }) => {
    await page.click('#btn-insert');
    await page.click('[data-id="insert-pages"]');
    await page.check('#ip-source-copy');
    await page.fill('#ip-copy-from', '9');
    await page.click('#ip-insert');
    await expect(page.locator('#ip-error')).toContainText('entre 1 et 3');
    await page.click('#ip-cancel');
    await expectPages(page, 3);
  });

  test('coller une image : posée au milieu de la page affichée, sélectionnée', async ({ page }) => {
    await page.evaluate(async () => {
      const c = document.createElement('canvas');
      c.width = 200;
      c.height = 120;
      const g = c.getContext('2d')!;
      g.fillStyle = '#d02060';
      g.fillRect(0, 0, 200, 120);
      const blob = await new Promise<Blob>((r) => c.toBlob((x) => r(x!), 'image/png'));
      const dt = new DataTransfer();
      dt.items.add(new File([blob], 'capture.png', { type: 'image/png' }));
      document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    });
    const annots = () => page.evaluate(() => (window as unknown as { cigale: { app: { sessions: { annots: { kind: string; page: number }[] }[] } } }).cigale.app.sessions[0].annots);
    await expect.poll(async () => (await annots()).map((a) => `${a.kind}:${a.page}`)).toEqual(['image:0']);
    await expect(page.locator('.annot-hit.selected')).toHaveCount(1);
  });

  test('coller une image très haute : elle reste dans la page (60 % de la hauteur au plus)', async ({ page }) => {
    await page.evaluate(async () => {
      const c = document.createElement('canvas');
      c.width = 300;
      c.height = 2400;
      c.getContext('2d')!.fillStyle = '#0a0';
      c.getContext('2d')!.fillRect(0, 0, 300, 2400);
      const blob = await new Promise<Blob>((r) => c.toBlob((x) => r(x!), 'image/png'));
      const dt = new DataTransfer();
      dt.items.add(new File([blob], 'haute.png', { type: 'image/png' }));
      document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    });
    const rect = () => page.evaluate(() => (window as unknown as { cigale: { app: { sessions: { annots: { rect: number[] }[] }[] } } }).cigale.app.sessions[0].annots[0]?.rect);
    await expect.poll(rect).toBeTruthy();
    const r = (await rect())!;
    expect(r[3] - r[1]).toBeLessThanOrEqual(842 * 0.61);
    expect(r[1]).toBeGreaterThan(0);
    expect(r[3]).toBeLessThan(842);
  });

  test('coller du texte dans une zone de saisie : le collage normal n’est pas intercepté', async ({ page }) => {
    await page.click('#btn-comment');
    await page.click('#tool-freetext');
    const pb = (await page.locator('.doc-view:not([hidden]) .page[data-page-number="1"]').boundingBox())!;
    await page.mouse.click(pb.x + 200, pb.y + 200);
    await expect(page.locator('.annot-pop textarea')).toBeVisible();
    const prevented = await page.evaluate(() => {
      const ta = document.querySelector('.annot-pop textarea') as HTMLTextAreaElement;
      const dt = new DataTransfer();
      dt.items.add(new File([new Blob(['x'])], 'a.png', { type: 'image/png' }));
      const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
      ta.dispatchEvent(ev);
      return ev.defaultPrevented;
    });
    expect(prevented).toBe(false);
  });
});
