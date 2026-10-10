import { defineConfig, devices } from '@playwright/test';

// Navigateur : Microsoft Edge installé sur la machine (aucun téléchargement). En CI Linux : `npx playwright install chromium`
// puis définir PW_CHANNEL=chromium.
const channel = process.env.PW_CHANNEL === 'chromium' ? undefined : (process.env.PW_CHANNEL ?? 'msedge');

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 1,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  reporter: [['list']],
  // PostgreSQL réel + serveur d'API réel (voir e2e/global-setup.ts). L'interface les atteint par proxy sur /api.
  globalSetup: './e2e/global-setup.ts',
  use: { baseURL: 'http://localhost:4173', trace: 'retain-on-failure', channel },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: false, // jamais de serveur obsolète réutilisé : un ancien build fausserait les résultats
    timeout: 240_000,
    env: { API_PROXY_TARGET: 'http://127.0.0.1:8788' },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel, viewport: { width: 1360, height: 860 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'], channel } },
  ],
});
