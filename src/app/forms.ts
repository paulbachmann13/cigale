/** Formulaires : lit ce que l'utilisateur a saisi dans les champs affichés par pdf.js (annotationStorage). */
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { FormValue } from '../pdf/form-ops';

interface FieldObject {
  id: string;
  type?: string;
  /** Valeur d'export (pdf.js : `exportValues`, texte ou liste). */
  exportValues?: string | string[];
}

/** Nombre de champs modifiés en attente (pas encore écrits dans le document). */
export const pendingFormCount = (pdf: PDFDocumentProxy): number => (pdf.annotationStorage as unknown as { size: number }).size;

/** Le document contient-il des champs de formulaire ? */
export async function hasFormFields(pdf: PDFDocumentProxy): Promise<boolean> {
  try {
    const fields = (await pdf.getFieldObjects()) as unknown;
    if (!fields) return false;
    return fields instanceof Map ? fields.size > 0 : Object.keys(fields as object).length > 0;
  } catch {
    return false;
  }
}

/** Valeurs saisies, au format attendu par `fillForm` (nom complet du champ → valeur). */
export async function collectFormValues(pdf: PDFDocumentProxy): Promise<FormValue[]> {
  const storage = (pdf.annotationStorage as unknown as { serializable: { map: Map<string, Record<string, unknown>> | null } }).serializable;
  const changed = storage.map;
  if (!changed || changed.size === 0) return [];
  const raw = (await pdf.getFieldObjects()) as unknown;
  const entries: [string, FieldObject[]][] = raw instanceof Map ? [...raw] : Object.entries((raw ?? {}) as Record<string, FieldObject[]>);
  const out: FormValue[] = [];
  for (const [name, widgets] of entries) {
    let radio: string | undefined;
    for (const w of widgets) {
      const v = changed.get(w.id);
      if (!v || !('value' in v)) continue;
      const value = v.value;
      switch (w.type) {
        case 'checkbox':
          out.push({ name, kind: 'checkbox', value: !!value });
          break;
        case 'radiobutton':
          if (value) radio = (Array.isArray(w.exportValues) ? w.exportValues[0] : w.exportValues) ?? String(value);
          break;
        case 'combobox':
        case 'listbox':
          out.push({ name, kind: 'choice', value: Array.isArray(value) ? value.map(String) : value === '' || value == null ? [] : [String(value)] });
          break;
        case 'text':
          out.push({ name, kind: 'text', value: value == null ? '' : String(value) });
          break;
      }
    }
    if (radio !== undefined) out.push({ name, kind: 'radio', value: radio });
  }
  return out;
}
