import { Hono } from 'hono';
import type { HonoEnv } from '../context.js';
import { HttpError } from '../lib/errors.js';
import { enforce, keyFor } from '../lib/ratelimit.js';
import { readJson } from '../lib/request.js';
import { optionalAuth } from '../middleware.js';
import { resolvePublicPage, usernameAvailability } from '../services/pages.js';
import { createReport, eventInput, recordEvent, reportInput } from '../services/engagement.js';
import { readImage } from '../services/media.js';

export const publicRoutes = new Hono<HonoEnv>();

/**
 * Page publique : mise en cache courte par le CDN UNIQUEMENT (`Vercel-CDN-Cache-Control`). Le navigateur, lui, revalide à chaque
 * visite : sans cela il pourrait afficher pendant une minute une page déjà suspendue ou un badge retiré.
 */
publicRoutes.get('/pages/:username', async (c) => {
  const deps = c.get('deps');
  await enforce(deps.db, keyFor('page-read', c.get('ip')), 600, 60, deps.now());
  const result = await resolvePublicPage(deps, c.req.param('username'));
  if (result.state === 'published') {
    c.header('Cache-Control', 'public, max-age=0, must-revalidate');
    c.header('Vercel-CDN-Cache-Control', 'max-age=10, stale-while-revalidate=30');
  }
  return c.json(result);
});

publicRoutes.post('/pages/:username/events', optionalAuth, async (c) => {
  const deps = c.get('deps');
  await enforce(deps.db, keyFor('events-ip', c.get('ip')), 1200, 3600, deps.now());
  const input = await readJson(c, eventInput, 2_000);
  await recordEvent(c, deps, c.req.param('username'), input);
  return c.body(null, 204);
});

publicRoutes.post('/pages/:username/reports', async (c) => {
  const input = await readJson(c, reportInput, 4_000);
  await createReport(c, c.get('deps'), c.req.param('username'), input);
  return c.body(null, 204);
});

publicRoutes.get('/usernames/check', optionalAuth, async (c) => {
  const deps = c.get('deps');
  await enforce(deps.db, keyFor('username-check', c.get('ip')), 120, 60, deps.now());
  const username = c.req.query('username') ?? '';
  if (username.length > 40) return c.json({ available: false, reason: 'invalid' });
  return c.json(await usernameAvailability(deps, username, c.get('auth')?.user.id ?? null));
});

/** Images téléversées : adresse non devinable, contenu immuable, aucune exécution possible (nosniff + CSP + sandbox). */
publicRoutes.get('/media/:id', async (c) => {
  const id = c.req.param('id');
  if (!/^med_[a-f0-9]{20}$/.test(id)) throw new HttpError(404, 'not_found');
  const img = await readImage(c.get('deps'), id);
  if (!img) throw new HttpError(404, 'not_found');
  return new Response(new Uint8Array(img.data), {
    headers: {
      'Content-Type': img.mime, 'Cache-Control': 'public, max-age=31536000, immutable', 'Content-Security-Policy': "default-src 'none'; sandbox",
      'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin',
    },
  });
});
