import { describe, expect, it } from 'vitest';
import { PDFDocument } from '@cantoo/pdf-lib';
import { PageOpError } from '../../src/pdf/page-ops';
import { clampRect, extractRegion, regionImagePdf } from '../../src/pdf/region-ops';
import { makePdf } from './helpers';

const PNG_1X1 = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));

describe('region-ops', () => {
  it('une zone devient un PDF d’une page de la taille de la zone', async () => {
    const pdf = await makePdf(3);
    const out = await extractRegion(pdf, 1, [100, 200, 300, 500]);
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(1);
    const box = doc.getPage(0).getCropBox();
    expect([box.x, box.y, box.width, box.height]).toEqual([100, 200, 200, 300]);
    const media = doc.getPage(0).getMediaBox();
    expect([media.width, media.height]).toEqual([200, 300]);
  });

  it('le rectangle est remis dans le bon ordre et dans la page', () => {
    expect(clampRect([300, 500, 100, 200], { x: 0, y: 0, width: 595, height: 842 })).toEqual([100, 200, 300, 500]);
    expect(clampRect([-50, -50, 100, 100], { x: 0, y: 0, width: 595, height: 842 })).toEqual([0, 0, 100, 100]);
  });

  it('une zone trop petite est refusée', async () => {
    const pdf = await makePdf(1);
    await expect(extractRegion(pdf, 0, [10, 10, 15, 400])).rejects.toThrow(PageOpError);
  });

  it('une page hors du document est refusée', async () => {
    const pdf = await makePdf(2);
    await expect(extractRegion(pdf, 5, [0, 0, 100, 100])).rejects.toThrow();
  });

  it('version image : une page de la taille voulue', async () => {
    const out = await regionImagePdf(PNG_1X1, 200, 120);
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(1);
    const { width, height } = doc.getPage(0).getSize();
    expect([width, height]).toEqual([200, 120]);
    await expect(regionImagePdf(PNG_1X1, 3, 3)).rejects.toThrow(PageOpError);
  });
});
