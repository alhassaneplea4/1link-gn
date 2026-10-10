/**
 * Point d'entrée Vercel : toutes les requêtes /api/* arrivent ici et sont servies par l'application Hono.
 * L'instance (pool PostgreSQL, configuration) est créée une seule fois puis réutilisée entre les requêtes.
 */
import { createRuntimeApp } from '../server/runtime.js';

let runtime: ReturnType<typeof createRuntimeApp> | undefined;

export default {
  async fetch(request: Request): Promise<Response> {
    try {
      runtime ??= createRuntimeApp();
      return (await runtime).app.fetch(request);
    } catch (e) {
      runtime = undefined; // une configuration invalide ne doit pas rester en cache
      console.error('[api] démarrage impossible :', (e as Error).message);
      return Response.json({ message: 'server_misconfigured' }, { status: 500 });
    }
  },
};
