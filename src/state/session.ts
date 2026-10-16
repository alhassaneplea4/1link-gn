/**
 * État de session. Il reflète UNIQUEMENT ce que renvoie la couche d'authentification (`api.auth`) :
 * il n'invente ni ne persiste d'identité côté navigateur. Les droits réels sont vérifiés par le backend ;
 * `can()` et les guards ne servent qu'à adapter l'expérience.
 */
import { create } from 'zustand';
import { api } from '@/services/api';
import { onUnauthorized } from '@/services/api/http/client';
import type { MfaMethod, Permission, Session, SignInResult, SignUpInput } from '@/models/auth';
import { resetUserScopedState } from './lifecycle';

export type SessionStatus = 'loading' | 'authenticated' | 'anonymous' | 'expired';

interface SessionState {
  status: SessionStatus;
  session: Session | null;
  init(): Promise<void>;
  signIn(email: string, password: string): Promise<SignInResult>;
  completeTwoFactor(challenge: string, code: string, method?: MfaMethod | 'recovery'): Promise<Session>;
  signUp(input: SignUpInput): Promise<Session>;
  signOut(): Promise<void>;
  setSession(session: Session): void;
  markExpired(): void;
  can(permission: Permission): boolean;
}

export const useSession = create<SessionState>((set, get) => ({
  status: 'loading',
  session: null,

  async init() {
    try {
      const session = await api.auth.getSession();
      set(session ? { status: 'authenticated', session } : { status: 'anonymous', session: null });
    } catch {
      set({ status: 'anonymous', session: null });
    }
  },

  async signIn(email, password) {
    const result = await api.auth.signIn(email, password);
    if (result.kind === 'session') set({ status: 'authenticated', session: result.session });
    return result;
  },

  async completeTwoFactor(challenge, code, method) {
    const session = await api.auth.completeTwoFactor(challenge, code, method);
    set({ status: 'authenticated', session });
    return session;
  },

  async signUp(input) {
    const session = await api.auth.signUp(input);
    set({ status: 'authenticated', session });
    return session;
  },

  async signOut() {
    try {
      await api.auth.signOut();
    } finally {
      resetUserScopedState();
      set({ status: 'anonymous', session: null });
    }
  },

  setSession: (session) => set({ status: 'authenticated', session }),

  markExpired() {
    if (get().status !== 'authenticated') return;
    resetUserScopedState();
    set({ status: 'expired', session: null });
  },

  can: (permission) => get().session?.permissions.includes(permission) ?? false,
}));

onUnauthorized(() => useSession.getState().markExpired());

export const useCan = (permission: Permission) => useSession((s) => s.session?.permissions.includes(permission) ?? false);
export const useHasAdminAccess = () => useSession((s) => (s.session?.permissions.length ?? 0) > 0);
