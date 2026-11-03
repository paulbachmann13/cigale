import { parseChangelog, stripMarkup } from '../data/changelog';
import { formatSize } from '../data/recent';
import { fmt, t } from '../i18n/fr';
import { clearRecents, loadRecents } from '../storage/recent';
import changelogMd from '../../CHANGELOG.md?raw';
import type { App } from './app';
import { showCustom } from './dialogs';
import { h } from './dom';
import { type DefaultZoom, type ThemeChoice, loadSettings, saveSettings } from './settings';

/** Écran d'accueil : Ouvrir, Combiner, Récents, Reprendre, Paramètres, version et nouveautés. */
export function buildHome(app: App): HTMLElement {
  const recents = loadRecents();
  const list = h('ul', { class: 'recent-list', id: 'recent-list' });
  for (const r of recents) {
    list.append(
      h(
        'li',
        {},
        h(
          'button',
          { class: 'recent', 'data-name': r.name, onclick: () => void app.openRecent(r.id, r.name) },
          h('span', { class: 'recent-name' }, r.name),
          h('span', { class: 'recent-meta' }, `${formatSize(r.size)} · ${new Date(r.openedAt).toLocaleDateString('fr-FR')}`),
        ),
      ),
    );
  }

  const section = h(
    'section',
    { id: 'home', class: 'home' },
    h(
      'div',
      { class: 'home-inner' },
      h('img', { class: 'home-logo', src: `${import.meta.env.BASE_URL}icon.svg`, alt: '', width: 72, height: 72 }),
      h('h1', {}, t.app.name),
      h('p', { class: 'tagline' }, t.app.tagline),
      h('h2', {}, t.home.title),
      h(
        'div',
        { class: 'home-actions' },
        h('button', { id: 'home-open', class: 'big primary', onclick: () => void app.openDialog() }, t.home.open),
        h('button', { id: 'home-combine', class: 'big', disabled: true, title: t.home.combineSoon }, t.home.combine, h('small', {}, t.home.combineSoon)),
      ),
      h('p', { class: 'hint' }, t.home.openHint),
      h('h2', {}, t.home.recents),
      recents.length ? list : h('p', { class: 'empty', id: 'no-recents' }, t.home.noRecents),
      h('p', { class: 'hint' }, t.home.recentsPrivacy),
      recents.length
        ? h('button', { class: 'link', id: 'clear-recents', onclick: () => void clearRecents().then(() => app.refreshHome()) }, t.home.clearRecents)
        : null,
      h('h2', {}, t.home.resume),
      h('p', { class: 'empty' }, t.home.resumeSoon),
      h(
        'footer',
        { class: 'home-footer' },
        h('button', { id: 'home-settings', class: 'link', onclick: openSettings }, t.home.settings),
        h('button', { id: 'home-news', class: 'link', onclick: openWhatsNew }, t.home.whatsNew),
        h('span', { id: 'app-version' }, fmt(t.home.version, { version: __APP_VERSION__ })),
      ),
      h('p', { class: 'hint' }, t.home.offline),
    ),
  );
  return section;
}

function openWhatsNew() {
  const body = h('div', { class: 'news' });
  for (const entry of parseChangelog(changelogMd).slice(0, 8)) {
    body.append(h('h3', {}, `${entry.version} — ${entry.date}`));
    for (const sec of entry.sections) {
      body.append(h('h4', {}, sec.title));
      body.append(h('ul', {}, ...sec.items.map((i) => h('li', {}, stripMarkup(i)))));
    }
  }
  showCustom(t.whatsNew.title, body, t.whatsNew.close, 'dialog-news');
}

function openSettings() {
  const s = loadSettings();
  const theme = h(
    'select',
    { id: 'setting-theme' },
    h('option', { value: 'auto' }, t.settings.themeAuto),
    h('option', { value: 'light' }, t.settings.themeLight),
    h('option', { value: 'dark' }, t.settings.themeDark),
  );
  theme.value = s.theme;
  theme.onchange = () => saveSettings({ ...loadSettings(), theme: theme.value as ThemeChoice });
  const zoom = h(
    'select',
    { id: 'setting-zoom' },
    h('option', { value: 'page-width' }, 'Ajuster à la largeur'),
    h('option', { value: 'page-fit' }, 'Ajuster à la page'),
    h('option', { value: 'page-actual' }, 'Taille réelle (100 %)'),
  );
  zoom.value = s.defaultZoom;
  zoom.onchange = () => saveSettings({ ...loadSettings(), defaultZoom: zoom.value as DefaultZoom });
  showCustom(
    t.settings.title,
    h('div', { class: 'form' }, h('label', {}, t.settings.theme, theme), h('label', {}, t.settings.defaultZoom, zoom)),
    t.settings.close,
    'dialog-settings',
  );
}
