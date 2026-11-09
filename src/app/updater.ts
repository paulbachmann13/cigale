/**
 * Mises à jour automatiques de l'application Mac : à l'ouverture (discrètement), puis à la demande
 * (Fichier → Rechercher les mises à jour). Les versions sont des Releases GitHub signées.
 * La logique est séparée de Tauri (`Deps`) pour pouvoir être testée. Même conception que Grillon.
 */
import { fmt, t } from '../i18n/fr';
import { stripMarkup } from '../data/changelog';

export interface AvailableUpdate {
  version: string;
  /** Ce que la nouvelle version apporte (le CHANGELOG de cette version, écrit dans latest.json). */
  notes?: string;
  /** Télécharge et installe ; `onProgress` reçoit les octets reçus et le total (s'il est connu). */
  install(onProgress: (received: number, total: number | undefined) => void): Promise<void>;
}

export interface Deps {
  check(): Promise<AvailableUpdate | null>;
  currentVersion(): Promise<string>;
  ask(message: string, notes?: string): Promise<boolean>;
  tell(message: string): Promise<void>;
  /** Où en est la mise à jour ; `percent` si le total est connu. */
  status(message: string, kind?: 'info' | 'success' | 'error', percent?: number): void;
  relaunch(): Promise<void>;
  /** Dernière sauvegarde du travail non enregistré avant de redémarrer. */
  beforeRestart(): Promise<void>;
  /** Vrai si macOS exécute Cigale depuis un emplacement temporaire en lecture seule (lancé depuis le .dmg ou Téléchargements). */
  isTranslocated(): Promise<boolean>;
  tryLock(): boolean;
  unlock(): void;
}

/** Chemin d'une application lancée depuis le .dmg ou Téléchargements : macOS la copie (« App Translocation ») en lecture seule. */
export const isTranslocatedPath = (path: string): boolean => /\/AppTranslocation\//.test(path);

export type UpdateResult = 'none' | 'declined' | 'installed' | 'error' | 'busy';

let locked = false;
/** Verrou : une seule vérification / installation à la fois (application à une seule fenêtre). Après une installation réussie il reste pris : Cigale redémarre. */
export const updateLock = {
  tryLock: (): boolean => (locked ? false : (locked = true)),
  unlock: (): void => void (locked = false),
};

/**
 * Une seule vérification / installation à la fois. Sans cela, un clic sur « Rechercher les mises à jour » pendant le
 * téléchargement ouvrirait une deuxième fenêtre « Installer » (et un deuxième téléchargement).
 */
export async function runUpdateCheck(deps: Deps, silent: boolean): Promise<UpdateResult> {
  if (!deps.tryLock()) {
    if (!silent) await deps.tell(t.update.busy);
    return 'busy';
  }
  let result: UpdateResult = 'error';
  try {
    result = await checkAndInstall(deps, silent);
    return result;
  } finally {
    if (result !== 'installed') deps.unlock();
  }
}

/** Erreurs techniques (anglais) d'un serveur ou d'un réseau injoignable : on les remplace par une phrase claire. */
const UNREACHABLE = /could not fetch|release json|error sending request|network|dns|connect|timed? ?out|timeout|50[0-4]|gateway|unreachable|offline|failed to fetch/i;

/** Message affiché quand la vérification des mises à jour échoue. */
export function checkFailedMessage(err: unknown): string {
  const message = (err as Error)?.message ?? String(err);
  return UNREACHABLE.test(message) ? t.update.unreachable : fmt(t.update.checkFailed, { message });
}

/**
 * `silent` : vérification au démarrage (pas de message si tout est à jour ou si la vérification échoue,
 * par exemple hors connexion). Sinon (demande de l'utilisateur) on répond toujours.
 */
async function checkAndInstall(deps: Deps, silent: boolean): Promise<UpdateResult> {
  let update: AvailableUpdate | null;
  try {
    update = await deps.check();
  } catch (e) {
    if (!silent) await deps.tell(checkFailedMessage(e));
    return 'error';
  }
  if (!update) {
    if (!silent) await deps.tell(fmt(t.update.upToDate, { version: await deps.currentVersion() }));
    return 'none';
  }
  // Lancée depuis le .dmg ou Téléchargements, l'application ne peut pas se remplacer elle-même.
  if (await deps.isTranslocated().catch(() => false)) {
    await deps.tell(fmt(t.update.moveApp, { version: update.version }));
    return 'error';
  }
  if (!(await deps.ask(fmt(t.update.available, { version: update.version, current: await deps.currentVersion() }), update.notes))) return 'declined';
  try {
    deps.status(t.update.downloading);
    await update.install((received, total) => {
      const percent = total ? Math.min(100, Math.round((received / total) * 100)) : undefined;
      deps.status(percent !== undefined ? fmt(t.update.progress, { percent }) : t.update.downloading, 'info', percent);
    });
    deps.status(t.update.installed, 'success');
    await deps.beforeRestart().catch(() => undefined);
    await deps.relaunch();
    return 'installed';
  } catch (e) {
    deps.status(fmt(t.update.failed, { message: (e as Error)?.message ?? String(e) }), 'error');
    return 'error';
  }
}

/** Texte des notes d'une version (Markdown du CHANGELOG) en lignes simples pour l'affichage. */
export function notesLines(notes: string): { heading: boolean; text: string }[] {
  return notes
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => (l.startsWith('###') ? { heading: true, text: l.replace(/^#+\s*/, '') } : { heading: false, text: stripMarkup(l.replace(/^[-*]\s*/, '')) }));
}

/**
 * Panneau de progression : il couvre toute la fenêtre pendant le téléchargement, pour qu'on voie que la mise à jour avance
 * (un petit texte passerait inaperçu, et on recliquerait). Un échec le ferme et s'affiche dans un message.
 */
function progressPanel(): { show(message: string, percent?: number): void; hide(): void } {
  let backdrop: HTMLDivElement | null = null;
  let label: HTMLParagraphElement;
  let bar: HTMLProgressElement;
  return {
    show(message, percent) {
      if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.className = 'loading';
        backdrop.id = 'update-progress';
        const box = document.createElement('div');
        box.className = 'loading-box';
        const title = document.createElement('strong');
        title.textContent = t.update.progressTitle;
        label = document.createElement('p');
        bar = document.createElement('progress');
        bar.max = 100;
        const hint = document.createElement('p');
        hint.className = 'hint';
        hint.textContent = t.update.progressHint;
        box.append(title, label, bar, hint);
        backdrop.append(box);
        document.body.append(backdrop);
      }
      label.textContent = message;
      if (percent === undefined) bar.removeAttribute('value');
      else bar.value = percent;
    },
    hide() {
      backdrop?.remove();
      backdrop = null;
    },
  };
}

/** Dépendances réelles (application de bureau). */
export async function tauriDeps(beforeRestart: Deps['beforeRestart']): Promise<Deps> {
  const { check } = await import('@tauri-apps/plugin-updater');
  const { getVersion } = await import('@tauri-apps/api/app');
  const { invoke } = await import('@tauri-apps/api/core');
  const { confirmDialog, showMessage } = await import('./dialogs');
  const panel = progressPanel();
  return {
    async check() {
      const update = await check();
      if (!update) return null;
      return {
        version: update.version,
        notes: update.body,
        async install(onProgress) {
          let received = 0;
          let total: number | undefined;
          await update.downloadAndInstall((event) => {
            if (event.event === 'Started') total = event.data.contentLength;
            else if (event.event === 'Progress') onProgress((received += event.data.chunkLength), total);
          });
        },
      };
    },
    currentVersion: getVersion,
    async ask(text, notes) {
      const body = notes?.trim() ? `${text}\n\n${notesLines(notes).map((l) => (l.heading ? `\n${l.text}` : `• ${l.text}`)).join('\n')}` : text;
      return confirmDialog(t.app.name, body, t.update.install, t.update.later);
    },
    // Messages dans l'application (pas de fenêtre système : elle pouvait rester bloquée derrière les Nouveautés)
    tell: (text) => showMessage(t.app.name, text, 'dialog-update-message'),
    status(text, kind, percent) {
      if (kind === 'error') {
        panel.hide();
        void showMessage(t.app.name, text, 'dialog-update-error');
      } else panel.show(text, percent);
    },
    // Redémarrage maison (Rust) : celui du plugin crée une 2e instance, donc une 2e icône dans le Dock.
    relaunch: () => invoke<void>('relaunch_app'),
    beforeRestart,
    async isTranslocated() {
      const { resourceDir } = await import('@tauri-apps/api/path');
      return isTranslocatedPath(await resourceDir());
    },
    ...updateLock,
  };
}
