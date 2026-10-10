/**
 * Banc d'essai « application complète » pour les tests d'interface : les appels `fetch` de l'interface sont redirigés vers
 * le VRAI serveur (routes, validation, SQL) branché sur une vraie base PostgreSQL jetable. Aucun double de l'API.
 */
import { afterAll, beforeAll, beforeEach, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createTestApp, resetData, type TestApp, type TestClient } from '../../server/testing/harness';
import { useSession } from '@/state/session';
import { useEditor } from '@/state/editor';
import { useOnboarding } from '@/features/onboarding/store';

export interface Backend {
  app: TestApp;
  /** « Navigateur » courant : ses cookies sont ceux de l'interface testée. */
  browser: TestClient;
}

let counter = 0;

export function useBackend(): Backend {
  const ctx = {} as Backend;
  beforeAll(async () => {
    ctx.app = await createTestApp();
  });
  beforeEach(async () => {
    await resetData(ctx.app.db);
    counter++;
    // Une adresse IP distincte par test : les limiteurs de débit ne se croisent pas.
    ctx.browser = ctx.app.client({ 'x-real-ip': `10.${(counter >> 8) & 255}.${counter & 255}.7` });
    vi.stubGlobal('fetch', ctx.browser.asFetch());
    useSession.setState({ status: 'loading', session: null });
    useEditor.getState().reset();
    useOnboarding.getState().reset();
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    await ctx.app?.close();
  });
  return ctx;
}

/** Se connecte par le formulaire e-mail / mot de passe (comme un utilisateur). */
export async function loginThroughForm(email: string, password: string) {
  await userEvent.type(await screen.findByLabelText(/Adresse e-mail/), email);
  await userEvent.type(screen.getByLabelText(/^Mot de passe/), password);
  await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
}
