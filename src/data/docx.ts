/**
 * Fichier Word (.docx) minimal et valide : une suite de paragraphes, avec un saut de page entre les pages du PDF d'origine.
 * Un .docx est une archive zip de quelques fichiers XML ; aucune bibliothèque de plus. Logique pure.
 */
import { zipSync } from 'fflate';

/** Texte sûr pour du XML : caractères de contrôle retirés, &, <, > échappés. */
export function xmlEscape(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const encoder = new TextEncoder();
const xml = (s: string) => encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${s}`);

const paragraph = (text: string) => `<w:p><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr><w:r><w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p>`;
const pageBreak = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';

/** `pages` : pour chaque page du PDF, ses paragraphes. `title` : nom du document (propriété du fichier Word). */
export function buildDocx(pages: readonly (readonly string[])[], title = ''): Uint8Array {
  const body = pages
    .map((paras, i) => (paras.length ? paras.map(paragraph).join('') : paragraph('')) + (i < pages.length - 1 ? pageBreak : ''))
    .join('');
  const document = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  return zipSync(
    {
      '[Content_Types].xml': xml('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>'),
      '_rels/.rels': xml('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>'),
      'docProps/core.xml': xml(`<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xmlEscape(title)}</dc:title><dc:creator>Cigale</dc:creator></cp:coreProperties>`),
      'word/document.xml': xml(document),
    },
    { level: 6 },
  );
}
