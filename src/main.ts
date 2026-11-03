import './style.css';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app/app';
import { toast } from './app/dom';
import { applyTheme, loadSettings } from './app/settings';
import { t } from './i18n/fr';

applyTheme(loadSettings().theme);

const root = document.getElementById('app')!;
const app = new App(root);

// Exposé pour les tests de bout en bout (le build de production n'a pas d'import dynamique de /src).
(window as unknown as { cigale: unknown }).cigale = { app, version: __APP_VERSION__ };

if (import.meta.env.PROD) {
  const update = registerSW({
    onNeedRefresh: () => toast(t.toast.updateReady, { label: t.toast.reload, run: () => void update(true) }),
  });
}
