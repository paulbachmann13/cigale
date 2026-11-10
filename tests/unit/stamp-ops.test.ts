import { describe, it, expect } from 'vitest';
import { PDFDocument, degrees } from '@cantoo/pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  addWatermark,
  addHeaderFooter,
  expandTokens,
  type WatermarkOptions,
  type HeaderFooterOptions,
} from '../../src/pdf/stamp-ops';
import { PageOpError, loadForEdit } from '../../src/pdf/page-ops';
import { makePdf, readPages } from './helpers';

describe('stamp-ops', () => {
  it('expandTokens remplace tous les jetons supportés', () => {
    const res = expandTokens('{title} - p.{page}/{pages} ({date})', {
      page: 2,
      pages: 10,
      date: '03/11/2026',
      title: 'Guide Cigale',
    });
    expect(res).toBe('Guide Cigale - p.2/10 (03/11/2026)');
  });

  it('filigrane : présent et lisible par pdf.js', async () => {
    const pdf = await makePdf(2);
    const opts: WatermarkOptions = {
      text: 'COPIE CONFORME',
      fontSize: 48,
      color: [1, 0, 0],
      opacity: 0.5,
      angle: 45,
    };
    const out = await addWatermark(pdf, opts);
    const pages = await readPages(out);
    expect(pages[0].text).toContain('COPIE CONFORME');
    expect(pages[1].text).toContain('COPIE CONFORME');
  });

  it('en-tête et pied de page : présents et lisibles', async () => {
    const pdf = await makePdf(1);
    const opts: HeaderFooterOptions = {
      header: { left: 'Projet Cigale', center: '', right: '{date}' },
      footer: { left: '', center: 'Page {page}/{pages}', right: '' },
      fontSize: 10,
      color: [0, 0, 0],
      margin: 28,
      firstNumber: 1,
      date: new Date(2026, 10, 3),
    };
    const out = await addHeaderFooter(pdf, opts);
    const pages = await readPages(out);
    expect(pages[0].text).toContain('Projet Cigale');
    expect(pages[0].text).toContain('03/11/2026');
    expect(pages[0].text).toContain('Page 1/1');
  });

  it('applique les filigranes sur les pages sélectionnées seulement', async () => {
    const pdf = await makePdf(3);
    const opts: WatermarkOptions = {
      text: 'CONFIDENTIEL',
      fontSize: 36,
      color: [0, 0, 0],
      opacity: 0.8,
      angle: 0,
      pages: [1], // 2e page uniquement
    };
    const out = await addWatermark(pdf, opts);
    const pages = await readPages(out);
    expect(pages[0].text).not.toContain('CONFIDENTIEL');
    expect(pages[1].text).toContain('CONFIDENTIEL');
    expect(pages[2].text).not.toContain('CONFIDENTIEL');
  });

  it('numérotation {page}/{pages} avec firstNumber et pages partielles', async () => {
    const pdf = await makePdf(4);
    const opts: HeaderFooterOptions = {
      header: { left: '', center: '', right: '' },
      footer: { left: '', center: 'Page {page} sur {pages}', right: '' },
      fontSize: 9,
      color: [0, 0, 0],
      margin: 20,
      firstNumber: 10,
      pages: [1, 3], // pages 2 et 4 du document
    };
    const out = await addHeaderFooter(pdf, opts);
    const pages = await readPages(out);

    expect(pages[0].text).not.toContain('Page 10');
    expect(pages[1].text).toContain('Page 10 sur 4');
    expect(pages[2].text).not.toContain('Page 11');
    expect(pages[3].text).toContain('Page 11 sur 4');
  });

  it('insère le titre du document via {title}', async () => {
    const pdf = await makePdf(1, { title: 'Rapport Trimestriel' });
    const opts: HeaderFooterOptions = {
      header: { left: '{title}', center: '', right: '' },
      footer: { left: '', center: '', right: '' },
      fontSize: 10,
      color: [0, 0, 0],
      margin: 25,
      firstNumber: 1,
    };
    const out = await addHeaderFooter(pdf, opts);
    const pages = await readPages(out);
    expect(pages[0].text).toContain('Rapport Trimestriel');
  });

  it('positionne le texte dans la zone visible avec rotation de 90° et CropBox décalée', async () => {
    const doc = await PDFDocument.create();
    const p = doc.addPage([600, 800]);
    // CropBox décalée [x=50, y=100, width=400, height=500]
    p.setCropBox(50, 100, 400, 500);
    p.setRotation(degrees(90));
    const baseBytes = await doc.save();

    const out = await addWatermark(baseBytes, {
      text: 'VISIBLE-90',
      fontSize: 24,
      color: [0, 0, 0],
      opacity: 0.5,
      angle: 0,
    });

    const task = getDocument({ data: out.slice() } as never);
    const pdf = await task.promise;
    const page = await pdf.getPage(1);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const item = tc.items.find((it) => 'str' in it && it.str.includes('VISIBLE-90'));

    expect(item).toBeDefined();
    if (item && 'transform' in item) {
      const [vx, vy] = vp.convertToViewportPoint(item.transform[4], item.transform[5]);
      expect(vx).toBeGreaterThanOrEqual(0);
      expect(vx).toBeLessThanOrEqual(vp.width);
      expect(vy).toBeGreaterThanOrEqual(0);
      expect(vy).toBeLessThanOrEqual(vp.height);
    }
    await task.destroy();
  });

  it('ne modifie jamais les octets d entrée', async () => {
    const pdf = await makePdf(2);
    const snapshot = pdf.slice();

    await addWatermark(pdf, {
      text: 'TEST',
      fontSize: 20,
      color: [0, 0, 0],
      opacity: 1,
      angle: 0,
    });
    expect(pdf).toEqual(snapshot);

    await addHeaderFooter(pdf, {
      header: { left: 'H', center: '', right: '' },
      footer: { left: '', center: 'F', right: '' },
      fontSize: 10,
      color: [0, 0, 0],
      margin: 20,
      firstNumber: 1,
    });
    expect(pdf).toEqual(snapshot);
  });

  it('garde le document chiffré si ouvert avec mot de passe', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([400, 400]);
    doc.encrypt({ userPassword: 'secret', ownerPassword: 'owner' });
    const encBytes = await doc.save();

    const out = await addWatermark(
      encBytes,
      { text: 'SECRET', fontSize: 20, color: [1, 0, 0], opacity: 1, angle: 0 },
      'secret'
    );

    // Ne s'ouvre pas sans mot de passe
    const taskNoPw = getDocument({ data: out.slice() } as never);
    await expect(taskNoPw.promise).rejects.toThrow();

    // S'ouvre avec le bon mot de passe
    const taskPw = getDocument({ data: out.slice(), password: 'secret' } as never);
    const pdf = await taskPw.promise;
    expect(pdf.numPages).toBe(1);
    await taskPw.destroy();
  });

  it('remplace les caractères non supportés par « ? »', async () => {
    const pdf = await makePdf(1);
    const out = await addWatermark(pdf, {
      text: 'Filigrane 🚀 Invalide 中文',
      fontSize: 20,
      color: [0, 0, 0],
      opacity: 1,
      angle: 0,
    });
    const pages = await readPages(out);
    expect(pages[0].text).toContain('Filigrane ? Invalide ??');
  });

  it('déclenche PageOpError("structure") si expectedPages ne correspond pas', async () => {
    const pdf = await makePdf(2);

    await expect(
      addWatermark(
        pdf,
        { text: 'A', fontSize: 10, color: [0, 0, 0], opacity: 1, angle: 0 },
        undefined,
        3
      )
    ).rejects.toThrow(PageOpError);

    await expect(
      addHeaderFooter(
        pdf,
        {
          header: { left: '', center: '', right: '' },
          footer: { left: '', center: '', right: '' },
          fontSize: 10,
          color: [0, 0, 0],
          margin: 10,
          firstNumber: 1,
        },
        undefined,
        1
      )
    ).rejects.toThrow(PageOpError);
  });
});

describe('numérotation Bates', () => {
  it('préfixe + numéro complété de zéros, de page en page, à partir du numéro choisi', async () => {
    const { batesNumber, expandTokens } = await import('../../src/pdf/stamp-ops');
    expect(batesNumber({ prefix: 'DOSSIER-', digits: 6, start: 1 }, 0)).toBe('DOSSIER-000001');
    expect(batesNumber({ prefix: 'DOSSIER-', digits: 6, start: 1 }, 41)).toBe('DOSSIER-000042');
    expect(batesNumber({ prefix: '', digits: 3, start: 998 }, 3)).toBe('1001'); // déborde sans couper
    expect(batesNumber({ prefix: 'X', digits: 0, start: 5 }, 0)).toBe('X5');
    expect(expandTokens('Pièce {bates} — {page}', { page: 2, pages: 9, date: '', title: '', bates: 'A-02' })).toBe('Pièce A-02 — 2');
    expect(expandTokens('{bates}', { page: 1, pages: 1, date: '', title: '' })).toBe('');
  });
  it('écrit un numéro différent sur chaque page traitée, seulement les pages choisies', async () => {
    const { addHeaderFooter } = await import('../../src/pdf/stamp-ops');
    const out = await addHeaderFooter(await makePdf(4), {
      header: { left: '', center: '', right: '' },
      footer: { left: '{bates}', center: '', right: '' },
      fontSize: 10,
      color: [0, 0, 0],
      margin: 28,
      firstNumber: 1,
      pages: [1, 3],
      bates: { prefix: 'PIECE-', digits: 4, start: 17 },
    });
    const pages = await readPages(out);
    expect(pages[0].text).not.toContain('PIECE');
    expect(pages[1].text).toContain('PIECE-0017');
    expect(pages[2].text).not.toContain('PIECE');
    expect(pages[3].text).toContain('PIECE-0018');
  });
});
