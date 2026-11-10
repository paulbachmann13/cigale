import { type Page, expect, test } from '@playwright/test';
import { PDFArray, PDFDict, PDFDocument, PDFName } from '@cantoo/pdf-lib';
import { readFileSync } from 'node:fs';
import { docRotations, gotoHome, openPdf, waitFirstPage, withoutFilePickers } from './helpers';

type S = { id: string; pen: string; width: number; color: number[]; points: number[][]; pressures?: number[] };
type A = { id: string; kind: string; rect: number[]; strokes?: number[][][] };
type Cig = { cigale: { app: { sessions: { annots: A[]; ink: { model: { strokes(p: number): S[]; strokeCount: number; changedSince(m: Map<number, number>): number[] } }; history: { canUndo: boolean; canRedo: boolean; undoLabel: string; dirty: boolean; inkVersions: Map<number, number> } }[] } } };

/** Les traits d'écriture de la page 1 (modèle d'encre, source de vérité). */
const strokes = (page: Page) => page.evaluate(() => (window as unknown as Cig).cigale.app.sessions[0].ink.model.strokes(0).map((s) => ({ id: s.id, pen: s.pen, width: s.width, color: s.color, points: s.points, pressures: s.pressures })));
/** Les autres annotations (formes, notes…) : l'écriture n'en fait plus partie. */
const annots = (page: Page) => page.evaluate(() => (window as unknown as Cig).cigale.app.sessions[0].annots);
const count = async (page: Page) => (await strokes(page)).length;
const history = (page: Page) => page.evaluate(() => { const h = (window as unknown as Cig).cigale.app.sessions[0].history; return { canUndo: h.canUndo, canRedo: h.canRedo, label: h.undoLabel, dirty: h.dirty }; });
/** Marque l'affichage pour vérifier plus tard qu'il n'a PAS été rechargé (même élément = aucun rechargement). */
const markView = (page: Page) => page.evaluate(() => { (document.querySelector('.doc-view:not([hidden])') as HTMLElement & { __mark?: number }).__mark = 42; });
const sameView = (page: Page) => page.evaluate(() => (document.querySelector('.doc-view:not([hidden])') as HTMLElement & { __mark?: number }).__mark === 42);

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

/** Pixels d'encre dessinés par Cigale sur la page 1. */
const inked = (page: Page, which: 'normal' | 'multiply' = 'normal') =>
  page.evaluate((which) => {
    const c = document.querySelector(`.doc-view:not([hidden]) .page[data-page-number="1"] .ink-canvas.${which}`) as HTMLCanvasElement | null;
    if (!c) return 0;
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 100) n++;
    return n;
  }, which);

/** Geste de gomme : un passage vertical à x. */
async function eraseAt(page: Page, x: number, y1: number, y2: number) {
  await page.mouse.move(x, y1);
  await page.mouse.down();
  await page.mouse.move(x, y2, { steps: 8 });
  await page.mouse.up();
}

test('stylo à la souris : le trait apparaît tout de suite, sans aucun rechargement, en une étape Annuler par trait', async ({ page }) => {
  const pb = await pageBox(page);
  await page.click('#tool-ink');
  await markView(page);
  await wave(page, pb.x + 100, pb.y + 300);
  await wave(page, pb.x + 100, pb.y + 340);
  expect(await count(page)).toBe(2);
  expect(await inked(page)).toBeGreaterThan(200);
  expect(await sameView(page)).toBe(true); // l'affichage n'a jamais été rechargé : rien à attendre, rien qui clignote
  expect(await history(page)).toMatchObject({ canUndo: true, dirty: true, label: 'écrire à la main' });
  await page.keyboard.press('Meta+z'); // un trait à la fois
  await expect.poll(() => count(page)).toBe(1);
  await page.keyboard.press('Meta+z');
  await expect.poll(() => count(page)).toBe(0);
  await page.keyboard.press('Meta+Shift+z');
  await expect.poll(() => count(page)).toBe(1);
  await page.keyboard.press('Meta+Shift+z');
  await expect.poll(() => count(page)).toBe(2);
  expect(await sameView(page)).toBe(true); // annuler / rétablir non plus
  expect(await inked(page)).toBeGreaterThan(200);
});

test('le trait est net : dessiné en courbes aux coordonnées PDF, identique à tout zoom', async ({ page }) => {
  const pb = await pageBox(page);
  await page.click('#tool-ink');
  await wave(page, pb.x + 100, pb.y + 300);
  const before = await inked(page);
  await page.click('#btn-zoom-in'); // le zoom redessine l'encre à la nouvelle échelle (sans recalculer les contours)
  await expect.poll(() => inked(page)).toBeGreaterThan(before * 1.2);
  await page.waitForTimeout(300);
  const pts = (await strokes(page))[0].points;
  expect(pts.length).toBeGreaterThan(10); // les points d'origine sont inchangés
});

test('écrire puis agir sur le document (pivoter) : rien n’est perdu, l’encre suit', async ({ page }) => {
  const pb = await pageBox(page);
  await page.click('#tool-ink');
  await wave(page, pb.x + 100, pb.y + 300);
  await page.click('#btn-rot-right'); // l'opération écrit d'abord l'encre dans le document
  await expect.poll(() => docRotations(page)).toEqual([90, 0, 0]);
  await expect.poll(() => count(page)).toBe(1);
  expect(await inked(page)).toBeGreaterThan(100);
  // annuler la rotation : l'encre est toujours là ; annuler encore : le trait disparaît
  await page.keyboard.press('Meta+z');
  await expect.poll(() => docRotations(page)).toEqual([0, 0, 0]);
  await expect.poll(() => count(page)).toBe(1);
  await page.keyboard.press('Meta+z');
  await expect.poll(() => count(page)).toBe(0);
});

test('stylet : la pression est gardée ; la plume s’épaissit avec la pression', async ({ page }) => {
  const pb = await pageBox(page);
  await page.click('#tool-ink');
  await page.selectOption('#annot-pen', 'fountain');
  const ramp = Array.from({ length: 30 }, (_, i) => 0.1 + (i / 29) * 0.85);
  await penStroke(page, pb.x + 100, pb.y + 300, ramp);
  await expect.poll(() => count(page)).toBe(1);
  const [s] = await strokes(page);
  expect(s.pen).toBe('fountain');
  expect(s.pressures).toHaveLength(s.points.length);
  expect(Math.max(...s.pressures!)).toBeGreaterThan(0.8);
  expect(Math.min(...s.pressures!)).toBeLessThan(0.2);
});

test('surligneur : large, translucide, par-dessus le texte (calque multiplié)', async ({ page }) => {
  const pb = await pageBox(page);
  await page.click('#tool-ink');
  await page.selectOption('#annot-pen', 'highlighter');
  await expect(page.locator('#annot-width option')).toHaveText(['8 pt', '14 pt', '20 pt', '28 pt']);
  await wave(page, pb.x + 100, pb.y + 200, 200);
  await expect.poll(() => count(page)).toBe(1);
  const [s] = await strokes(page);
  expect(s).toMatchObject({ pen: 'highlighter', width: 14 });
  expect(s.color[0]).toBeGreaterThan(0.9); // jaune par défaut
  expect(await inked(page, 'multiply')).toBeGreaterThan(500);
  expect(await inked(page, 'normal')).toBe(0);
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

test.describe('gomme précise', () => {
  test('elle coupe un trait là où elle passe : deux morceaux, en une seule étape Annuler', async ({ page }) => {
    const pb = await pageBox(page);
    await page.click('#tool-ink');
    await wave(page, pb.x + 100, pb.y + 300, 240);
    const original = (await strokes(page))[0];
    await page.click('#tool-eraser');
    await markView(page);
    await eraseAt(page, pb.x + 220, pb.y + 270, pb.y + 330);
    const pieces = await strokes(page);
    expect(pieces).toHaveLength(2);
    expect(pieces.every((p) => p.id !== original.id && p.pen === original.pen && p.width === original.width)).toBe(true);
    expect(pieces[0].points.length + pieces[1].points.length).toBeGreaterThan(original.points.length * 0.8); // le reste du trait est gardé
    expect(await sameView(page)).toBe(true); // instantané : aucun rechargement
    await page.keyboard.press('Meta+z');
    await expect.poll(async () => (await strokes(page)).map((s) => s.id)).toEqual([original.id]);
  });

  test('un trait touché est coupé, les autres restent ; un geste annulé par le système ne supprime rien', async ({ page }) => {
    const pb = await pageBox(page);
    await page.click('#tool-ink');
    await wave(page, pb.x + 100, pb.y + 300, 60);
    await wave(page, pb.x + 100, pb.y + 400, 60);
    const [a, b] = await strokes(page);
    await page.click('#tool-eraser');
    await page.evaluate(
      ({ x, y }) => {
        const layer = document.querySelector('.doc-view:not([hidden]) .page[data-page-number="1"] .annot-layer') as HTMLElement;
        const mk = (type: string, dy: number) => new PointerEvent(type, { pointerId: 5, pointerType: 'pen', isPrimary: true, bubbles: true, cancelable: true, clientX: x, clientY: y + dy, pressure: 0.5, button: 0, buttons: 1 });
        layer.dispatchEvent(mk('pointerdown', -20));
        layer.dispatchEvent(mk('pointermove', 0));
        layer.dispatchEvent(mk('pointercancel', 0));
      },
      { x: pb.x + 130, y: pb.y + 300 },
    );
    expect((await strokes(page)).map((s) => s.id)).toEqual([a.id, b.id]); // geste annulé : rien n'est supprimé
    await eraseAt(page, pb.x + 130, pb.y + 270, pb.y + 330);
    const ids = (await strokes(page)).map((s) => s.id);
    expect(ids).not.toContain(a.id); // le premier a été coupé (remplacé par ses morceaux)
    expect(ids).toContain(b.id); // le second n'a pas été touché
    await eraseAt(page, pb.x + 130, pb.y + 370, pb.y + 430);
    expect((await strokes(page)).map((s) => s.id)).not.toContain(b.id);
  });

  test('elle efface aussi les formes (rectangle) touchées, en un geste', async ({ page }) => {
    const pb = await pageBox(page);
    await page.click('#tool-rect');
    await page.mouse.move(pb.x + 120, pb.y + 340);
    await page.mouse.down();
    await page.mouse.move(pb.x + 220, pb.y + 400, { steps: 6 });
    await page.mouse.up();
    await expect.poll(async () => (await annots(page)).map((a) => a.kind)).toEqual(['rect']);
    await page.click('#tool-eraser');
    await eraseAt(page, pb.x + 120, pb.y + 320, pb.y + 360); // traverse le bord gauche du rectangle
    await expect.poll(async () => (await annots(page)).length, { timeout: 8000 }).toBe(0);
  });
});

test('enregistrer tout de suite après avoir écrit : le trait est dans le fichier, dans son calque', async ({ page }) => {
  const pb = await pageBox(page);
  await page.click('#tool-ink');
  await wave(page, pb.x + 100, pb.y + 300);
  expect(await page.evaluate(() => (window as unknown as Cig).cigale.app.sessions[0].ink.model.changedSince((window as unknown as Cig).cigale.app.sessions[0].history.inkVersions))).toEqual([0]); // pas encore dans les octets
  const [download] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Meta+s')]);
  const doc = await PDFDocument.load(readFileSync((await download.path())!));
  const annotsArr = doc.getPage(0).node.lookupMaybe(PDFName.of('Annots'), PDFArray)!;
  expect(annotsArr.size()).toBe(1);
  const d = annotsArr.lookup(0, PDFDict);
  expect(d.get(PDFName.of('Subtype'))).toBe(PDFName.of('Ink'));
  expect(d.has(PDFName.of('CigalePen'))).toBe(true);
  expect(d.has(PDFName.of('OC'))).toBe(true); // rangé dans le calque « Écriture manuscrite (Cigale) »
  expect(await count(page)).toBe(1);
  expect(await history(page)).toMatchObject({ dirty: false });
});

test('un trait enregistré se retrouve à la réouverture : mêmes traits, même pression, gommable', async ({ page }) => {
  const pb = await pageBox(page);
  await page.click('#tool-ink');
  await page.selectOption('#annot-pen', 'fountain');
  await penStroke(page, pb.x + 100, pb.y + 300, Array.from({ length: 24 }, (_, i) => 0.2 + i / 40));
  const written = (await strokes(page))[0];
  const [download] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Meta+s')]);
  const bytes = readFileSync((await download.path())!);
  await page.click('#tab-home');
  await page.locator('#file-input').setInputFiles({ name: 'ecrit.pdf', mimeType: 'application/pdf', buffer: bytes });
  await expect(page.locator('.tab.doc-tab')).toHaveCount(2);
  await page.waitForSelector('.doc-view:not([hidden]) .page[data-page-number="1"] canvas');
  await expect
    .poll(() => page.evaluate(() => (window as unknown as Cig).cigale.app.sessions[1].ink.model.strokeCount))
    .toBe(1);
  const back = await page.evaluate(() => (window as unknown as Cig).cigale.app.sessions[1].ink.model.strokes(0).map((s) => ({ id: s.id, pen: s.pen, n: s.points.length, p: s.pressures?.length })));
  expect(back[0]).toMatchObject({ id: written.id, pen: 'fountain', n: written.points.length, p: written.points.length });
  // à la réouverture le document n'est pas « modifié », et l'encre est dessinée par Cigale (le calque PDF est masqué)
  expect(await page.evaluate(() => (window as unknown as Cig).cigale.app.sessions[1].history.dirty)).toBe(false);
  await expect.poll(() => inked(page)).toBeGreaterThan(100);
});

test('un doigt fait défiler au lieu d’écrire dès qu’un stylet a servi', async ({ page }) => {
  const pb = await pageBox(page);
  await page.click('#tool-ink');
  await penStroke(page, pb.x + 100, pb.y + 300, Array.from({ length: 10 }, () => 0.5));
  expect(await count(page)).toBe(1);
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
  expect(await count(page)).toBe(1); // aucun trait de plus
});

test.describe('trait redressé en maintenant le stylet (formes parfaites)', () => {
  const first = async (page: Page) => (await strokes(page))[0].points;

  test('une ligne tremblée devient droite ; on règle encore sa longueur avant de relâcher', async ({ page }) => {
    const pb = await pageBox(page);
    await page.click('#tool-ink');
    await page.mouse.move(pb.x + 100, pb.y + 300);
    await page.mouse.down();
    for (let i = 1; i <= 20; i++) await page.mouse.move(pb.x + 100 + i * 8, pb.y + 300 + (i % 2 ? 2 : -2));
    await page.waitForTimeout(900); // maintenu : redressé
    await page.mouse.move(pb.x + 330, pb.y + 330); // on règle la fin
    await page.mouse.up();
    await expect.poll(() => count(page)).toBe(1);
    const pts = await first(page);
    expect(pts).toHaveLength(2);
    expect(Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1])).toBeGreaterThan(120);
    expect(Math.abs(pts[1][1] - pts[0][1])).toBeGreaterThan(10);
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
    await expect.poll(() => count(page)).toBe(1);
    const pts = await first(page);
    expect(pts).toHaveLength(73);
    const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const my = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const rs = pts.map((p) => Math.hypot(p[0] - mx, p[1] - my));
    expect(Math.max(...rs) - Math.min(...rs)).toBeLessThan(2);
  });

  test('sans maintenir, rien n’est transformé ; l’écriture maintenue immobile non plus', async ({ page }) => {
    const pb = await pageBox(page);
    await page.click('#tool-ink');
    await page.mouse.move(pb.x + 100, pb.y + 300);
    await page.mouse.down();
    for (let i = 1; i <= 20; i++) await page.mouse.move(pb.x + 100 + i * 8, pb.y + 300 + (i % 2 ? 2 : -2));
    await page.mouse.up(); // relâché tout de suite
    await expect.poll(() => count(page)).toBe(1);
    expect((await first(page)).length).toBeGreaterThan(10);
    await page.mouse.move(pb.x + 100, pb.y + 400);
    await page.mouse.down();
    for (let i = 1; i <= 30; i++) await page.mouse.move(pb.x + 100 + Math.sin(i / 5) * 25, pb.y + 400 + i * 2.2);
    await page.waitForTimeout(900);
    await page.mouse.up();
    await expect.poll(() => count(page)).toBe(2);
    expect((await strokes(page))[1].points.length).toBeGreaterThan(10); // une lettre « S » n'est pas une forme
  });
});

test.describe('règle', () => {
  test('un trait au bord de la règle est parfaitement droit, même si la main tremble', async ({ page }) => {
    await page.click('#tool-ink');
    await page.click('#tool-ruler');
    const ruler = page.locator('.ink-ruler');
    await expect(ruler).toBeVisible();
    const box = (await ruler.boundingBox())!;
    await page.mouse.move(box.x + 100, box.y + 6);
    await page.mouse.down();
    for (let i = 1; i <= 20; i++) await page.mouse.move(box.x + 100 + i * 10, box.y + 6 + Math.sin(i) * 9);
    await page.mouse.up();
    await expect.poll(() => count(page)).toBe(1);
    const pts = (await strokes(page))[0].points;
    expect(pts).toHaveLength(2);
    expect(Math.abs(pts[1][1] - pts[0][1])).toBeLessThan(0.01); // horizontale
    expect(Math.abs(pts[1][0] - pts[0][0])).toBeGreaterThan(80);
  });

  test('on tourne la règle à 45° : le trait suit l’inclinaison', async ({ page }) => {
    await page.click('#tool-ink');
    await page.click('#tool-ruler');
    const rb = (await page.locator('.ink-ruler .ruler-rot').boundingBox())!;
    const b0 = (await page.locator('.ink-ruler').boundingBox())!;
    const cx = b0.x + b0.width / 2;
    const cy = b0.y + b0.height / 2;
    await page.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2);
    await page.mouse.down();
    await page.mouse.move(cx + 200, cy + 200, { steps: 6 }); // 45° exactement
    await page.mouse.up();
    const a = Math.PI / 4;
    const nx = -Math.sin(a), ny = Math.cos(a);
    const edgeCenter = { x: cx + (nx * -44) / 2, y: cy + (ny * -44) / 2 };
    await page.mouse.move(edgeCenter.x - 50 * Math.cos(a) + 3, edgeCenter.y - 50 * Math.sin(a) - 3);
    await page.mouse.down();
    await page.mouse.move(edgeCenter.x + 90 * Math.cos(a), edgeCenter.y + 90 * Math.sin(a), { steps: 10 });
    await page.mouse.up();
    await expect.poll(() => count(page)).toBe(1);
    const pts = (await strokes(page))[0].points;
    expect(Math.abs(Math.abs((pts[1][1] - pts[0][1]) / (pts[1][0] - pts[0][0])) - 1)).toBeLessThan(0.03);
  });

  test('loin de la règle, on écrit normalement ; la règle disparaît avec le stylo', async ({ page }) => {
    const pb = await pageBox(page);
    await page.click('#tool-ink');
    await page.click('#tool-ruler');
    await page.mouse.move(pb.x + 80, pb.y + 100);
    await page.mouse.down();
    for (let i = 1; i <= 15; i++) await page.mouse.move(pb.x + 80 + i * 8, pb.y + 100 + Math.sin(i) * 8);
    await page.mouse.up();
    await expect.poll(() => count(page)).toBe(1);
    expect((await strokes(page))[0].points.length).toBeGreaterThan(5);
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
    expect(await count(page)).toBe(3);
    return pb;
  }
  async function loop(page: Page, x1: number, y1: number, x2: number, y2: number) {
    await page.mouse.move(x1, y1);
    await page.mouse.down();
    for (const [x, y] of [[x2, y1], [x2, y2], [x1, y2], [x1, y1 + 2]]) await page.mouse.move(x, y, { steps: 6 });
    await page.mouse.up();
  }
  const firstYs = async (page: Page) => (await strokes(page)).map((s) => Math.round(s.points[0][1]));

  test('on entoure deux traits sur trois, tout de suite ; on les déplace en direct, en une étape, sans rechargement', async ({ page }) => {
    const pb = await threeStrokes(page);
    const before = await firstYs(page);
    const x0 = (await strokes(page))[0].points[0][0];
    await page.click('#tool-lasso'); // aucun délai à attendre : l'écriture est déjà dans le modèle
    await markView(page);
    await loop(page, pb.x + 70, pb.y + 260, pb.x + 300, pb.y + 410);
    const box = page.locator('.lasso-box');
    await expect(box).toHaveAttribute('data-count', '2');
    const bb = (await box.boundingBox())!;
    await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await page.mouse.down();
    await page.mouse.move(bb.x + bb.width / 2 + 80, bb.y + bb.height / 2 + 40, { steps: 8 });
    await page.mouse.up();
    await expect.poll(async () => (await strokes(page))[0].points[0][0] > x0 + 20).toBe(true);
    const after = await firstYs(page);
    expect(after[0]).toBeLessThan(before[0] - 10);
    expect(after[1]).toBeLessThan(before[1] - 10);
    expect(after[2]).toBe(before[2]); // le troisième n'a pas bougé
    await expect(page.locator('.lasso-box')).toHaveAttribute('data-count', '2'); // la sélection reste
    expect(await sameView(page)).toBe(true);
    await page.keyboard.press('Meta+z'); // une seule étape
    await expect.poll(async () => firstYs(page)).toEqual(before);
    await page.keyboard.press('Meta+Shift+z');
    await expect.poll(async () => (await firstYs(page))[0]).toBe(after[0]);
  });

  test('supprimer et dupliquer la sélection', async ({ page }) => {
    const pb = await threeStrokes(page);
    await page.click('#tool-lasso');
    await loop(page, pb.x + 70, pb.y + 260, pb.x + 300, pb.y + 410);
    await page.click('.lasso-dup');
    await expect.poll(() => count(page)).toBe(5);
    await expect(page.locator('.lasso-box')).toHaveAttribute('data-count', '2'); // les copies sont la nouvelle sélection
    await page.click('.lasso-del'); // supprime les copies
    await expect.poll(() => count(page)).toBe(3);
    await page.keyboard.press('Meta+z');
    await expect.poll(() => count(page)).toBe(5);
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
    await expect.poll(() => count(page)).toBe(2);
  });

  test('un seul bouton par outil dans la barre', async ({ page }) => {
    for (const id of ['ink', 'eraser', 'lasso']) await expect(page.locator(`#tool-${id}`)).toHaveCount(1);
  });

  test('un trait redressé (2 points seulement) et une forme sont choisis ensemble ; dupliquer les copie tous les deux', async ({ page }) => {
    const pb = await pageBox(page);
    await page.click('#tool-ink');
    await page.mouse.move(pb.x + 100, pb.y + 300);
    await page.mouse.down();
    for (let i = 1; i <= 20; i++) await page.mouse.move(pb.x + 100 + i * 8, pb.y + 300 + (i % 2 ? 2 : -2));
    await page.waitForTimeout(800);
    await page.mouse.up();
    await page.click('#tool-rect');
    await page.mouse.move(pb.x + 120, pb.y + 340);
    await page.mouse.down();
    await page.mouse.move(pb.x + 220, pb.y + 400, { steps: 6 });
    await page.mouse.up();
    await expect.poll(async () => (await annots(page)).length, { timeout: 9000 }).toBe(1);
    await page.click('#tool-lasso');
    await page.mouse.move(pb.x + 70, pb.y + 270);
    await page.mouse.down();
    for (const [x, y] of [[300, 270], [300, 430], [70, 430], [70, 272]]) await page.mouse.move(pb.x + x, pb.y + y, { steps: 5 });
    await page.mouse.up();
    await expect(page.locator('.lasso-box')).toHaveAttribute('data-count', '2');
    await page.click('.lasso-dup');
    await expect.poll(() => count(page)).toBe(2);
    await expect.poll(async () => (await annots(page)).length, { timeout: 8000 }).toBe(2);
    await page.click('#tool-lasso');
    // un lasso trop petit pour entourer la moitié d'un objet : rien
    await page.mouse.move(pb.x + 400, pb.y + 600);
    await page.mouse.down();
    for (const [x, y] of [[440, 600], [440, 640], [400, 640], [400, 602]]) await page.mouse.move(pb.x + x, pb.y + y, { steps: 3 });
    await page.mouse.up();
    await expect(page.locator('.lasso-box')).toHaveCount(0);
  });
});

test.describe('mode stylet en un clic, sans clignotement', () => {
  test('bouton Stylet : ouvre d’un clic la barre d’écriture sur le document ouvert, un 2ᵉ clic la ferme', async ({ page }) => {
    await page.click('#btn-comment');
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

  test('écrire des dizaines de traits ne recharge jamais la page et reste fluide', async ({ page }) => {
    const pb = await pageBox(page);
    await page.click('#tool-ink');
    await markView(page);
    const t0 = Date.now();
    for (let i = 0; i < 40; i++) await wave(page, pb.x + 60 + Math.floor(i / 20) * 200, pb.y + 150 + (i % 20) * 14, 90); // (la fenêtre de test fait 720 px de haut)
    expect(await count(page)).toBe(40);
    expect(await sameView(page)).toBe(true);
    expect(Date.now() - t0).toBeLessThan(30_000);
    // la page n'a jamais été blanche
    const dark = await page.evaluate(() => {
      const c = document.querySelector('.doc-view:not([hidden]) .page[data-page-number="1"] canvas:not(.ink-canvas)') as HTMLCanvasElement;
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, Math.min(c.height, 400)).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 16) if (d[i] < 100) n++;
      return n;
    });
    expect(dark).toBeGreaterThan(0);
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
    expect(await style()).toMatchObject({ pen: 'fountain', width: 2.5 });
    await expect(page.locator('#annot-pen')).toHaveValue('fountain');
    await page.selectOption('#annot-pen', 'pen');
    await page.click('.swatch[data-color="Rouge"]');
    await page.selectOption('#annot-width', '4');
    await page.click('#pen-fav-add');
    await page.click('[data-id="fav-save"]');
    await expect(page.locator('.pen-fav')).toHaveCount(4);
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
    await expect.poll(() => count(page)).toBe(1);
    expect((await strokes(page))[0].points.length).toBeGreaterThan(10);
  });

  test('réglage « le doigt peut aussi écrire » : un doigt écrit même après un stylet', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('cigale-settings', JSON.stringify({ fingerWrites: true })));
    const pb = await pageBox(page);
    await page.click('#tool-ink');
    await penStroke(page, pb.x + 100, pb.y + 300, Array.from({ length: 10 }, () => 0.5));
    expect(await count(page)).toBe(1);
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
    expect(await count(page)).toBe(2);
  });

  test('deux doigts : pas de défilement en plus du zoom (le pincement est géré par la visionneuse)', async ({ page }) => {
    const pb = await pageBox(page);
    await page.click('#tool-ink');
    await penStroke(page, pb.x + 100, pb.y + 300, Array.from({ length: 6 }, () => 0.5));
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
