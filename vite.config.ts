/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

// /api est servi par le serveur (fonction Vercel en production ; serveur local en développement, proxy ici).
const apiProxy = { '/api': { target: process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:8787', changeOrigin: false } };

// Les en-têtes de sécurité (CSP…) de vercel.json s'appliquent aussi à `vite preview` : les tests e2e détectent ainsi toute violation avant le déploiement.
const vercel = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8')) as { headers: { source: string; headers: { key: string; value: string }[] }[] };
// (HSTS et upgrade-insecure-requests n'ont de sens qu'en HTTPS : écartés pour l'aperçu local en HTTP.)
const securityHeaders = Object.fromEntries(
  (vercel.headers.find((h) => h.source === '/(.*)')?.headers ?? [])
    .filter((h) => h.key !== 'Strict-Transport-Security')
    .map((h) => [h.key, h.value.replace('; upgrade-insecure-requests', '')]),
);

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: { target: 'es2022', sourcemap: false },
  server: { proxy: apiProxy },
  preview: { proxy: apiProxy, headers: securityHeaders },
  test: {
    globals: true,
    globalSetup: ['./server/testing/global-setup.ts'],
    pool: 'threads',
    testTimeout: 20000,
    hookTimeout: 60000,
    projects: [
      { extends: true, test: { name: 'web', environment: 'jsdom', setupFiles: ['./src/test/setup.ts'], css: false, include: ['src/**/*.test.{ts,tsx}'] } },
      { extends: true, test: { name: 'server', environment: 'node', include: ['server/**/*.test.ts'] } },
    ],
  },
});
