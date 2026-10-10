import { defineConfig, devices } from '@playwright/test';

// Utilise Microsoft Edge installé sur la machine (aucun téléchargement de navigateur).
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 1,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4173', trace: 'retain-on-failure', channel: 'msedge' },
  webServer: { command: 'npm run build && npm run preview -- --port 4173 --strictPort', url: 'http://localhost:4173', reuseExistingServer: true, timeout: 180_000 },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel: 'msedge', viewport: { width: 1360, height: 860 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'], channel: 'msedge' } },
  ],
});
