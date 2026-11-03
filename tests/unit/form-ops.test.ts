import { describe, expect, it } from 'vitest';
import { PDFCheckBox, PDFDocument, PDFDropdown, PDFRadioGroup, PDFTextField } from '@cantoo/pdf-lib';
import { fillForm } from '../../src/pdf/form-ops';
import { addAnnotations } from '../../src/pdf/annot-ops';
import { makePdf } from './helpers';

async function formPdf(opts: { encrypt?: boolean } = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const form = doc.getForm();
  form.createTextField('nom').addToPage(page, { x: 50, y: 700, width: 200, height: 22 });
  const limited = form.createTextField('court');
  limited.setMaxLength(5);
  limited.addToPage(page, { x: 50, y: 660, width: 100, height: 22 });
  form.createCheckBox('accord').addToPage(page, { x: 50, y: 620, width: 18, height: 18 });
  const radio = form.createRadioGroup('civilite');
  radio.addOptionToPage('madame', page, { x: 50, y: 580, width: 16, height: 16 });
  radio.addOptionToPage('monsieur', page, { x: 90, y: 580, width: 16, height: 16 });
  const dd = form.createDropdown('ville');
  dd.addOptions(['Lyon', 'Paris']);
  dd.addToPage(page, { x: 50, y: 540, width: 150, height: 22 });
  if (opts.encrypt) doc.encrypt({ userPassword: 'secret', ownerPassword: 'chef', permissions: {} });
  return doc.save();
}

const read = async (bytes: Uint8Array, password?: string) => {
  const form = (await PDFDocument.load(bytes, { password } as never)).getForm();
  return {
    nom: form.getTextField('nom').getText(),
    court: form.getTextField('court').getText(),
    accord: form.getCheckBox('accord').isChecked(),
    civilite: form.getRadioGroup('civilite').getSelected(),
    ville: form.getDropdown('ville').getSelected(),
  };
};

describe('remplir un formulaire', () => {
  it('écrit texte, case, radio et liste', async () => {
    const r = await fillForm(
      await formPdf(),
      [
        { name: 'nom', kind: 'text', value: 'Éléphant d’été' },
        { name: 'accord', kind: 'checkbox', value: true },
        { name: 'civilite', kind: 'radio', value: 'monsieur' },
        { name: 'ville', kind: 'choice', value: ['Paris'] },
      ],
      undefined,
      1,
    );
    expect(r.filled).toBe(4);
    expect(r.skipped).toEqual([]);
    expect(await read(r.bytes)).toMatchObject({ nom: 'Éléphant d’été', accord: true, civilite: 'monsieur', ville: ['Paris'] });
  });

  it('décoche une case et respecte la longueur maximale', async () => {
    const first = await fillForm(await formPdf(), [{ name: 'accord', kind: 'checkbox', value: true }]);
    const second = await fillForm(first.bytes, [{ name: 'accord', kind: 'checkbox', value: false }, { name: 'court', kind: 'text', value: 'abcdefgh' }]);
    expect(await read(second.bytes)).toMatchObject({ accord: false, court: 'abcde' });
  });

  it('un champ introuvable ou d’un autre type est ignoré, sans erreur', async () => {
    const r = await fillForm(await formPdf(), [{ name: 'absent', kind: 'text', value: 'x' }, { name: 'nom', kind: 'checkbox', value: true }, { name: 'ville', kind: 'choice', value: ['Inconnue'] }]);
    expect(r.filled).toBe(0);
    expect(r.skipped.sort()).toEqual(['absent', 'nom', 'ville']);
  });

  it('l’apparence du champ rempli est écrite (visible dans les autres lecteurs)', async () => {
    const r = await fillForm(await formPdf(), [{ name: 'nom', kind: 'text', value: 'Dupont' }]);
    const form = (await PDFDocument.load(r.bytes)).getForm();
    const widget = form.getTextField('nom').acroField.getWidgets()[0];
    const ap = widget.getNormalAppearance() as never;
    expect(ap).toBeDefined();
    expect(widget.dict.toString()).toContain('AP');
  });

  it('les autres champs gardent leur apparence', async () => {
    const src = await fillForm(await formPdf(), [{ name: 'court', kind: 'text', value: 'abc' }]);
    const apOf = async (bytes: Uint8Array, name: string) => {
      const w = (await PDFDocument.load(bytes)).getForm().getTextField(name).acroField.getWidgets()[0];
      return String((w.getNormalAppearance() as { toString(): string }).toString());
    };
    const before = await apOf(src.bytes, 'court');
    const after = await fillForm(src.bytes, [{ name: 'nom', kind: 'text', value: 'Autre' }]);
    expect(await apOf(after.bytes, 'court')).toBe(before);
  });

  it('un document protégé reste protégé', async () => {
    const r = await fillForm(await formPdf({ encrypt: true }), [{ name: 'nom', kind: 'text', value: 'Secret' }], 'secret');
    await expect(PDFDocument.load(r.bytes)).rejects.toThrow(/encrypted/i);
    expect((await read(r.bytes, 'secret')).nom).toBe('Secret');
  });

  it('garde-fou : nombre de pages différent', async () => {
    await expect(fillForm(await formPdf(), [], undefined, 3)).rejects.toMatchObject({ name: 'structure' });
  });

  it('document sans formulaire : rien à faire, aucune erreur', async () => {
    const r = await fillForm(await makePdf(2), [{ name: 'nom', kind: 'text', value: 'x' }]);
    expect(r.filled).toBe(0);
  });

  it('commentaires et champs cohabitent', async () => {
    const withForm = await fillForm(await formPdf(), [{ name: 'nom', kind: 'text', value: 'A' }]);
    const annotated = await addAnnotations(withForm.bytes, [{ page: 0, kind: 'rect', rect: [10, 10, 60, 40], color: [1, 0, 0], fill: null, opacity: 1, width: 2, contents: '' }], undefined, 1);
    expect((await read(annotated.bytes)).nom).toBe('A');
  });
});

void PDFTextField; void PDFCheckBox; void PDFRadioGroup; void PDFDropdown;
