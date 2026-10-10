import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { routes } from '@/app/routes/router';
import { api } from '@/services/api';
import { resetDemoDb } from '@/services/api/demo/db';
import { OTP_MAX_ATTEMPTS, OTP_MAX_PER_HOUR, OTP_RESEND_SEC, OTP_TTL_SEC, checkOtp, issueOtp, resetOtpState } from '@/services/api/demo/otp';
import { useSession } from '@/state/session';
import { useEditor } from '@/state/editor';
import { useOnboarding } from '@/features/onboarding/store';

const PHONE = '+224622000000';

beforeEach(() => {
  resetDemoDb();
  resetOtpState();
  useSession.setState({ status: 'loading', session: null });
  useEditor.getState().reset();
  useOnboarding.getState().reset();
});

describe('codes à usage unique — garde-fous', () => {
  it('génère un code à 6 chiffres, valable une seule fois', () => {
    const issued = issueOtp(PHONE, 1000);
    expect(issued.ok && /^\d{6}$/.test(issued.code)).toBe(true);
    if (!issued.ok) return;
    expect(checkOtp(PHONE, issued.code, 2000)).toEqual({ ok: true });
    expect(checkOtp(PHONE, issued.code, 3000)).toMatchObject({ ok: false, reason: 'expired' }); // déjà consommé
  });
  it('expire après le délai de validité', () => {
    const issued = issueOtp(PHONE, 0);
    if (!issued.ok) throw new Error('issue');
    expect(checkOtp(PHONE, issued.code, OTP_TTL_SEC * 1000)).toMatchObject({ ok: false, reason: 'expired' });
  });
  it('bloque après trop d’essais et indique les essais restants', () => {
    const issued = issueOtp(PHONE, 0);
    if (!issued.ok) throw new Error('issue');
    const wrong = issued.code === '000000' ? '111111' : '000000';
    expect(checkOtp(PHONE, wrong, 10)).toEqual({ ok: false, reason: 'invalid_code', attemptsLeft: OTP_MAX_ATTEMPTS - 1 });
    for (let i = 0; i < OTP_MAX_ATTEMPTS - 2; i++) checkOtp(PHONE, wrong, 20);
    expect(checkOtp(PHONE, wrong, 30)).toMatchObject({ ok: false, reason: 'too_many_attempts' });
    expect(checkOtp(PHONE, issued.code, 40)).toMatchObject({ ok: false, reason: 'expired' }); // le bon code ne marche plus
  });
  it('impose un délai de renvoi puis un plafond horaire', () => {
    expect(issueOtp(PHONE, 0).ok).toBe(true);
    expect(issueOtp(PHONE, 5000)).toMatchObject({ ok: false, reason: 'resend_too_soon', retryAfterSec: OTP_RESEND_SEC - 5 });
    let now = 0;
    for (let i = 1; i < OTP_MAX_PER_HOUR; i++) {
      now += OTP_RESEND_SEC * 1000;
      expect(issueOtp(PHONE, now).ok).toBe(true);
    }
    expect(issueOtp(PHONE, now + OTP_RESEND_SEC * 1000)).toMatchObject({ ok: false, reason: 'too_many_requests' });
    expect(issueOtp(PHONE, 3_700_000).ok).toBe(true); // la fenêtre d'une heure est écoulée
  });
});

describe('inscription et connexion par téléphone — API de démonstration', () => {
  it('crée un compte vérifié par téléphone (sans e-mail) qui peut publier, puis le reconnecte', async () => {
    const otp = await api.auth.requestOtp({ phone: PHONE, channel: 'whatsapp' });
    expect(otp.demoCode).toMatch(/^\d{6}$/);
    await expect(api.auth.verifyOtp({ phone: PHONE, code: '123456' === otp.demoCode ? '654321' : '123456', mode: 'sign_up', name: 'Awa', acceptTerms: true })).rejects.toMatchObject({ message: 'invalid_code' });
    const session = await api.auth.verifyOtp({ phone: PHONE, code: otp.demoCode!, mode: 'sign_up', name: 'Awa Test', acceptTerms: true });
    expect(session.user).toMatchObject({ email: null, phone: PHONE, phoneVerified: true, emailVerified: false, name: 'Awa Test' });
    await api.auth.signOut();

    resetOtpStateKeepDb();
    const again = await api.auth.requestOtp({ phone: PHONE, channel: 'sms' });
    const back = await api.auth.verifyOtp({ phone: PHONE, code: again.demoCode!, mode: 'sign_in' });
    expect(back.user.id).toBe(session.user.id);
  });

  it('refuse les cas invalides sans révéler l’existence d’un compte avant preuve de possession', async () => {
    await expect(api.auth.requestOtp({ phone: '0622000000', channel: 'sms' })).rejects.toMatchObject({ message: 'invalid_phone' });
    const otp = await api.auth.requestOtp({ phone: PHONE, channel: 'sms' });
    // inscription sans nom / sans conditions
    await expect(api.auth.verifyOtp({ phone: PHONE, code: otp.demoCode!, mode: 'sign_up', name: '', acceptTerms: false })).rejects.toMatchObject({ code: 'validation' });
    // connexion à un numéro sans compte : l'erreur n'arrive qu'APRÈS un code correct
    resetOtpStateKeepDb();
    const o2 = await api.auth.requestOtp({ phone: PHONE, channel: 'sms' });
    await expect(api.auth.verifyOtp({ phone: PHONE, code: o2.demoCode!, mode: 'sign_in' })).rejects.toMatchObject({ message: 'no_account' });
    // inscription d'un numéro déjà pris
    resetOtpStateKeepDb();
    const o3 = await api.auth.requestOtp({ phone: PHONE, channel: 'sms' });
    await api.auth.verifyOtp({ phone: PHONE, code: o3.demoCode!, mode: 'sign_up', name: 'Awa', acceptTerms: true });
    resetOtpStateKeepDb();
    const o4 = await api.auth.requestOtp({ phone: PHONE, channel: 'sms' });
    await expect(api.auth.verifyOtp({ phone: PHONE, code: o4.demoCode!, mode: 'sign_up', name: 'Autre', acceptTerms: true })).rejects.toMatchObject({ message: 'phone_taken' });
  });
});

/** Nouvelle « session de saisie » : on garde les comptes mais on efface les compteurs de codes. */
function resetOtpStateKeepDb() {
  resetOtpState();
}

describe('inscription par téléphone — interface', () => {
  it('parcourt le formulaire, le code de démonstration et arrive à l’onboarding', async () => {
    const router = createMemoryRouter(routes, { initialEntries: ['/auth/register'] });
    render(<RouterProvider router={router} />);
    await userEvent.click(await screen.findByRole('radio', { name: 'Téléphone' }));
    await userEvent.click(screen.getByRole('button', { name: 'Recevoir le code' }));
    expect((await screen.findAllByRole('alert')).length).toBeGreaterThan(0);

    await userEvent.type(screen.getByLabelText(/Nom complet/), 'Awa Test');
    await userEvent.type(screen.getByLabelText(/Numéro de téléphone/), '12');
    await userEvent.click(screen.getByLabelText(/J’accepte/));
    await userEvent.click(screen.getByRole('button', { name: 'Recevoir le code' }));
    expect(await screen.findByText(/Numéro invalide/)).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText(/Numéro de téléphone/));
    await userEvent.type(screen.getByLabelText(/Numéro de téléphone/), '622 00 00 00');
    await userEvent.click(screen.getByRole('button', { name: 'Recevoir le code' }));
    expect(await screen.findByText(/Aucun message n’est réellement envoyé/)).toBeInTheDocument();
    expect(screen.getByText(/\+224.*•/)).toBeInTheDocument(); // le numéro est masqué
    const code = screen.getByLabelText('Code de démonstration').textContent!;
    const wrong = code === '000000' ? '111111' : '000000';

    await userEvent.type(screen.getByLabelText(/Code à 6 chiffres/), wrong);
    await userEvent.click(screen.getByRole('button', { name: 'Valider' }));
    expect(await screen.findByText(/Code incorrect. Il vous reste 4 essais/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Renvoyer dans/ })).toBeDisabled();

    await userEvent.clear(screen.getByLabelText(/Code à 6 chiffres/));
    await userEvent.click(screen.getByRole('button', { name: 'Remplir' }));
    await userEvent.click(screen.getByRole('button', { name: 'Valider' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/onboarding'));
    expect(useSession.getState().session?.user).toMatchObject({ phone: '+224622000000', email: null, phoneVerified: true });
  }, 40000);

  it('propose de créer un compte quand le numéro n’en a pas, après un code correct', async () => {
    render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/auth/login'] })} />);
    await userEvent.click(await screen.findByRole('radio', { name: 'Téléphone' }));
    await userEvent.type(screen.getByLabelText(/Numéro de téléphone/), '622 11 22 33');
    await userEvent.click(screen.getByRole('button', { name: 'Recevoir le code' }));
    await screen.findByText(/Aucun message n’est réellement envoyé/);
    await userEvent.click(screen.getByRole('button', { name: 'Remplir' }));
    await userEvent.click(screen.getByRole('button', { name: 'Valider' }));
    expect(await screen.findByText(/Aucun compte n’est associé à ce numéro/)).toBeInTheDocument();
    const links = screen.getAllByRole('link', { name: /Créer mon 1Link/ });
    expect(links.length).toBeGreaterThan(0);
    links.forEach((l) => expect(l).toHaveAttribute('href', '/auth/register'));
  }, 40000);
});
