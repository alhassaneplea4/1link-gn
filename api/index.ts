/**
 * Point d'entrée Vercel : toutes les requêtes /api/* arrivent ici et sont servies par l'application Hono.
 * L'instance (pool PostgreSQL, configuration) est créée une seule fois puis réutilisée entre les requêtes.
 */
import { createRuntimeApp } from '../server/runtime.js';

let runtime: ReturnType<typeof createRuntimeApp> | undefined;

/**
 * Les réécritures de vercel.json envoient ici `/sitemap.xml` et `/<pseudo>` (pour leurs balises de partage) : on les ramène
 * aux routes `/api/...` de l'application, que l'URL d'origine soit conservée ou non par la plateforme.
 */
function toApiRequest(request: Request): Request {
  const url = new URL(request.url);
  const p = url.pathname;
  if (p === '/api' || p.startsWith('/api/')) return request;
  url.pathname = p === '/sitemap.xml' ? '/api/sitemap.xml' : `/api/seo/${p.replace(/^\/+/, '')}`;
  return new Request(url, request);
}

export default {
  async fetch(request: Request): Promise<Response> {
    try {
      runtime ??= createRuntimeApp();
      return (await runtime).app.fetch(toApiRequest(request));
    } catch (e) {
      runtime = undefined; // une configuration invalide ne doit pas rester en cache
      console.error('[api] démarrage impossible :', (e as Error).message);
      return Response.json({ message: 'server_misconfigured' }, { status: 500 });
    }
  },
};
