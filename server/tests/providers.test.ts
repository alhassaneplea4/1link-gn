import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../config.js';
import { createMailer } from '../lib/mailer.js';
import { createOtpSender } from '../lib/otp-sender.js';

/**
 * Les fournisseurs réels (Resend, Twilio) ne peuvent pas être appelés dans les tests : on vérifie ici, avec un `fetch`
 * espion, que les requêtes envoyées respectent leurs API (URL, authentification, corps) et que les échecs ne sont jamais avalés.
 */
const base = { NODE_ENV: 'test', DATABASE_URL: 'postgres://x', APP_SECRET: 'a'.repeat(40) };
const spy = (status = 200) => {
  const fn = vi.fn(async () => new Response('{}', { status }));
  vi.stubGlobal('fetch', fn);
  return fn;
};
afterEach(() => vi.unstubAllGlobals());

describe('Twilio (codes WhatsApp / SMS)', () => {
  const tw = { ...base, OTP_PROVIDER: 'twilio', TWILIO_ACCOUNT_SID: 'ACtest', TWILIO_AUTH_TOKEN: 'secret-token', TWILIO_SMS_FROM: '+15005550006', TWILIO_WHATSAPP_FROM: '+14155238886' };

  it('envoie un SMS avec authentification Basic et le code dans le message', async () => {
    const fetchSpy = spy();
    await createOtpSender(loadConfig(tw)).send({ phone: '+224622000000', channel: 'sms', code: '123456', ttlMinutes: 5, locale: 'fr' });
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.twilio.com/2010-04-01/Accounts/ACtest/Messages.json');
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from('ACtest:secret-token').toString('base64')}`);
    const form = new URLSearchParams(String(init.body));
    expect(form.get('To')).toBe('+224622000000');
    expect(form.get('From')).toBe('+15005550006');
    expect(form.get('Body')).toContain('123456');
  });

  it('envoie sur WhatsApp avec le préfixe whatsapp:, et le modèle approuvé quand il est configuré', async () => {
    const fetchSpy = spy();
    await createOtpSender(loadConfig(tw)).send({ phone: '+224622000000', channel: 'whatsapp', code: '654321', ttlMinutes: 5, locale: 'en' });
    let form = new URLSearchParams(String((fetchSpy.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(form.get('To')).toBe('whatsapp:+224622000000');
    expect(form.get('From')).toBe('whatsapp:+14155238886');
    expect(form.get('Body')).toContain('Your 1Link code: 654321');

    await createOtpSender(loadConfig({ ...tw, TWILIO_WHATSAPP_CONTENT_SID: 'HXmodele' })).send({ phone: '+224622000000', channel: 'whatsapp', code: '654321', ttlMinutes: 5, locale: 'fr' });
    form = new URLSearchParams(String((fetchSpy.mock.calls[1] as unknown as [string, RequestInit])[1].body));
    expect(form.get('ContentSid')).toBe('HXmodele');
    expect(JSON.parse(form.get('ContentVariables')!)).toEqual({ 1: '654321' });
    expect(form.has('Body')).toBe(false);
  });

  it('propage l’échec du fournisseur (jamais de faux succès)', async () => {
    spy(401);
    await expect(createOtpSender(loadConfig(tw)).send({ phone: '+224622000000', channel: 'sms', code: '1', ttlMinutes: 5, locale: 'fr' })).rejects.toThrow(/twilio 401/);
  });

  it('refuse d’envoyer sans expéditeur configuré', async () => {
    const sender = createOtpSender(loadConfig({ ...base, OTP_PROVIDER: 'twilio', TWILIO_ACCOUNT_SID: 'AC', TWILIO_AUTH_TOKEN: 't' }));
    await expect(sender.send({ phone: '+224622000000', channel: 'sms', code: '1', ttlMinutes: 5, locale: 'fr' })).rejects.toMatchObject({ message: 'otp_unavailable' });
  });
});

describe('Resend (e-mails)', () => {
  it('envoie le message avec la clé API et l’expéditeur configurés', async () => {
    const fetchSpy = spy();
    await createMailer(loadConfig({ ...base, MAIL_PROVIDER: 'resend', RESEND_API_KEY: 're_test', MAIL_FROM: '1Link <no-reply@exemple.com>' })).send({ to: 'awa@exemple.com', subject: 'Sujet', text: 'Corps' });
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer re_test');
    expect(JSON.parse(String(init.body))).toEqual({ from: '1Link <no-reply@exemple.com>', to: ['awa@exemple.com'], subject: 'Sujet', text: 'Corps' });
  });

  it('propage l’échec, et sans fournisseur répond mail_unavailable', async () => {
    spy(422);
    await expect(createMailer(loadConfig({ ...base, MAIL_PROVIDER: 'resend', RESEND_API_KEY: 're' })).send({ to: 'a@b.cd', subject: 's', text: 't' })).rejects.toThrow(/resend 422/);
    await expect(createMailer(loadConfig({ ...base, MAIL_PROVIDER: 'none' })).send({ to: 'a@b.cd', subject: 's', text: 't' })).rejects.toMatchObject({ message: 'mail_unavailable' });
  });
});
