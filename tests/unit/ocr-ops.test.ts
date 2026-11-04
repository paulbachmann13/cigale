import { describe, it, expect } from 'vitest';
import { PDFDocument, degrees } from '@cantoo/pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  addTextLayer,
  type OcrPage,
  type OcrWord,
} from '../../src/pdf/ocr-ops';
import { PageOpError } from '../../src/pdf/page-ops';
import { makePdf, readPages, everything } from './helpers';

describe('ocr-ops', () => {
  it('le texte ajouté est lu par pdf.js', async () => {
    const pdf = await makePdf(1);
    const pagesOcr: OcrPage[] = [
      {
        index: 0,
        imageWidth: 595,
        imageHeight: 842,
        lines: [
          {
            words: [
              { text: 'TEXTE_OCR', x0: 50, y0: 100, x1: 150, y1: 120 },
            ],
          },
        ],
      },
    ];

    const out = await addTextLayer(pdf, pagesOcr);
    const pages = await readPages(out);
    expect(pages[0].text).toContain('TEXTE_OCR');
  });

  it('le flux contient l opérateur « 3 Tr » (mode invisible)', async () => {
    const pdf = await makePdf(1);
    const pagesOcr: OcrPage[] = [
      {
        index: 0,
        imageWidth: 600,
        imageHeight: 800,
        lines: [
          {
            words: [{ text: 'INVISIBLE', x0: 50, y0: 50, x1: 150, y1: 70 }],
          },
        ],
      },
    ];

    const out = await addTextLayer(pdf, pagesOcr);
    const raw = everything(out);
    expect(raw).toContain('3 Tr');
  });

  it('positionne la ligne de base à moins de 3 pt de l endroit attendu pour rotations 0, 90, 180 et 270', async () => {
    for (const rot of [0, 90, 180, 270]) {
      const pdf = await makePdf(1, { rotations: [rot] });
      const isSideways = rot === 90 || rot === 270;
      const viewWidth = isSideways ? 842 : 595;
      const viewHeight = isSideways ? 595 : 842;
      const imageWidth = 1000;
      const imageHeight = 1200;

      const word: OcrWord = {
        text: `ROT_${rot}`,
        x0: 150,
        y0: 200,
        x1: 350,
        y1: 260,
      };
      const h = word.y1 - word.y0;
      const expectedScreenX = (word.x0 / imageWidth) * viewWidth;
      const expectedScreenY = ((word.y1 - 0.2 * h) / imageHeight) * viewHeight;

      const out = await addTextLayer(pdf, [
        {
          index: 0,
          imageWidth,
          imageHeight,
          lines: [{ words: [word] }],
        },
      ]);

      const task = getDocument({ data: out.slice() } as never);
      const doc = await task.promise;
      const page = await doc.getPage(1);
      const vp = page.getViewport({ scale: 1 });
      const tc = await page.getTextContent();
      const item = tc.items.find(
        (it) => 'str' in it && it.str.includes(`ROT_${rot}`)
      );

      expect(item).toBeDefined();
      if (item && 'transform' in item) {
        const [vx, vy] = vp.convertToViewportPoint(
          item.transform[4],
          item.transform[5]
        );
        expect(Math.abs(vx - expectedScreenX)).toBeLessThan(3);
        expect(Math.abs(vy - expectedScreenY)).toBeLessThan(3);
      }
      await task.destroy();
    }
  });

  it('positionne la ligne de base correctement avec une CropBox décalée', async () => {
    const doc = await PDFDocument.create();
    const p = doc.addPage([600, 800]);
    p.setCropBox(50, 100, 400, 500);
    const baseBytes = await doc.save();

    const viewWidth = 400;
    const viewHeight = 500;
    const imageWidth = 800;
    const imageHeight = 1000;

    const word: OcrWord = {
      text: 'CROPPED',
      x0: 100,
      y0: 150,
      x1: 250,
      y1: 200,
    };
    const h = word.y1 - word.y0;
    const expectedScreenX = (word.x0 / imageWidth) * viewWidth;
    const expectedScreenY = ((word.y1 - 0.2 * h) / imageHeight) * viewHeight;

    const out = await addTextLayer(baseBytes, [
      {
        index: 0,
        imageWidth,
        imageHeight,
        lines: [{ words: [word] }],
      },
    ]);

    const task = getDocument({ data: out.slice() } as never);
    const pdfJsDoc = await task.promise;
    const page = await pdfJsDoc.getPage(1);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const item = tc.items.find(
      (it) => 'str' in it && it.str.includes('CROPPED')
    );

    expect(item).toBeDefined();
    if (item && 'transform' in item) {
      const [vx, vy] = vp.convertToViewportPoint(
        item.transform[4],
        item.transform[5]
      );
      expect(Math.abs(vx - expectedScreenX)).toBeLessThan(3);
      expect(Math.abs(vy - expectedScreenY)).toBeLessThan(3);
    }
    await task.destroy();
  });

  it('déclenche PageOpError("structure") si expectedPages est faux', async () => {
    const pdf = await makePdf(2);

    await expect(
      addTextLayer(
        pdf,
        [{ index: 0, imageWidth: 100, imageHeight: 100, lines: [] }],
        undefined,
        3
      )
    ).rejects.toThrow(PageOpError);
  });

  it('remplace les caractères hors WinAnsi par « ? » sans planter', async () => {
    const pdf = await makePdf(1);
    const out = await addTextLayer(pdf, [
      {
        index: 0,
        imageWidth: 600,
        imageHeight: 800,
        lines: [
          {
            words: [
              {
                text: 'Emoji🚀EtChinois中文',
                x0: 50,
                y0: 100,
                x1: 250,
                y1: 130,
              },
            ],
          },
        ],
      },
    ]);

    const pages = await readPages(out);
    expect(pages[0].text).toContain('Emoji?EtChinois??');
  });

  it('deux mots d une ligne : le texte lu contient « mot1 mot2 »', async () => {
    const pdf = await makePdf(1);
    const out = await addTextLayer(pdf, [
      {
        index: 0,
        imageWidth: 800,
        imageHeight: 1000,
        lines: [
          {
            words: [
              { text: 'mot1', x0: 50, y0: 100, x1: 150, y1: 130 },
              { text: 'mot2', x0: 170, y0: 100, x1: 270, y1: 130 },
            ],
          },
        ],
      },
    ]);

    const pages = await readPages(out);
    expect(pages[0].text.replace(/\s+/g, ' ')).toContain('mot1 mot2');
  });

  it('ignore les pages hors bornes ou doublons, et laisse intactes les pages sans mots', async () => {
    const pdf = await makePdf(2);
    const out = await addTextLayer(pdf, [
      {
        index: -1, // hors bornes
        imageWidth: 500,
        imageHeight: 500,
        lines: [{ words: [{ text: 'IGNORE', x0: 1, y0: 1, x1: 10, y1: 10 }] }],
      },
      {
        index: 5, // hors bornes
        imageWidth: 500,
        imageHeight: 500,
        lines: [{ words: [{ text: 'IGNORE', x0: 1, y0: 1, x1: 10, y1: 10 }] }],
      },
      {
        index: 0,
        imageWidth: 500,
        imageHeight: 500,
        lines: [{ words: [{ text: 'PREMIER', x0: 20, y0: 20, x1: 80, y1: 40 }] }],
      },
      {
        index: 0, // doublon ignoré
        imageWidth: 500,
        imageHeight: 500,
        lines: [{ words: [{ text: 'DOUBLON', x0: 20, y0: 50, x1: 80, y1: 70 }] }],
      },
      {
        index: 1, // page sans mots
        imageWidth: 500,
        imageHeight: 500,
        lines: [],
      },
    ]);

    const pages = await readPages(out);
    expect(pages[0].text).toContain('PREMIER');
    expect(pages[0].text).not.toContain('DOUBLON');
    expect(pages[0].text).not.toContain('IGNORE');
    expect(pages[1].text).not.toContain('IGNORE');
  });

  it('ne modifie pas le buffer d entrée', async () => {
    const pdf = await makePdf(1);
    const snapshot = pdf.slice();

    await addTextLayer(pdf, [
      {
        index: 0,
        imageWidth: 600,
        imageHeight: 800,
        lines: [
          { words: [{ text: 'IMMUTABLE', x0: 10, y0: 10, x1: 100, y1: 30 }] },
        ],
      },
    ]);

    expect(pdf).toEqual(snapshot);
  });
});
