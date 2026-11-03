import { parseChangelog, stripMarkup } from '../data/changelog';
import { formatSize } from '../data/recent';
import { fmt, t } from '../i18n/fr';
import { deleteBackup, listBackups, readBackup } from '../storage/backups';
import { clearRecents, loadRecents } from '../storage/recent';
import { downloadBytes } from './save';
import changelogMd from '../../CHANGELOG.md?raw';
import type { App } from './app';
import { showCustom } from './dialogs';
import { h, toast } from './dom';
import { type IconName, icon } from './icons';
import { type DefaultZoom, type ThemeChoice, loadSettings, saveSettings } from './settings';

/** Écran d'accueil (même disposition que Grillon) : colonne colorée à gauche, tuiles d'actions et récents à droite. */
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

  const tile = (id: string, iconName: IconName, title: string, sub: string, onclick?: () => void, disabled = false) =>
    h(
      'button',
      { id, class: 'tile', type: 'button', disabled, onclick },
      h('span', { class: 'tile-icon' }, icon(iconName, 28)),
      h('span', { class: 'tile-text' }, h('strong', {}, title), h('small', {}, sub)),
    );

  const nav = h(
    'aside',
    { class: 'home-nav' },
    h('div', { class: 'home-brand' }, h('img', { src: `${import.meta.env.BASE_URL}icon.svg`, alt: '', width: 36, height: 36 }), t.app.name),
    h('button', { class: 'home-nav-item active', type: 'button' }, t.file.home),
    h('button', { class: 'home-nav-item', id: 'home-nav-open', type: 'button', onclick: () => void app.openDialog() }, t.file.open),
    h('button', { class: 'home-nav-item', id: 'home-versions', type: 'button', onclick: openVersions }, t.file.versions),
    h('button', { class: 'home-nav-item', id: 'home-settings', type: 'button', onclick: openSettings }, t.home.settings),
    h('button', { class: 'home-nav-item', id: 'home-news', type: 'button', onclick: openWhatsNew }, t.home.whatsNew),
    h('span', { class: 'home-spacer' }),
    h('span', { class: 'home-version', id: 'app-version' }, fmt(t.home.version, { version: __APP_VERSION__ })),
  );

  const main = h(
    'main',
    { class: 'home-main' },
    h('h1', {}, t.home.title),
    h('p', { class: 'home-sub' }, t.app.tagline),
    h(
      'div',
      { class: 'tiles' },
      tile('home-open', 'open', t.home.open, t.home.openHint, () => void app.openDialog()),
      tile('home-combine', 'duplicate', t.home.combine, t.home.combineSoon, undefined, true),
    ),
    h('h2', {}, t.home.recents),
    recents.length ? list : h('p', { class: 'empty', id: 'no-recents' }, t.home.noRecents),
    h('p', { class: 'hint' }, t.home.recentsPrivacy),
    recents.length ? h('button', { class: 'link', id: 'clear-recents', onclick: () => void clearRecents().then(() => app.refreshHome()) }, t.home.clearRecents) : null,
    h('p', { class: 'hint' }, t.home.offline),
  );

  return h('section', { id: 'home', class: 'home' }, nav, main);
}

export function openWhatsNew() {
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

export function openSettings() {
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

/** Liste des anciennes versions gardées avant chaque enregistrement qui remplace un fichier. */
export function openVersions() {
  const body = h('div', { class: 'versions' }, h('p', { class: 'hint' }, t.versions.hint));
  const list = h('ul', { class: 'recent-list', id: 'versions-list' });
  body.append(list);
  const render = async () => {
    list.replaceChildren();
    const items = await listBackups();
    if (!items.length) list.append(h('li', { class: 'empty' }, t.versions.none));
    for (const b of items) {
      list.append(
        h(
          'li',
          { class: 'version-row' },
          h('span', { class: 'recent-name' }, b.name),
          h('span', { class: 'recent-meta' }, `${formatSize(b.size)} · ${new Date(b.at).toLocaleString('fr-FR')}`),
          h('button', { class: 'link', onclick: () => void readBackup(b.id).then((bytes) => (bytes ? downloadBytes(b.name, bytes) : toast(t.versions.none))) }, t.versions.download),
          h('button', { class: 'link', onclick: () => void deleteBackup(b.id).then(render) }, t.versions.delete),
        ),
      );
    }
  };
  void render();
  showCustom(t.versions.title, body, t.versions.close, 'dialog-versions');
}
