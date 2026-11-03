import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { PDFLinkService } from 'pdfjs-dist/web/pdf_viewer.mjs';
import { t } from '../i18n/fr';
import { h } from './dom';

interface OutlineNode {
  title: string;
  dest?: string | unknown[] | null;
  url?: string | null;
  items?: OutlineNode[];
  bold?: boolean;
  italic?: boolean;
}

/** Signets (plan du document) : arbre repliable ; un clic mène à la destination. */
export async function buildOutline(pdf: PDFDocumentProxy, linkService: PDFLinkService): Promise<HTMLElement> {
  const outline = (await pdf.getOutline().catch(() => null)) as OutlineNode[] | null;
  const root = h('div', { class: 'outline', 'aria-label': t.panels.bookmarks });
  if (!outline || outline.length === 0) {
    root.append(h('p', { class: 'empty' }, t.panels.noBookmarks));
    return root;
  }
  const render = (nodes: OutlineNode[], depth: number): HTMLElement => {
    const ul = h('ul', { role: depth === 0 ? 'tree' : 'group' });
    for (const node of nodes) {
      const label = h('button', { class: 'outline-link', onclick: () => go(node) }, node.title || '—');
      if (node.bold) label.style.fontWeight = '600';
      if (node.italic) label.style.fontStyle = 'italic';
      const li = h('li', { role: 'treeitem' });
      if (node.items?.length) {
        const details = h('details', { open: depth < 1 });
        details.append(h('summary', {}, label), render(node.items, depth + 1));
        li.append(details);
      } else {
        li.append(label);
      }
      ul.append(li);
    }
    return ul;
  };
  const go = (node: OutlineNode) => {
    if (node.dest) void linkService.goToDestination(node.dest as string | unknown[]);
    else if (node.url) window.open(node.url, '_blank', 'noopener,noreferrer');
  };
  root.append(render(outline, 0));
  return root;
}
