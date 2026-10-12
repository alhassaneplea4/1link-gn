import { Hono } from 'hono';
import { ZodError } from 'zod';
import type { Deps, HonoEnv } from './context.js';
import { appErrors } from './db/schema.js';
import { HttpError } from './lib/errors.js';
import { setRateLimitScale } from './lib/ratelimit.js';
import { fieldsFromZod } from './lib/request.js';
import { baseMiddleware, originGuard } from './middleware.js';
import { adminRoutes } from './routes/admin.js';
import { authRoutes } from './routes/auth.js';
import { meRoutes } from './routes/me.js';
import { publicRoutes } from './routes/public.js';
import { seoRoutes } from './routes/seo.js';
import { devRoutes, systemRoutes } from './routes/system.js';

/** Assemble l'API. Toutes les dépendances (base, e-mail, SMS, horloge) sont injectées : les tests exécutent ce même code. */
export function createApp(deps: Deps) {
  setRateLimitScale(deps.config.rateLimitScale);
  const app = new Hono<HonoEnv>().basePath('/api');

  app.use('*', async (c, next) => {
    c.set('deps', deps);
    await next();
  });
  app.use('*', baseMiddleware);
  app.use('*', originGuard);

  app.route('/auth', authRoutes);
  app.route('/me', meRoutes);
  app.route('/admin', adminRoutes);
  app.route('/', publicRoutes);
  app.route('/', systemRoutes);
  app.route('/', seoRoutes);
  if (deps.config.devRoutes) app.route('/dev', devRoutes);

  app.notFound((c) => c.json({ message: 'not_found' }, 404));

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json({ message: err.message, ...(err.fields ? { fields: err.fields } : {}) }, err.status as 400, err.headers);
    }
    if (err instanceof ZodError) return c.json({ message: 'invalid', fields: fieldsFromZod(err.issues) }, 422);
    // Erreur inattendue : détail dans les journaux et la table d'erreurs, jamais dans la réponse.
    console.error(`[api] ${c.req.method} ${new URL(c.req.url).pathname} (${c.get('requestId')}) :`, err);
    deps.defer(
      deps.db.insert(appErrors).values({ at: deps.now(), route: `${c.req.method} ${new URL(c.req.url).pathname}`.slice(0, 200), message: String((err as Error)?.message ?? err).slice(0, 500) }).then(() => undefined).catch(() => undefined),
    );
    return c.json({ message: 'server_error' }, 500);
  });

  return app;
}

export type App = ReturnType<typeof createApp>;
