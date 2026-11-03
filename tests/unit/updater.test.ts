import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isTranslocatedPath, runUpdateCheck, type AvailableUpdate, type Deps } from '../../src/app/updater';

/** Verrou partagé, comme celui de l'application (commun à toutes les fenêtres). */
let locked = false;

function deps(overrides: Partial<Deps> = {}, update: AvailableUpdate | null = null) {
  const log: string[] = [];
  const d: Deps = {
    check: async () => update,
    currentVersion: async () => '1.0.0',
    ask: vi.fn(async (m: string) => (log.push(`ask:${m}`), true)),
    tell: vi.fn(async (m: string) => void log.push(`tell:${m}`)),
    status: vi.fn((m: string) => void log.push(`status:${m}`)),
    relaunch: vi.fn(async () => void log.push('relaunch')),
    beforeRestart: vi.fn(async () => void log.push('save')),
    isTranslocated: async () => false,
    tryLock: () => (locked ? false : (locked = true)),
    unlock: () => void (locked = false),
    ...overrides,
  };
  return { d, log };
}

const update = (install = async (p: (r: number, t: number | undefined) => void) => (p(50, 100), p(100, 100))): AvailableUpdate => ({ version: '1.1.0', install });

describe('mise à jour automatique', () => {
  beforeEach(() => void (locked = false));

  it('à jour : silencieux au démarrage, message à la demande', async () => {
    const quiet = deps();
    expect(await runUpdateCheck(quiet.d, true)).toBe('none');
    expect(quiet.d.tell).not.toHaveBeenCalled();
    const asked = deps();
    expect(await runUpdateCheck(asked.d, false)).toBe('none');
    expect(asked.log).toEqual(['tell:Vous utilisez la dernière version de Cigale (1.0.0).']);
  });

  it('échec de la vérification (hors connexion) : silencieux au démarrage, message à la demande', async () => {
    const boom = () => Promise.reject(new Error('réseau'));
    const quiet = deps({ check: boom });
    expect(await runUpdateCheck(quiet.d, true)).toBe('error');
    expect(quiet.d.tell).not.toHaveBeenCalled();
    const asked = deps({ check: boom });
    expect(await runUpdateCheck(asked.d, false)).toBe('error');
    expect(asked.log[0]).toContain('Impossible de vérifier les mises à jour : réseau');
  });

  it('nouvelle version acceptée : téléchargement, sauvegarde, puis redémarrage', async () => {
    const { d, log } = deps({}, update());
    expect(await runUpdateCheck(d, true)).toBe('installed');
    expect(log[0]).toContain('La version 1.1.0 de Cigale est disponible (vous avez la 1.0.0)');
    expect(log).toContain('status:Téléchargement de la mise à jour : 50 %');
    expect(log.slice(-3)).toEqual(['status:Mise à jour installée : redémarrage…', 'save', 'relaunch']);
  });

  it('nouvelle version refusée : rien n’est installé', async () => {
    const install = vi.fn(async () => undefined);
    const { d } = deps({ ask: async () => false }, update(install));
    expect(await runUpdateCheck(d, false)).toBe('declined');
    expect(install).not.toHaveBeenCalled();
    expect(d.relaunch).not.toHaveBeenCalled();
  });

  it('échec de l’installation : message d’erreur, pas de redémarrage', async () => {
    const { d, log } = deps({}, update(async () => Promise.reject(new Error('signature invalide'))));
    expect(await runUpdateCheck(d, false)).toBe('error');
    expect(log.some((l) => l.includes('La mise à jour a échoué : signature invalide'))).toBe(true);
    expect(d.relaunch).not.toHaveBeenCalled();
  });

  it('une sauvegarde qui échoue n’empêche pas le redémarrage', async () => {
    const { d } = deps({ beforeRestart: () => Promise.reject(new Error('disque plein')) }, update());
    expect(await runUpdateCheck(d, true)).toBe('installed');
    expect(d.relaunch).toHaveBeenCalled();
  });

  it('lancée depuis le .dmg ou Téléchargements (lecture seule) : explique quoi faire, sans tenter l’installation', async () => {
    const install = vi.fn(async () => undefined);
    const { d, log } = deps({ isTranslocated: async () => true }, update(install));
    expect(await runUpdateCheck(d, true)).toBe('error');
    expect(install).not.toHaveBeenCalled();
    expect(d.ask).not.toHaveBeenCalled();
    expect(log[0]).toContain('La version 1.1.0 de Cigale est disponible');
    expect(log[0]).toContain('dossier Applications');
  });

  it('reconnaît le chemin d’une application « translocalisée » par macOS', () => {
    expect(isTranslocatedPath('/private/var/folders/nk/x/T/AppTranslocation/9E56DF82-6/d/Cigale.app/Contents/Resources')).toBe(true);
    expect(isTranslocatedPath('/Applications/Cigale.app/Contents/Resources')).toBe(false);
  });

  it('une seule mise à jour à la fois : un deuxième clic pendant le téléchargement n’ouvre pas une deuxième fenêtre', async () => {
    let finish!: () => void;
    const slow = update(() => new Promise<void>((r) => (finish = r)));
    const first = deps({}, slow);
    const second = deps({}, slow);
    const running = runUpdateCheck(first.d, false);
    await new Promise((r) => setTimeout(r, 0));
    expect(await runUpdateCheck(second.d, false)).toBe('busy');
    expect(second.d.ask).not.toHaveBeenCalled();
    expect(second.log).toEqual(['tell:Une mise à jour est déjà en cours : Cigale redémarrera tout seul quand elle sera installée.']);
    // La vérification discrète du démarrage, elle, ne dit rien.
    const quiet = deps({}, slow);
    expect(await runUpdateCheck(quiet.d, true)).toBe('busy');
    expect(quiet.d.tell).not.toHaveBeenCalled();
    finish();
    expect(await running).toBe('installed');
    expect(first.d.ask).toHaveBeenCalledTimes(1);
  });

  it('après une installation réussie, plus aucune proposition (Cigale redémarre)', async () => {
    const { d } = deps({}, update());
    expect(await runUpdateCheck(d, true)).toBe('installed');
    const again = deps({}, update());
    expect(await runUpdateCheck(again.d, true)).toBe('busy');
    expect(again.d.ask).not.toHaveBeenCalled();
  });

  it('refus ou échec : on peut chercher de nouveau', async () => {
    expect(await runUpdateCheck(deps({ ask: async () => false }, update()).d, false)).toBe('declined');
    expect(await runUpdateCheck(deps({}, update(async () => Promise.reject(new Error('réseau')))).d, false)).toBe('error');
    expect(await runUpdateCheck(deps({}, update()).d, false)).toBe('installed');
  });

  it('la fenêtre « Installer » reçoit le détail de la nouvelle version', async () => {
    const withNotes: AvailableUpdate = { ...update(), notes: '### Corrigé\n- Une chose' };
    const { d } = deps({}, withNotes);
    await runUpdateCheck(d, false);
    expect(d.ask).toHaveBeenCalledWith(expect.stringContaining('1.1.0'), '### Corrigé\n- Une chose');
  });
});

import { notesLines } from '../../src/app/updater';
import { readFileSync } from 'node:fs';

describe('configuration des mises à jour (ce qui, mal réglé, casserait toutes les copies installées)', () => {
  const conf = JSON.parse(readFileSync(new URL('../../src-tauri/tauri.conf.json', import.meta.url), 'utf8'));
  it('clé publique, point d’accès GitHub de Cigale, archives de mise à jour', () => {
    expect(conf.plugins.updater.pubkey).toMatch(/^[A-Za-z0-9+/=]{80,}$/);
    expect(conf.plugins.updater.endpoints).toEqual(['https://github.com/paulbachmann13/cigale/releases/latest/download/latest.json']);
    expect(conf.bundle.createUpdaterArtifacts).toBe(true);
  });
  it('la fenêtre a le droit d’utiliser le module de mise à jour', () => {
    const caps = JSON.parse(readFileSync(new URL('../../src-tauri/capabilities/default.json', import.meta.url), 'utf8'));
    expect(caps.permissions).toContain('updater:default');
  });
  it('le workflow publie le .dmg, l’archive signée et latest.json, et vérifie l’étiquette', () => {
    const wf = readFileSync(new URL('../../.github/workflows/mac.yml', import.meta.url), 'utf8');
    for (const needle of ['TAURI_SIGNING_PRIVATE_KEY', 'latest.json', 'app.tar.gz.sig', 'ne correspond pas à la version']) expect(wf).toContain(needle);
  });
});

describe('notes de version affichées avant l’installation', () => {
  it('met en forme le CHANGELOG', () => {
    expect(notesLines('### Ajouté\n- **Gras** et texte\n\n### Corrigé\n- Autre')).toEqual([
      { heading: true, text: 'Ajouté' },
      { heading: false, text: 'Gras et texte' },
      { heading: true, text: 'Corrigé' },
      { heading: false, text: 'Autre' },
    ]);
  });
});
