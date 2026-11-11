import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { routes } from '@/app/routes/router';
import { useSession } from '@/state/session';
import { loginThroughForm, useBackend } from '@/test/backend';
import { createUser } from '../../../server/testing/fixtures';
import { securityEvents } from '../../../server/db/schema';

/**
 * Défi anti-robot, de bout en bout : le serveur (Turnstile activé) l'exige après des échecs ; l'interface affiche alors le widget et
 * joint le jeton. Seuls le widget du navigateur et le service Cloudflare sont simulés ; la décision reste celle du serveur.
 */
const backend = useBackend({ overrides: { captcha: { enabled: true, siteKey: 'site-test', secret: 'secret-test' } } });

/** Remplace le widget Cloudflare (réussi aussitôt) et le service de vérification (`cloudflare` : réponse simulée). */
function simulateCloudflare(cloudflare: (() => Response) = () => Response.json({ success: true })) {
  const turnstile = { render: vi.fn((_el: HTMLElement, o: { callback: (t: string) => void }) => { o.callback('jeton-ui'); return 'w1'; }), reset: vi.fn(), remove: vi.fn() };
  Object.assign(window, { turnstile });
  const app = backend.browser.asFetch();
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => (String(input instanceof Request ? input.url : input).startsWith('https://challenges.cloudflare.com') ? cloudflare() : app(input, init)));
  return turnstile;
}
afterEach(() => {
  delete (window as { turnstile?: unknown }).turnstile;
});

const failures = () => backend.app.db.select().from(securityEvents).then((r) => r.length);

describe('défi anti-robot — interface', () => {
  it('apparaît après 3 échecs, puis laisse passer avec le bon mot de passe une fois le défi réussi', async () => {
    const turnstile = simulateCloudflare();
    const u = await createUser(backend.app.db, { onboardingDone: true });
    render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/auth/login'] })} />);
    await loginThroughForm(u.email!, 'Mauvais-mot-de-passe'); // 1er échec
    await waitFor(async () => expect(await failures()).toBe(1));
    expect(screen.queryByTestId('captcha')).not.toBeInTheDocument(); // aucun défi tant qu'il n'y a pas d'abus
    for (let i = 2; i <= 3; i++) {
      await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
      await waitFor(async () => expect(await failures()).toBe(i));
    }

    // 4e tentative : le serveur exige un défi AVANT de tester le mot de passe.
    await userEvent.clear(screen.getByLabelText(/^Mot de passe/));
    await userEvent.type(screen.getByLabelText(/^Mot de passe/), u.password);
    await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
    expect(await screen.findByText(/confirmez que vous n’êtes pas un robot/)).toBeInTheDocument();
    expect(await screen.findByTestId('captcha')).toBeInTheDocument();
    await waitFor(() => expect(turnstile.render).toHaveBeenCalled());
    expect(await failures()).toBe(3); // le bon mot de passe n'a pas été testé : pas de nouvel échec enregistré
    expect(useSession.getState().session).toBeNull();

    // Défi réussi (jeton joint) : la connexion aboutit.
    await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
    await waitFor(() => expect(useSession.getState().session?.user.email).toBe(u.email));
  }, 90000);

  it('dit honnêtement que la vérification est indisponible quand le service de vérification ne répond pas', async () => {
    simulateCloudflare(() => new Response('{}', { status: 500 }));
    const u = await createUser(backend.app.db, { onboardingDone: true });
    render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/auth/login'] })} />);
    await loginThroughForm(u.email!, 'Mauvais-mot-de-passe');
    await waitFor(async () => expect(await failures()).toBe(1));
    for (let i = 2; i <= 3; i++) {
      await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
      await waitFor(async () => expect(await failures()).toBe(i));
    }
    await userEvent.clear(screen.getByLabelText(/^Mot de passe/));
    await userEvent.type(screen.getByLabelText(/^Mot de passe/), u.password);
    await userEvent.click(screen.getByRole('button', { name: 'Se connecter' })); // exige le défi
    await screen.findByTestId('captcha');
    await userEvent.click(screen.getByRole('button', { name: 'Se connecter' })); // jeton joint, mais Cloudflare ne répond pas
    expect((await screen.findAllByText(/momentanément indisponible/)).length).toBeGreaterThan(0);
    expect(useSession.getState().session).toBeNull();
  }, 90000);
});
