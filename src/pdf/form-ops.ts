/**
 * Remplir un formulaire PDF (AcroForm) : les valeurs saisies dans l'affichage (pdf.js) sont écrites dans les champs du
 * document avec leur apparence. Logique pure : octets → octets.
 */
import { PDFCheckBox, PDFDropdown, PDFOptionList, PDFRadioGroup, PDFTextField, StandardFonts } from '@cantoo/pdf-lib';
import { PageOpError, loadForEdit } from './page-ops';
import { saveDoc } from './protection';

export type FormValue =
  | { name: string; kind: 'text'; value: string }
  | { name: string; kind: 'checkbox'; value: boolean }
  /** `value` : valeur d'export du bouton choisi dans le groupe. */
  | { name: string; kind: 'radio'; value: string }
  | { name: string; kind: 'choice'; value: string[] };

export interface FillResult {
  bytes: Uint8Array;
  /** Champs écrits. */
  filled: number;
  /** Champs introuvables ou de type différent (ignorés, jamais d'erreur). */
  skipped: string[];
}

export async function fillForm(bytes: Uint8Array, values: FormValue[], password?: string, expectedPages?: number): Promise<FillResult> {
  const doc = await loadForEdit(bytes, password);
  if (expectedPages !== undefined && doc.getPageCount() !== expectedPages) throw new PageOpError('structure');
  const form = doc.getForm();
  const skipped: string[] = [];
  let filled = 0;
  for (const v of values) {
    const field = form.getFieldMaybe(v.name);
    try {
      if (field instanceof PDFTextField && v.kind === 'text') {
        const max = field.getMaxLength();
        field.setText(max !== undefined ? v.value.slice(0, max) : v.value);
      } else if (field instanceof PDFCheckBox && v.kind === 'checkbox') {
        if (v.value) field.check();
        else field.uncheck();
      } else if (field instanceof PDFRadioGroup && v.kind === 'radio') {
        field.select(v.value);
      } else if (field instanceof PDFDropdown && v.kind === 'choice') {
        // une valeur qui n'est pas dans la liste est refusée (sauf champ modifiable à la main)
        if (v.value.length && !field.isEditable() && !field.getOptions().includes(v.value[0])) {
          skipped.push(v.name);
          continue;
        }
        if (v.value.length) field.select(v.value[0]);
        else field.clear();
      } else if (field instanceof PDFOptionList && v.kind === 'choice') {
        if (v.value.some((x) => !field.getOptions().includes(x))) {
          skipped.push(v.name);
          continue;
        }
        if (v.value.length) field.select(v.value);
        else field.clear();
      } else {
        skipped.push(v.name);
        continue;
      }
      filled++;
    } catch {
      // valeur refusée par le champ (ex. option inexistante, caractère non dessinable) : on ignore ce champ
      skipped.push(v.name);
    }
  }
  if (filled > 0) {
    // Seuls les champs modifiés sont redessinés ; les autres gardent leur apparence d'origine.
    const font = await doc.embedFont(StandardFonts.Helvetica);
    form.updateFieldAppearances(font);
  }
  return { bytes: await saveDoc(doc), filled, skipped };
}
