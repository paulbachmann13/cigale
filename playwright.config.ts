import { defineConfig, devices } from '@playwright/test';

/** Les tests tournent sur le build de production (service worker compris), sous le même chemin que GitHub Pages. */
const PORT = 4173;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/cigale/`,
    locale: 'fr-FR',
    acceptDownloads: true,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // Safari (WebKit) : toute la batterie, pas seulement la fumée
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'webkit-ipad', use: { ...devices['iPad (gen 7) landscape'] }, testMatch: /smoke\.spec\.ts/ },
  ],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT}`,
    env: { CIGALE_BASE: '/cigale/' },
    url: `http://localhost:${PORT}/cigale/`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
});
