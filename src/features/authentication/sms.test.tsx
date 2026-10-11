import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { routes } from '@/app/routes/router';
import { api } from '@/services/api';
import { useSession } from '@/state/session';
import { loginThroughForm, useBackend } from '@/test/backend';
import { createUser } from '../../../server/testing/fixtures';

/**
 * Parcours d'interface des trois usages du SMS (validation du numéro, double authentification, mot de passe oublié),
 * contre le vrai serveur : le code affiché est celui réellement émis. Les règles sont testées dans server/tests/sms.test.ts.
 */
const backend = useBackend();
const lastCode = () => backend.app.otp.sent.at(-1)!.code;

describe('double authentification — interface', () => {
  it('active la double authentification depuis la page Sécurité puis exige le code à la connexion', async () => {
    const u = await createUser(backend.app.db, { onboardingDone: true });
    await api.auth.signIn(u.email!, u.password);
    useSession.getState().setSession((await api.auth.getSession())!);

    const router = createMemoryRouter(routes, { initialEntries: ['/dashboard/security'] });
    render(<RouterProvider router={router} />);
    const card = await screen.findByTestId('phone-card');
    await userEvent.click(await screen.findByRole('button', { name: 'Ajouter un numéro' }));
    await userEvent.type(screen.getByLabelText(/Numéro de téléphone/), '622 33 44 55');
    await userEvent.click(screen.getByRole('button', { name: 'Recevoir le code' }));
    await screen.findByText(/Aucun message n’est réellement envoyé/);
    await userEvent.click(screen.getByRole('button', { name: 'Remplir' }));
    await userEvent.click(screen.getByRole('button', { name: 'Valider' }));
    expect(await screen.findByText(/Numéro vérifié et associé/)).toBeInTheDocument();
    expect(card).toHaveTextContent('+224');
    expect(useSession.getState().session?.user).toMatchObject({ phone: '+224622334455', phoneVerified: true });

    await userEvent.type(await screen.findByLabelText(/Mot de passe actuel/), u.password);
    await userEvent.click(screen.getByRole('button', { name: 'Activer la double authentification' }));
    expect(await screen.findByText('Double authentification activée.')).toBeInTheDocument();
    expect(useSession.getState().session?.user.twoFactorSms).toBe(true);
  }, 60000);

  it('la connexion s’arrête à l’étape du code SMS puis ouvre la session', async () => {
    const phone = '+224622556677';
    const u = await createUser(backend.app.db, { phone, phoneVerified: true, onboardingDone: true });
    await backend.app.db.execute((await import('drizzle-orm')).sql`update users set two_factor_sms = true where id = ${u.user.id}`);

    const router = createMemoryRouter(routes, { initialEntries: ['/auth/login'] });
    render(<RouterProvider router={router} />);
    await loginThroughForm(u.email!, u.password);
    expect(await screen.findByText(/Saisissez le code à 6 chiffres envoyé par SMS/)).toBeInTheDocument();
    expect(useSession.getState().session).toBeNull(); // pas de session avec le seul mot de passe
    expect(router.state.location.pathname).toBe('/auth/login');

    await userEvent.type(screen.getByLabelText(/Code à 6 chiffres/), lastCode() === '000000' ? '111111' : '000000');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmer la connexion' }));
    expect(await screen.findByText(/Code incorrect/)).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText(/Code à 6 chiffres/));
    await userEvent.click(screen.getByRole('button', { name: 'Remplir' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmer la connexion' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/dashboard'));
    expect(useSession.getState().session?.user.email).toBe(u.email);
  }, 60000);
});

describe('mot de passe oublié par SMS — interface', () => {
  it('envoie un code, change le mot de passe et permet de se reconnecter', async () => {
    const phone = '+224622778899';
    const u = await createUser(backend.app.db, { phone, phoneVerified: true });
    const router = createMemoryRouter(routes, { initialEntries: ['/auth/forgot-password'] });
    render(<RouterProvider router={router} />);
    await userEvent.click(await screen.findByRole('radio', { name: 'Téléphone' }));
    await userEvent.type(screen.getByLabelText(/Numéro de téléphone/), '622 77 88 99');
    await userEvent.click(screen.getByRole('button', { name: 'Recevoir le code par SMS' }));
    await screen.findByText(/un code à 6 chiffres vient d’être envoyé par SMS/);
    await userEvent.click(screen.getByRole('button', { name: 'Remplir' }));
    await userEvent.type(screen.getByLabelText(/^Nouveau mot de passe/), 'Nouveau-mot-de-passe-2026');
    await userEvent.type(screen.getByLabelText(/^Confirmer le mot de passe/), 'Nouveau-mot-de-passe-2026');
    await userEvent.click(screen.getByRole('button', { name: 'Mettre à jour le mot de passe' }));
    expect(await screen.findByText('Mot de passe mis à jour')).toBeInTheDocument();

    expect((await api.auth.signIn(u.email!, 'Nouveau-mot-de-passe-2026')).kind).toBe('session');
  }, 60000);

  it('affiche la même confirmation pour un numéro inconnu (aucune fuite)', async () => {
    render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/auth/forgot-password'] })} />);
    await userEvent.click(await screen.findByRole('radio', { name: 'Téléphone' }));
    await userEvent.type(screen.getByLabelText(/Numéro de téléphone/), '622 99 00 11');
    await userEvent.click(screen.getByRole('button', { name: 'Recevoir le code par SMS' }));
    expect(await screen.findByText(/un code à 6 chiffres vient d’être envoyé par SMS/)).toBeInTheDocument();
    expect(backend.app.otp.sent.some((s) => s.phone === '+224622990011')).toBe(false);
  }, 40000);
});
