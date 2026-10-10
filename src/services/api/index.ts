import type { Api } from './types';
import { demoAuth } from './demo/auth';
import { demoPage } from './demo/page';
import { demoAnalytics } from './demo/analytics';
import { demoBilling } from './demo/billing';
import { demoAdmin } from './demo/admin';
import { demoRealtime } from './demo/realtime';
import { httpApi } from './http';

const demoApi: Api = { mode: 'demo', auth: demoAuth, page: demoPage, analytics: demoAnalytics, billing: demoBilling, admin: demoAdmin, realtime: demoRealtime };

/**
 * Point d'accès unique aux données, choisi par VITE_API_MODE au moment du build.
 * La condition est écrite avec `import.meta.env` directement afin que le bundler l'évalue statiquement :
 * un build `VITE_API_MODE=http` n'embarque alors AUCUN adaptateur de démonstration.
 */
export const api: Api = import.meta.env.VITE_API_MODE === 'http' ? httpApi : demoApi;
export type { Api } from './types';
