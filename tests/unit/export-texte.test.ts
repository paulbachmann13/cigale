import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { buildDocx, xmlEscape } from '../../src/data/docx';
import { pageText, toLines, toParagraphs } from '../../src/data/text-layout';

const piece = (str: string, x: number, y: number, width = str.length * 5, height = 10) => ({ str, x, y, width, height });

describe('mise en lignes et paragraphes', () => {
  it('remet les morceaux dans l’ordre de lecture, même dans le désordre du fichier', () => {
    const lines = toLines([piece('monde', 60, 700), piece('Bonjour', 10, 700), piece('Ligne 2', 10, 686), piece('Titre', 10, 740)]);
    expect(lines.map((l) => l.text)).toEqual(['Titre', 'Bonjour monde', 'Ligne 2']);
  });
  it('espace seulement quand il y a un vrai trou ; pas d’espace au milieu d’un mot coupé en morceaux', () => {
    expect(toLines([piece('Bon', 10, 700, 15), piece('jour', 25, 700, 20), piece('monde', 60, 700)])[0].text).toBe('Bonjour monde');
  });
  it('paragraphes : un grand saut vertical coupe, un interligne normal non ; la césure est recollée', () => {
    const paras = toParagraphs([piece('Première ligne du', 10, 700), piece('même para-', 10, 688), piece('graphe.', 10, 676), piece('Autre paragraphe', 10, 640)]);
    expect(paras).toEqual(['Première ligne du même paragraphe.', 'Autre paragraphe']);
  });
  it('texte brut : paragraphes séparés par une ligne vide ; page vide : vide', () => {
    expect(pageText([piece('A', 10, 700), piece('B', 10, 600)])).toBe('A\n\nB');
    expect(pageText([])).toBe('');
  });
  it('ignore les morceaux vides', () => {
    expect(toLines([piece('', 10, 700), piece('  ', 20, 700, 5), piece('ok', 30, 700)]).map((l) => l.text)).toEqual(['ok']);
  });
});

describe('fichier Word (.docx)', () => {
  it('archive valide : les 4 parties, XML bien formé, une page = ses paragraphes + un saut de page entre pages', () => {
    const files = unzipSync(buildDocx([['Titre', 'Un « accent » & <balise>'], [], ['Fin']], 'Mon doc'));
    expect(Object.keys(files).sort()).toEqual(['[Content_Types].xml', '_rels/.rels', 'docProps/core.xml', 'word/document.xml']);
    const doc = strFromU8(files['word/document.xml']);
    expect(doc).toContain('Un « accent » &amp; &lt;balise&gt;');
    expect((doc.match(/w:br w:type="page"/g) ?? []).length).toBe(2); // 3 pages → 2 sauts
    expect((doc.match(/<w:p>/g) ?? []).length).toBe(2 + 1 + 1 + 2); // titre, texte, page vide (1 paragraphe vide), fin, + 2 sauts
    for (const [name, data] of Object.entries(files)) {
      const text = strFromU8(data);
      expect(text.startsWith('<?xml'), name).toBe(true);
      // bonne formation : chaque balise ouvrante est refermée dans le bon ordre
      const stack: string[] = [];
      for (const m of text.replace(/<\?[^>]*\?>/g, '').matchAll(/<(\/?)([A-Za-z0-9:_.-]+)((?:"[^"]*"|[^>"])*?)(\/?)>/g)) {
        if (m[4]) continue; // balise qui se ferme toute seule
        if (m[1]) expect(stack.pop(), name).toBe(m[2]);
        else stack.push(m[2]);
      }
      expect(stack, name).toEqual([]);
    }
    expect(strFromU8(files['docProps/core.xml'])).toContain('<dc:title>Mon doc</dc:title>');
  });
  it('caractères de contrôle retirés, échappements', () => {
    expect(xmlEscape('a\u0000b\u0008c&d<e>f')).toBe('abc&amp;d&lt;e&gt;f');
  });
});
