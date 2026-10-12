/**
 * Génère les images de marque à partir du logo (public/favicon.svg) : icônes d'installation (PWA/Android/iOS) et image
 * de partage par défaut (Open Graph). À relancer seulement si le logo change :  node scripts/brand-assets.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const out = resolve('public');
mkdirSync(out, { recursive: true });
const FROM = '#2563EB';
const TO = '#7C3AED';
const glyph = (stroke = 5) => `<path d="M14.5 17.5 22 11.5V34h8" fill="none" stroke="#fff" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"/><circle cx="36" cy="34" r="3.1" fill="none" stroke="#fff" stroke-width="2.6"/>`;
const defs = `<defs><linearGradient id="g" x1="4" y1="2" x2="44" y2="46" gradientUnits="userSpaceOnUse"><stop stop-color="${FROM}"/><stop offset="1" stop-color="${TO}"/></linearGradient></defs>`;

/** Icône : `rounded` = coins arrondis du logo ; `safe` = glyphe réduit pour les icônes « maskable » (zone de sécurité de 80 %). */
const icon = ({ rounded, safe }) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="100%" height="100%">${defs}<rect width="48" height="48" ${rounded ? 'rx="14"' : ''} fill="url(#g)"/>${safe ? `<g transform="translate(24 24) scale(0.7) translate(-24 -24)">${glyph()}</g>` : glyph()}</svg>`;

const og = `<div style="width:1200px;height:630px;display:flex;align-items:center;gap:56px;padding:0 96px;box-sizing:border-box;background:radial-gradient(900px 500px at 85% 0%,rgba(255,255,255,.22),transparent 60%),linear-gradient(120deg,${FROM},${TO});font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#fff">
  <div style="width:210px;height:210px;flex:none;border-radius:56px;background:#fff;display:grid;place-items:center;box-shadow:0 24px 60px rgba(0,0,0,.28)"><div style="width:150px;height:150px">${icon({ rounded: false, safe: false }).replace(/fill="url\(#g\)"/, 'fill="url(#g)" rx="12"')}</div></div>
  <div><div style="font-size:104px;font-weight:800;letter-spacing:-3px;line-height:1">1Link</div>
  <div style="font-size:44px;font-weight:600;margin-top:18px;opacity:.95;max-width:720px;line-height:1.2">Un lien, pour toute votre présence.</div>
  <div style="font-size:28px;margin-top:26px;opacity:.85">Liens · réseaux · services · contacts — sur une seule page</div></div></div>`;

const channel = process.env.PW_CHANNEL === 'chromium' ? undefined : (process.env.PW_CHANNEL ?? 'msedge');
const browser = await chromium.launch({ channel });
const shot = async (html, w, h, file, transparent = false) => {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.setContent(`<style>html,body{margin:0;background:${transparent ? 'transparent' : '#fff'}}</style>${html}`);
  writeFileSync(resolve(out, file), await page.screenshot({ type: 'png', omitBackground: transparent }));
  await page.close();
};
const sized = (svg, s) => `<div style="width:${s}px;height:${s}px">${svg}</div>`;

await shot(sized(icon({ rounded: true }), 192), 192, 192, 'icon-192.png', true);
await shot(sized(icon({ rounded: true }), 512), 512, 512, 'icon-512.png', true);
await shot(sized(icon({ rounded: false, safe: true }), 512), 512, 512, 'icon-maskable-512.png');
await shot(sized(icon({ rounded: false }), 180), 180, 180, 'apple-touch-icon.png');
await shot(sized(icon({ rounded: false, safe: true }), 1024), 1024, 1024, 'icon-source-1024.png');
await shot(og, 1200, 630, 'og-default.png');
await browser.close();
console.log('Images de marque générées dans public/.');
