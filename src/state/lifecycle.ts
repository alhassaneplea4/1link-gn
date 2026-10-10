/** Registre de réinitialisation : les stores liés à l'utilisateur s'y enregistrent et sont vidés à la déconnexion. */
const resetters = new Set<() => void>();

export const registerReset = (fn: () => void) => {
  resetters.add(fn);
  return () => void resetters.delete(fn);
};

export const resetUserScopedState = () => resetters.forEach((fn) => fn());
