/**
 * Pastilles des menus : nombre d'éléments qui attendent une action, par rubrique. Les valeurs viennent du serveur (jamais
 * conservées dans le navigateur) et sont rechargées à chaque navigation, au retour sur l'onglet, toutes les minutes et après
 * toute action qui modifie des données.
 */
import { create } from 'zustand';
import { api } from '@/services/api';
import { registerReset } from './lifecycle';

export type NavScope = 'user' | 'admin';
export type NavCounts = Record<string, number>;

interface BadgeState {
  user: NavCounts;
  admin: NavCounts;
  refresh(scope: NavScope): Promise<void>;
  clear(): void;
}

export const useBadges = create<BadgeState>()((set) => ({
  user: {},
  admin: {},
  refresh: async (scope) => {
    try {
      const counts = await (scope === 'admin' ? api.nav.adminBadges() : api.nav.userBadges());
      set({ [scope]: counts } as Partial<BadgeState>);
    } catch {
      /* une pastille manquante ne doit jamais gêner la navigation */
    }
  },
  clear: () => set({ user: {}, admin: {} }),
}));

registerReset(() => useBadges.getState().clear());

/** Émis par le client HTTP après toute écriture réussie : les pastilles se recalculent sans attendre la prochaine minute. */
export const MUTATION_EVENT = 'onelink:mutated';
