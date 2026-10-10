import { httpApi } from './http';

/** Point d'accès unique aux données : l'API du serveur (PostgreSQL). Il n'existe plus d'adaptateur local ni de données d'exemple. */
export const api = httpApi;
export type { Api } from './types';
