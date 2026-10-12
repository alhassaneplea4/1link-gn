/**
 * Génère les icônes de lancement et les écrans de démarrage Android à partir du logo 1Link.
 *   node mobile/scripts/make-icons.mjs
 */
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const { chromium } = createRequire(resolve(root, 'package.json'))('@playwright/test');
const res = resolve(here, '../android/app/src/main/res');

const FROM = '#2563EB';
const TO = '#7C3AED';
const defs = `<defs><linearGradient id="g" x1="4" y1="2" x2="44" y2="46" gradientUnits="userSpaceOnUse"><stop stop-color="${FROM}"/><stop offset="1" stop-color="${TO}"/></linearGradient></defs>`;
const glyph = '<path d="M14.5 17.5 22 11.5V34h8" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="36" cy="34" r="3.1" fill="none" stroke="#fff" stroke-width="2.6"/>';
/** variant : legacy (coins arrondis), round (cercle), adaptive (plein cadre, glyphe dans la zone de sécurité). */
const svg = (variant) => {
  const shape = variant === 'round' ? '<circle cx="24" cy="24" r="24" fill="url(#g)"/>' : variant === 'legacy' ? '<rect width="48" height="48" rx="11" fill="url(#g)"/>' : '<rect width="48" height="48" fill="url(#g)"/>';
  const g = variant === 'adaptive' ? `<g transform="translate(24 24) scale(0.78) translate(-24 -24)">${glyph}</g>` : variant === 'round' ? `<g transform="translate(24 24) scale(0.86) translate(-24 -24)">${glyph}</g>` : glyph;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="100%" height="100%">${defs}${shape}${g}</svg>`;
};

const channel = process.env.PW_CHANNEL === 'chromium' ? undefined : (process.env.PW_CHANNEL ?? 'msedge');
const browser = await chromium.launch({ channel });
const shot = async (html, w, h, file) => {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.setContent(`<style>html,body{margin:0;background:transparent}</style>${html}`);
  writeFileSync(resolve(res, file), await page.screenshot({ type: 'png', omitBackground: true }));
  await page.close();
};

const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, k] of Object.entries(dens)) {
  const legacy = Math.round(48 * k);
  const adaptive = Math.round(108 * k);
  await shot(`<div style="width:${legacy}px;height:${legacy}px">${svg('legacy')}</div>`, legacy, legacy, `mipmap-${d}/ic_launcher.png`);
  await shot(`<div style="width:${legacy}px;height:${legacy}px">${svg('round')}</div>`, legacy, legacy, `mipmap-${d}/ic_launcher_round.png`);
  await shot(`<div style="width:${adaptive}px;height:${adaptive}px">${svg('adaptive')}</div>`, adaptive, adaptive, `mipmap-${d}/ic_launcher_foreground.png`);
}

const splash = (w, h) => {
  const s = Math.round(Math.min(w, h) * 0.34);
  return `<div style="width:${w}px;height:${h}px;display:grid;place-items:center;background:linear-gradient(135deg,${FROM},${TO})"><div style="display:grid;justify-items:center;gap:${Math.round(s * 0.16)}px;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#fff"><div style="width:${s}px;height:${s}px;border-radius:${Math.round(s * 0.28)}px;overflow:hidden;box-shadow:0 ${Math.round(s * 0.1)}px ${Math.round(s * 0.3)}px rgba(0,0,0,.3)">${svg('adaptive').replace('scale(0.78)', 'scale(0.95)')}</div><div style="font-size:${Math.round(s * 0.3)}px;font-weight:800;letter-spacing:-1px">1Link</div></div></div>`;
};
const port = { mdpi: [320, 480], hdpi: [480, 800], xhdpi: [720, 1280], xxhdpi: [960, 1600], xxxhdpi: [1280, 1920] };
for (const [d, [w, h]] of Object.entries(port)) {
  await shot(splash(w, h), w, h, `drawable-port-${d}/splash.png`);
  await shot(splash(h, w), h, w, `drawable-land-${d}/splash.png`);
}
await shot(splash(1080, 1080), 1080, 1080, 'drawable/splash.png');
await browser.close();
writeFileSync(resolve(res, 'values/ic_launcher_background.xml'), '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#4A4BE8</color>\n</resources>\n');
console.log('Icônes et écrans de démarrage Android générés.');
