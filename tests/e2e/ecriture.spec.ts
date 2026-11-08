import { type Page, expect, test } from '@playwright/test';
import { PDFArray, PDFDocument, PDFName } from '@cantoo/pdf-lib';
import { readFileSync } from 'node:fs';
import { gotoHome, openPdf, waitFirstPage, withoutFilePickers } from './helpers';

type A = { id: string; kind: string; pen?: string; opacity: number; width: number; color: number[]; strokes?: number[][][]; pressures?: number[][] };
type Cig = { cigale: { app: { sessions: { annots: A[]; ink: { hasPending: boolean; forPage(n: number): unknown[] }; history: { dirty: boolean } }[] } } };
const annots = (page: Page) => page.evaluate(() => (window as unknown as Cig).cigale.app.sessions[0].annots);
const pending = (page: Page) => page.evaluate(() => (window as unknown as Cig).cigale.app.sessions[0].ink.forPage(0).length);

test.skip(({ browserName }) => browserName !== 'chromium', 'tracé : Chromium (WebKit : mêmes événements, vérifiés à la main sur iPad)');

test.beforeEach(async ({ page }) => {
  await withoutFilePickers(page);
  await gotoHome(page);
  await openPdf(page, 'simple-3p.pdf');
  await waitFirstPage(page);
  await page.waitForSelector('.textLayer span');
  await page.click('#btn-comment');
});

const pageBox = async (page: Page) => (await page.locator('.doc-view:not([hidden]) .page[data-page-number="1"]').boundingBox())!;

/** Trait à la souris : une vague. */
async function wave(page: Page, x: number, y: number, len = 160) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 24; i++) await page.mouse.move(x + (i * len) / 24, y + Math.sin(i / 3) * 14);
  await page.mouse.up();
}

/** Trait au stylet (événements « pen » avec pression), envoyés au calque de la page. */
async function penStroke(page: Page, x: number, y: number, pressures: number[]) {
  await page.evaluate(
    ({ x, y, pressures }) => {
      const layer = document.querySelector('.doc-view:not([hidden]) .page[data-page-number="1"] .annot-layer') as HTMLElement;
      const mk = (type: string, i: number, p: number) =>
        new PointerEvent(type, { pointerId: 7, pointerType: 'pen', isPrimary: true, bubbles: true, cancelable: true, clientX: x + i * 6, clientY: y + Math.sin(i / 3) * 10, pressure: p, button: 0, buttons: type === 'pointerup' ? 0 : 1 });
      layer.dispatchEvent(mk('pointerdown', 0, pressures[0]));
      pressures.forEach((p, i) => i > 0 && layer.dispatchEvent(mk('pointermove', i, p)));
      layer.dispatchEvent(mk('pointerup', pressures.length - 1, pressures[pressures.length - 1]));
    },
    { x, y, pressures },
  );
}

test('stylo à la souris : le trait apparaît tout de suite, puis entre dans le PDF (une seule étape Annuler)', async ({ page }) => {
  const pb = await pageBox(page);
  await page.click('#tool-ink');
  await expect(page.locator('#annot-pen')).toBeVisible();
  await wave(page, pb.x + 100, pb.y + 300);
  await wave(page, pb.x + 100, pb.y + 340);
  expect(await pending(page)).toBe(2); // à l'écran, pas encore dans le fichier
  const inked = () =>
    page.evaluate(() => {
      const c = document.querySelector('.doc-view:not([hidden]) .page[data-page-number="1"] .ink-canvas.normal') as HTMLCanvasElement | null;
      if (!c) return 0;
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 100) n++;
      return n;
    });
  expect(await inked()).toBeGreaterThan(200);
  await expect.poll(async () => (await annots(page)).length, { timeout: 8000 }).toBe(2);
  const list = await annots(page);
  expect(list.every((a) => a.kind === 'ink' && a.pen === 'pen')).toBe(true);
  expect(await pending(page)).toBe(0);
  // les traits sont dans la page pdf.js (rendu du fichier) : pixels sombres près du trait
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const c = document.querySelector('.doc-view:not([hidden]) .page[data-page-number="1"] canvas:not(.ink-canvas)') as HTMLCanvasElement;
        const k = c.width / c.getBoundingClientRect().width;
        const d = c.getContext('2d')!.getImageData(Math.round(100 * k), Math.round(290 * k), Math.round(170 * k), Math.round(30 * k)).data;
        let n = 0;
        for (let i = 0; i < d.length; i += 4) if (d[i] < 90 && d[i + 1] < 90) n++;
        return n;
      }),
    )
    .toBeGreaterThan(100);
  // une seule étape pour les deux traits
  await page.keyboard.press('Meta+z');
  await expect.poll(async () => (await annots(page)).length).toBe(0);
});

test('Annuler défait les traits un par un tant qu’ils ne sont pas dans le PDF, Rétablir les rend', async ({ page }) => {
  const pb = await pageBox(page);
  await page.click('#tool-ink');
  await wave(page, pb.x + 100, pb.y + 300);
  await wave(page, pb.x + 100, pb.y + 340);
  await page.keyboard.press('Meta+z');
  await expect.poll(() => pending(page)).toBe(1);
  await page.keyboard.press('Meta+z');
  await expect.poll(() => pending(page)).toBe(0);
  await page.keyboard.press('Meta+Shift+z');
  await expect.poll(() => pending(page)).toBe(1);
  await expect.poll(async () => (await annots(page)).length, { timeout: 8000 }).toBe(1);
});

test('chaque stylo retrouve sa couleur et son épaisseur', async ({ page }) => {
  await page.click('#tool-ink');
  const color = () => page.evaluate(() => (window as unknown as { cigale: { app: { annotStyle: { color: number[]; width: number } } } }).cigale.app.annotStyle);
  expect((await color()).color[0]).toBeLessThan(0.2); // stylo : presque noir, pas rouge
  await page.selectOption('#annot-pen', 'highlighter');
  expect(await color()).toMatchObject({ width: 14 });
  await page.click('.swatch[data-color="Bleu"]');
  await page.selectOption('#annot-pen', 'pen');
  expect((await color()).color[0]).toBeLessThan(0.2);
  await page.selectOption('#annot-pen', 'highlighter');
  expect((await color()).color[2]).toBeGreaterThan(0.9); // le bleu choisi est retenu pour le surligneur
});

test('un trait lent (plus de 1,5 s) n’est pas coupé par l’envoi du précédent au document', async ({ page }) => {
  const pb = await pageBox(page);
  await page.click('#tool-ink');
  await wave(page, pb.x + 100, pb.y + 300);
  await page.mouse.move(pb.x + 100, pb.y + 400);
  await page.mouse.down();
  await page.mouse.move(pb.x + 140, pb.y + 410, { steps: 5 });
  await page.waitForTimeout(2200); // le délai d'envoi du 1er trait est passé : il doit attendre la fin de celui-ci
  await page.mouse.move(pb.x + 260, pb.y + 420, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await annots(page)).length, { timeout: 9000 }).toBe(2);
  const last = (await annots(page)).map((a) => a.strokes![0].length);
  expect(Math.max(...last)).toBeGreaterThan(10); // le trait lent est entier
});

test('Rétablir reste possible même si l’envoi différé passe entre-temps', async ({ page }) => {
  const pb = await pageBox(page);
  await page.click('#tool-ink');
  await wave(page, pb.x + 100, pb.y + 300);
  await wave(page, pb.x + 100, pb.y + 340);
  await page.keyboard.press('Meta+z');
  await expect.poll(() => pending(page)).toBe(1);
  await page.waitForTimeout(2200); // envoi du trait restant
  await expect.poll(async () => (await annots(page)).length, { timeout: 8000 }).toBe(1);
});

test('la gomme ne supprime rien si le geste est annulé par le système', async ({ page }) => {
  const pb = await pageBox(page);
  await page.click('#tool-ink');
  await wave(page, pb.x + 100, pb.y + 300);
  await page.click('#tool-eraser');
  await page.evaluate(
    ({ x, y }) => {
      const layer = document.querySelector('.doc-view:not([hidden]) .page[data-page-number="1"] .annot-layer') as HTMLElement;
      const mk = (type: string, dy: number) => new PointerEvent(type, { pointerId: 5, pointerType: 'pen', isPrimary: true, bubbles: true, cancelable: true, clientX: x, clientY: y + dy, pressure: 0.5, button: 0, buttons: 1 });
      layer.dispatchEvent(mk('pointerdown', -20));
      layer.dispatchEvent(mk('pointermove', 0));
      layer.dispatchEvent(mk('pointercancel', 0));
    },
    { x: pb.x + 160, y: pb.y + 300 },
  );
  expect(await pending(page)).toBe(1); // le trait est toujours là
  await expect.poll(async () => (await annots(page)).length, { timeout: 8000 }).toBe(1);
});

test('stylet : la pression est gardée dans le fichier ; la plume s’épaissit avec la pression', async ({ page }) => {
  const pb = await pageBox(page);
  await page.click('#tool-ink');
  await page.selectOption('#annot-pen', 'fountain');
  const ramp = Array.from({ length: 30 }, (_, i) => 0.1 + (i / 29) * 0.85);
  await penStroke(page, pb.x + 100, pb.y + 300, ramp);
  await expect.poll(async () => (await annots(page)).length, { timeout: 8000 }).toBe(1);
  const [a] = await annots(page);
  expect(a.pen).toBe('fountain');
  expect(a.pressures![0]).toHaveLength(a.strokes![0].length);
  expect(Math.max(...a.pressures![0])).toBeGreaterThan(0.8);
  expect(Math.min(...a.pressures![0])).toBeLessThan(0.2);
});

test('surligneur : translucide, large, par-dessus le texte', async ({ page }) => {
  const pb = await pageBox(page);
  await page.click('#tool-ink');
  await page.selectOption('#annot-pen', 'highlighter');
  await expect(page.locator('#annot-width option')).toHaveText(['8 pt', '14 pt', '20 pt', '28 pt']);
  await wave(page, pb.x + 100, pb.y + 200, 200);
  await expect.poll(async () => (await annots(page)).length, { timeout: 8000 }).toBe(1);
  const [a] = await annots(page);
  expect(a).toMatchObject({ pen: 'highlighter', opacity: 0.4, width: 14 });
  expect(a.color[0]).toBeGreaterThan(0.9); // jaune par défaut
});

test('gomme : efface le trait touché (en attente ou déjà enregistré), pas les autres', async ({ page }) => {
  const pb = await pageBox(page);
  await page.click('#tool-ink');
  await wave(page, pb.x + 100, pb.y + 300);
  await wave(page, pb.x + 100, pb.y + 400);
  await expect.poll(async () => (await annots(page)).length, { timeout: 8000 }).toBe(2);
  await wave(page, pb.x + 100, pb.y + 500); // en attente
  await page.click('#tool-eraser');
  const [{ id: topId }, { id: midId }] = await annots(page);
  // deux gestes de gomme : sur le trait du haut (enregistré), puis sur celui du bas (en attente) ; celui du milieu reste
  for (const y of [300, 500]) {
    await page.mouse.move(pb.x + 160, pb.y + y - 25);
    await page.mouse.down();
    await page.mouse.move(pb.x + 160, pb.y + y + 25, { steps: 8 });
    await page.mouse.up();
    // le 1er geste envoie d'abord le trait en attente au document puis supprime le haut : on attend la relecture
    if (y === 300) await expect.poll(async () => (await annots(page)).map((a) => a.id).includes(topId) || (await annots(page)).length, { timeout: 8000 }).toBe(2);
  }
  await expect.poll(async () => (await annots(page)).length, { timeout: 8000 }).toBe(1);
  expect(await pending(page)).toBe(0);
  const [left] = await annots(page);
  expect(left.id).toBe(midId); // c'est bien celui du milieu
});

test('enregistrer tout de suite après avoir écrit : le trait est dans le fichier', async ({ page }) => {
  const pb = await pageBox(page);
  await page.click('#tool-ink');
  await wave(page, pb.x + 100, pb.y + 300);
  expect(await pending(page)).toBe(1); // pas encore envoyé au document
  const [download] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Meta+s')]);
  const doc = await PDFDocument.load(readFileSync((await download.path())!));
  const annotsArr = doc.getPage(0).node.lookupMaybe(PDFName.of('Annots'), PDFArray);
  expect(annotsArr?.size()).toBe(1);
  expect(await pending(page)).toBe(0);
});

test('un doigt fait défiler au lieu d’écrire dès qu’un stylet a servi', async ({ page }) => {
  const pb = await pageBox(page);
  await page.click('#tool-ink');
  await penStroke(page, pb.x + 100, pb.y + 300, Array.from({ length: 10 }, () => 0.5));
  expect(await pending(page)).toBe(1);
  await page.evaluate(
    ({ x, y }) => {
      const layer = document.querySelector('.doc-view:not([hidden]) .page[data-page-number="1"] .annot-layer') as HTMLElement;
      const mk = (type: string, dy: number) => new PointerEvent(type, { pointerId: 9, pointerType: 'touch', isPrimary: true, bubbles: true, cancelable: true, clientX: x, clientY: y + dy, pressure: 0.5, button: 0, buttons: 1 });
      layer.dispatchEvent(mk('pointerdown', 0));
      for (let i = 1; i < 8; i++) layer.dispatchEvent(mk('pointermove', i * 10));
      layer.dispatchEvent(mk('pointerup', 80));
    },
    { x: pb.x + 300, y: pb.y + 200 },
  );
  expect(await pending(page)).toBe(1); // aucun trait de plus
});

test.describe('trait redressé en maintenant le stylet (formes parfaites)', () => {
  const pdfPoints = async (page: Page) => (await annots(page))[0].strokes![0];

  test('une ligne tremblée devient droite ; on règle encore sa longueur avant de relâcher', async ({ page }) => {
    const pb = await pageBox(page);
    await page.click('#tool-ink');
    await page.mouse.move(pb.x + 100, pb.y + 300);
    await page.mouse.down();
    for (let i = 1; i <= 20; i++) await page.mouse.move(pb.x + 100 + i * 8, pb.y + 300 + (i % 2 ? 2 : -2));
    await page.waitForTimeout(900); // maintenu : redressé
    await page.mouse.move(pb.x + 330, pb.y + 330); // on règle la fin
    await page.mouse.up();
    await expect.poll(async () => (await annots(page)).length, { timeout: 8000 }).toBe(1);
    const pts = await pdfPoints(page);
    expect(pts).toHaveLength(2);
    expect(Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1])).toBeGreaterThan(120);
    expect(Math.abs(pts[1][1] - pts[0][1])).toBeGreaterThan(10); // la fin a bien été réglée après le redressement (30 px plus bas)
  });

  test('un cercle approximatif devient un cercle', async ({ page }) => {
    const pb = await pageBox(page);
    await page.click('#tool-ink');
    const cx = pb.x + 250, cy = pb.y + 350;
    await page.mouse.move(cx + 70, cy);
    await page.mouse.down();
    for (let i = 1; i <= 40; i++) {
      const a = (i / 40) * Math.PI * 2.03;
      const r = 70 + Math.sin(i * 1.7) * 3;
      await page.mouse.move(cx + r * Math.cos(a), cy + r * Math.sin(a));
    }
    await page.waitForTimeout(900);
    await page.mouse.up();
    await expect.poll(async () => (await annots(page)).length, { timeout: 8000 }).toBe(1);
    const pts = await pdfPoints(page);
    expect(pts).toHaveLength(73);
    const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const my = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const rs = pts.map((p) => Math.hypot(p[0] - mx, p[1] - my));
    expect(Math.max(...rs) - Math.min(...rs)).toBeLessThan(2); // rond à moins de 2 points près (le tracé à main levée variait de ±3 px)
  });

  test('sans maintenir, rien n’est transformé (l’écriture reste libre)', async ({ page }) => {
    const pb = await pageBox(page);
    await page.click('#tool-ink');
    await page.mouse.move(pb.x + 100, pb.y + 300);
    await page.mouse.down();
    for (let i = 1; i <= 20; i++) await page.mouse.move(pb.x + 100 + i * 8, pb.y + 300 + (i % 2 ? 2 : -2));
    await page.mouse.up(); // relâché tout de suite
    await expect.poll(async () => (await annots(page)).length, { timeout: 8000 }).toBe(1);
    expect((await pdfPoints(page)).length).toBeGreaterThan(10);
  });

  test('de l’écriture maintenue immobile n’est pas transformée', async ({ page }) => {
    const pb = await pageBox(page);
    await page.click('#tool-ink');
    await page.mouse.move(pb.x + 100, pb.y + 300);
    await page.mouse.down();
    for (let i = 1; i <= 30; i++) await page.mouse.move(pb.x + 100 + Math.sin(i / 5) * 25, pb.y + 300 + i * 2.2);
    await page.waitForTimeout(900);
    await page.mouse.up();
    await expect.poll(async () => (await annots(page)).length, { timeout: 8000 }).toBe(1);
    expect((await pdfPoints(page)).length).toBeGreaterThan(10);
  });
});

test.describe('règle', () => {
  test('un trait au bord de la règle est parfaitement droit, même si la main tremble', async ({ page }) => {
    const pb = await pageBox(page);
    void pb;
    await page.click('#tool-ink');
    await page.click('#tool-ruler');
    const ruler = page.locator('.ink-ruler');
    await expect(ruler).toBeVisible();
    const box = (await ruler.boundingBox())!;
    await page.mouse.move(box.x + 100, box.y + 6);
    await page.mouse.down();
    for (let i = 1; i <= 20; i++) await page.mouse.move(box.x + 100 + i * 10, box.y + 6 + Math.sin(i) * 9);
    await page.mouse.up();
    await expect.poll(async () => (await annots(page)).length, { timeout: 8000 }).toBe(1);
    const pts = (await annots(page))[0].strokes![0];
    expect(pts).toHaveLength(2);
    expect(Math.abs(pts[1][1] - pts[0][1])).toBeLessThan(0.01); // horizontale
    expect(Math.abs(pts[1][0] - pts[0][0])).toBeGreaterThan(80);
  });

  test('on tourne la règle à 45° : le trait suit l’inclinaison', async ({ page }) => {
    await page.click('#tool-ink');
    await page.click('#tool-ruler');
    const rot = page.locator('.ink-ruler .ruler-rot');
    const rb = (await rot.boundingBox())!;
    const ruler = page.locator('.ink-ruler');
    const b0 = (await ruler.boundingBox())!;
    const cx = b0.x + b0.width / 2;
    const cy = b0.y + b0.height / 2;
    await page.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2);
    await page.mouse.down();
    await page.mouse.move(cx + 200, cy + 200, { steps: 6 }); // 45° exactement
    await page.mouse.up();
    // le bord supérieur de la règle inclinée : on le retrouve par calcul à partir du centre
    const a = Math.PI / 4;
    const nx = -Math.sin(a), ny = Math.cos(a);
    const edgeCenter = { x: cx + (nx * -44) / 2, y: cy + (ny * -44) / 2 };
    await page.mouse.move(edgeCenter.x - 50 * Math.cos(a) + 3, edgeCenter.y - 50 * Math.sin(a) - 3);
    await page.mouse.down();
    await page.mouse.move(edgeCenter.x + 90 * Math.cos(a), edgeCenter.y + 90 * Math.sin(a), { steps: 10 });
    await page.mouse.up();
    await expect.poll(async () => (await annots(page)).length, { timeout: 8000 }).toBe(1);
    const pts = (await annots(page))[0].strokes![0];
    const dx = pts[1][0] - pts[0][0];
    const dy = pts[1][1] - pts[0][1];
    expect(Math.abs(Math.abs(dy / dx) - 1)).toBeLessThan(0.03); // 45° (le repère PDF a l'axe y inversé : on compare la valeur absolue)
  });

  test('loin de la règle, on écrit normalement ; la règle disparaît avec le stylo', async ({ page }) => {
    const pb = await pageBox(page);
    await page.click('#tool-ink');
    await page.click('#tool-ruler');
    await page.mouse.move(pb.x + 80, pb.y + 100); // loin de la règle (au centre de l'écran)
    await page.mouse.down();
    for (let i = 1; i <= 15; i++) await page.mouse.move(pb.x + 80 + i * 8, pb.y + 100 + Math.sin(i) * 8);
    await page.mouse.up();
    await expect.poll(async () => (await annots(page)).length, { timeout: 8000 }).toBe(1);
    expect((await annots(page))[0].strokes![0].length).toBeGreaterThan(5);
    await page.click('#tool-eraser');
    await expect(page.locator('.ink-ruler')).toHaveCount(0);
    await page.click('#tool-ink');
    await expect(page.locator('.ink-ruler')).toBeVisible();
  });
});

test.describe('lasso', () => {
  async function threeStrokes(page: Page) {
    const pb = await pageBox(page);
    await page.click('#tool-ink');
    await wave(page, pb.x + 100, pb.y + 300);
    await wave(page, pb.x + 100, pb.y + 360);
    await wave(page, pb.x + 100, pb.y + 520);
    await expect.poll(async () => (await annots(page)).length, { timeout: 9000 }).toBe(3);
    return pb;
  }
  async function loop(page: Page, x1: number, y1: number, x2: number, y2: number) {
    await page.mouse.move(x1, y1);
    await page.mouse.down();
    for (const [x, y] of [[x2, y1], [x2, y2], [x1, y2], [x1, y1 + 2]]) await page.mouse.move(x, y, { steps: 6 });
    await page.mouse.up();
  }
  const firstYs = async (page: Page) => (await annots(page)).map((a) => Math.round(a.strokes![0][0][1]));

  test('on entoure deux traits sur trois ; on les déplace en une seule étape ; Annuler les remet', async ({ page }) => {
    const pb = await threeStrokes(page);
    const before = await firstYs(page);
    const x0 = (await annots(page))[0].strokes![0][0][0];
    await page.click('#tool-lasso');
    await loop(page, pb.x + 70, pb.y + 260, pb.x + 300, pb.y + 410);
    const box = page.locator('.lasso-box');
    await expect(box).toHaveAttribute('data-count', '2');
    const bb = (await box.boundingBox())!;
    await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await page.mouse.down();
    await page.mouse.move(bb.x + bb.width / 2 + 80, bb.y + bb.height / 2 + 40, { steps: 8 });
    await page.mouse.up();
    await expect.poll(async () => (await annots(page))[0].strokes![0][0][0] > x0 + 20, { timeout: 8000 }).toBe(true);
    const after = await firstYs(page);
    expect(after[0]).toBeLessThan(before[0] - 10); // déplacé vers le bas de la page (y PDF plus petit)
    expect(after[1]).toBeLessThan(before[1] - 10);
    expect(after[2]).toBe(before[2]); // le troisième n'a pas bougé
    await expect(page.locator('.lasso-box')).toHaveAttribute('data-count', '2'); // la sélection reste après le rechargement
    await page.keyboard.press('Meta+z'); // une seule étape
    await expect.poll(async () => firstYs(page)).toEqual(before);
  });

  test('supprimer et dupliquer la sélection', async ({ page }) => {
    const pb = await threeStrokes(page);
    await page.click('#tool-lasso');
    await loop(page, pb.x + 70, pb.y + 260, pb.x + 300, pb.y + 410);
    await page.click('.lasso-dup');
    await expect.poll(async () => (await annots(page)).length, { timeout: 8000 }).toBe(5);
    await page.click('#tool-lasso'); // (re)choisir l'outil ne change rien ; on entoure la copie et l'original du haut
    await loop(page, pb.x + 70, pb.y + 260, pb.x + 300, pb.y + 330);
    await expect(page.locator('.lasso-box')).toBeVisible();
    await page.click('.lasso-del');
    await expect.poll(async () => (await annots(page)).length, { timeout: 8000 }).toBeLessThan(5);
  });

  test('un seul bouton par outil dans la barre', async ({ page }) => {
    for (const id of ['ink', 'eraser', 'lasso']) await expect(page.locator(`#tool-${id}`)).toHaveCount(1);
  });

  test('une boucle vide désélectionne ; Suppr efface la sélection', async ({ page }) => {
    const pb = await threeStrokes(page);
    await page.click('#tool-lasso');
    await loop(page, pb.x + 70, pb.y + 480, pb.x + 300, pb.y + 560);
    await expect(page.locator('.lasso-box')).toHaveAttribute('data-count', '1');
    await loop(page, pb.x + 350, pb.y + 100, pb.x + 420, pb.y + 160); // vide
    await expect(page.locator('.lasso-box')).toHaveCount(0);
    await loop(page, pb.x + 70, pb.y + 480, pb.x + 300, pb.y + 560);
    await page.keyboard.press('Delete');
    await expect.poll(async () => (await annots(page)).length, { timeout: 8000 }).toBe(2);
  });
});

test.describe('finition : favoris, réglages, tablette', () => {
  test('stylos favoris : trois au départ, un clic reprend type, couleur et épaisseur ; on en mémorise et on en retire', async ({ page }) => {
    await page.click('#tool-ink');
    await expect(page.locator('.pen-fav')).toHaveCount(3);
    const style = () => page.evaluate(() => (window as unknown as { cigale: { app: { annotStyle: { pen: string; width: number; color: number[] } } } }).cigale.app.annotStyle);
    await page.locator('.pen-fav').nth(2).click(); // le surligneur jaune
    expect(await style()).toMatchObject({ pen: 'highlighter', width: 14 });
    await page.locator('.pen-fav').nth(1).click(); // la plume bleue
    expect(await style()).toMatchObject({ pen: 'fountain', width: 3 });
    await expect(page.locator('#annot-pen')).toHaveValue('fountain');
    // mémoriser un nouveau stylo : stylo rouge de 5 pt
    await page.selectOption('#annot-pen', 'pen');
    await page.click('.swatch[data-color="Rouge"]');
    await page.selectOption('#annot-width', '5');
    await page.click('#pen-fav-add');
    await page.click('[data-id="fav-save"]');
    await expect(page.locator('.pen-fav')).toHaveCount(4);
    // déjà présent : pas de doublon
    await page.click('#pen-fav-add');
    await page.click('[data-id="fav-save"]');
    await expect(page.locator('.pen-fav')).toHaveCount(4);
    await page.click('#pen-fav-add');
    await page.click('[data-id="fav-del-3"]');
    await expect(page.locator('.pen-fav')).toHaveCount(3);
  });

  test('les favoris sont gardés (réglages) et les autres outils les cachent', async ({ page }) => {
    await page.click('#tool-ink');
    await expect(page.locator('#pen-favs')).toBeVisible();
    await page.click('#tool-eraser');
    await expect(page.locator('#pen-favs')).toBeHidden();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('cigale-settings') ?? '{}').penFavorites);
    expect(saved === undefined || saved.length === 3).toBe(true);
  });

  test('réglage « redresser les traits » désactivé : maintenir le stylet ne change rien', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('cigale-settings', JSON.stringify({ shapeSnap: false })));
    const pb = await pageBox(page);
    await page.click('#tool-ink');
    await page.mouse.move(pb.x + 100, pb.y + 300);
    await page.mouse.down();
    for (let i = 1; i <= 20; i++) await page.mouse.move(pb.x + 100 + i * 8, pb.y + 300 + (i % 2 ? 2 : -2));
    await page.waitForTimeout(900);
    await page.mouse.up();
    await expect.poll(async () => (await annots(page)).length, { timeout: 8000 }).toBe(1);
    expect((await annots(page))[0].strokes![0].length).toBeGreaterThan(10);
  });

  test('réglage « le doigt peut aussi écrire » : un doigt écrit même après un stylet', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('cigale-settings', JSON.stringify({ fingerWrites: true })));
    const pb = await pageBox(page);
    await page.click('#tool-ink');
    await penStroke(page, pb.x + 100, pb.y + 300, Array.from({ length: 10 }, () => 0.5));
    expect(await pending(page)).toBe(1);
    await page.evaluate(
      ({ x, y }) => {
        const layer = document.querySelector('.doc-view:not([hidden]) .page[data-page-number="1"] .annot-layer') as HTMLElement;
        const mk = (type: string, dx: number) => new PointerEvent(type, { pointerId: 9, pointerType: 'touch', isPrimary: true, bubbles: true, cancelable: true, clientX: x + dx, clientY: y, pressure: 0.5, button: 0, buttons: 1 });
        layer.dispatchEvent(mk('pointerdown', 0));
        for (let i = 1; i < 8; i++) layer.dispatchEvent(mk('pointermove', i * 10));
        layer.dispatchEvent(mk('pointerup', 80));
      },
      { x: pb.x + 300, y: pb.y + 400 },
    );
    expect(await pending(page)).toBe(2);
  });

  test('deux doigts : pas de défilement en plus du zoom (le pincement est géré par la visionneuse)', async ({ page }) => {
    const pb = await pageBox(page);
    await page.click('#tool-ink');
    await penStroke(page, pb.x + 100, pb.y + 300, Array.from({ length: 6 }, () => 0.5)); // un stylet a servi : les doigts font défiler
    const top = () => page.evaluate(() => (document.querySelector('.doc-view:not([hidden]) .viewer-container') as HTMLElement).scrollTop);
    const before = await top();
    await page.evaluate(
      ({ x, y }) => {
        const layer = document.querySelector('.doc-view:not([hidden]) .page[data-page-number="1"] .annot-layer') as HTMLElement;
        const mk = (type: string, id: number, dy: number) => new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: id === 21, bubbles: true, cancelable: true, clientX: x + (id === 21 ? 0 : 100), clientY: y + dy, pressure: 0.5, button: 0, buttons: 1 });
        layer.dispatchEvent(mk('pointerdown', 21, 0));
        layer.dispatchEvent(mk('pointerdown', 22, 0));
        for (let i = 1; i < 6; i++) {
          layer.dispatchEvent(mk('pointermove', 21, i * 15));
          layer.dispatchEvent(mk('pointermove', 22, i * 15));
        }
        layer.dispatchEvent(mk('pointerup', 21, 90));
        layer.dispatchEvent(mk('pointerup', 22, 90));
      },
      { x: pb.x + 300, y: pb.y + 300 },
    );
    expect(await top()).toBe(before);
  });
});

test.describe('mode stylet en un clic, sans clignotement, lasso fiable', () => {
  test('bouton Stylet : ouvre d’un clic la barre d’écriture sur le document ouvert, un 2ᵉ clic la ferme', async ({ page }) => {
    await page.click('#btn-comment'); // (beforeEach l'a ouvert) : on le referme pour partir de zéro
    await expect(page.locator('.annot-toolbar')).toBeHidden();
    await page.click('#btn-pen');
    await expect(page.locator('.annot-toolbar')).toBeVisible();
    await expect(page.locator('#tool-ink')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#btn-pen')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#pen-favs')).toBeVisible();
    await page.click('#btn-pen');
    await expect(page.locator('.annot-toolbar')).toBeHidden();
  });

  test('réglage « ouvrir en mode stylet » : le stylo est prêt dès l’ouverture d’un PDF', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('cigale-settings', JSON.stringify({ penOnOpen: true })));
    await page.reload();
    await openPdf(page, 'simple-3p.pdf');
    await waitFirstPage(page);
    await expect(page.locator('.annot-toolbar')).toBeVisible();
    await expect(page.locator('#tool-ink')).toHaveAttribute('aria-pressed', 'true');
  });

  test('après un trait, la page ne clignote pas (jamais de page blanche entre deux affichages)', async ({ page }) => {
    const pb = await pageBox(page);
    await page.click('#tool-ink');
    // on observe, image par image, l'affichage visible : la page 1 doit toujours avoir son texte dessiné
    const recording = page.evaluate(
      () =>
        new Promise<{ frames: number; blank: number }>((resolve) => {
          let frames = 0;
          let blank = 0;
          const end = performance.now() + 4500;
          const tick = () => {
            const views = [...document.querySelectorAll<HTMLElement>('.doc-view')].filter((v) => !v.hidden && getComputedStyle(v).visibility !== 'hidden');
            const top = views[views.length - 1];
            const c = top?.querySelector('.page[data-page-number="1"] canvas:not(.ink-canvas)') as HTMLCanvasElement | null;
            frames++;
            let dark = 0;
            if (c && c.width > 0) {
              const d = c.getContext('2d')!.getImageData(0, 0, c.width, Math.min(c.height, 400)).data;
              for (let i = 0; i < d.length; i += 16) if (d[i] < 100) dark++;
            }
            if (dark === 0) blank++;
            if (performance.now() < end) requestAnimationFrame(tick);
            else resolve({ frames, blank });
          };
          requestAnimationFrame(tick);
        }),
    );
    await wave(page, pb.x + 100, pb.y + 300);
    await expect.poll(async () => (await annots(page)).length, { timeout: 8000 }).toBe(1);
    const r = await recording;
    expect(r.frames).toBeGreaterThan(30);
    expect(r.blank).toBe(0);
  });

  test('lasso juste après avoir écrit (traits pas encore dans le document) : tout ce qui est dedans est choisi', async ({ page }) => {
    const pb = await pageBox(page);
    await page.click('#tool-ink');
    await wave(page, pb.x + 100, pb.y + 300);
    await wave(page, pb.x + 100, pb.y + 360);
    await page.click('#tool-lasso'); // tout de suite : les 2 traits ne sont pas encore enregistrés
    await page.mouse.move(pb.x + 70, pb.y + 260);
    await page.mouse.down();
    for (const [x, y] of [[300, 260], [300, 410], [70, 410], [70, 262]]) await page.mouse.move(pb.x + x, pb.y + y, { steps: 5 });
    await page.mouse.up();
    await expect(page.locator('.lasso-box')).toHaveAttribute('data-count', '2', { timeout: 10_000 });
  });

  test('lasso : un trait redressé (2 points seulement), une forme et une image sont choisis s’ils sont dedans', async ({ page }) => {
    const pb = await pageBox(page);
    // une ligne redressée (2 points) au stylo
    await page.click('#tool-ink');
    await page.mouse.move(pb.x + 100, pb.y + 300);
    await page.mouse.down();
    for (let i = 1; i <= 20; i++) await page.mouse.move(pb.x + 100 + i * 8, pb.y + 300 + (i % 2 ? 2 : -2));
    await page.waitForTimeout(800);
    await page.mouse.up();
    // un rectangle (outil Rectangle)
    await page.click('#tool-rect');
    await page.mouse.move(pb.x + 120, pb.y + 340);
    await page.mouse.down();
    await page.mouse.move(pb.x + 220, pb.y + 400, { steps: 6 });
    await page.mouse.up();
    await expect.poll(async () => (await annots(page)).length, { timeout: 9000 }).toBe(2);
    await page.click('#tool-lasso');
    await page.mouse.move(pb.x + 70, pb.y + 270);
    await page.mouse.down();
    for (const [x, y] of [[300, 270], [300, 430], [70, 430], [70, 272]]) await page.mouse.move(pb.x + x, pb.y + y, { steps: 5 });
    await page.mouse.up();
    await expect(page.locator('.lasso-box')).toHaveAttribute('data-count', '2');
    // un lasso trop petit pour entourer la moitié d'une forme : rien
    await page.mouse.move(pb.x + 400, pb.y + 600);
    await page.mouse.down();
    for (const [x, y] of [[440, 600], [440, 640], [400, 640], [400, 602]]) await page.mouse.move(pb.x + x, pb.y + y, { steps: 3 });
    await page.mouse.up();
    await expect(page.locator('.lasso-box')).toHaveCount(0);
  });
});
