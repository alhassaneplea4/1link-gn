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

describe('SMTP (Gmail et autres)', () => {
  it('configure le transport avec l’hôte, le port sécurisé et l’authentification, et envoie texte + HTML', async () => {
    const sendMail = vi.fn(async () => ({}));
    const createTransport = vi.fn(() => ({ sendMail }));
    vi.resetModules();
    vi.doMock('nodemailer', () => ({ default: { createTransport } }));
    const { createMailer: freshMailer } = await import('../lib/mailer.js');
    const { loadConfig: freshConfig } = await import('../config.js');
    const cfg = freshConfig({ ...base, SMTP_USER: 'boite@gmail.com', SMTP_PASS: 'abcd efgh ijkl mnop' });
    expect(cfg.mail).toMatchObject({ provider: 'smtp', from: '1Link <boite@gmail.com>', smtp: { host: 'smtp.gmail.com', port: 465, secure: true, user: 'boite@gmail.com', pass: 'abcdefghijklmnop' } });
    await freshMailer(cfg).send({ to: 'awa@exemple.com', subject: 'Sujet', text: 'Corps', html: '<p>Corps</p>' });
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: 'boite@gmail.com', pass: 'abcdefghijklmnop' } }));
    expect(sendMail).toHaveBeenCalledWith({ from: '1Link <boite@gmail.com>', to: 'awa@exemple.com', subject: 'Sujet', text: 'Corps', html: '<p>Corps</p>' });
    vi.doUnmock('nodemailer');
  });

  it('exige l’identifiant ET le mot de passe, et propage les échecs', async () => {
    expect(() => loadConfig({ ...base, MAIL_PROVIDER: 'smtp', SMTP_USER: 'x@gmail.com' })).toThrow(/SMTP_USER et SMTP_PASS/);
    expect(() => loadConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgres://x', APP_SECRET: 'a'.repeat(40), SMTP_USER: 'x@gmail.com', SMTP_PASS: 'secret' }).mail.provider).not.toThrow();
  });
});

describe('SMS8.io (passerelle SMS)', () => {
  const cfg = () => loadConfig({ ...base, SMS8_API_KEY: 'cle-de-test-0123456789' });
  const send = (channel: 'sms' | 'whatsapp' = 'sms') => createOtpSender(cfg()).send({ phone: '+224622000000', channel, code: '246810', ttlMinutes: 5, locale: 'fr' });

  it('est choisi automatiquement quand la clé est présente et envoie le SMS prioritaire avec notre code', async () => {
    expect(cfg().otp.provider).toBe('sms8');
    const fetchSpy = spy();
    expect(await send('sms')).toBeUndefined();
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://app.sms8.io/api/v1/messages');
    const form = new URLSearchParams(String(init.body));
    expect(form.get('key')).toBe('cle-de-test-0123456789');
    expect(JSON.parse(form.get('messages')!)).toEqual([{ number: '+224622000000', message: 'Votre code 1Link : 246810. Valable 5 minutes. Ne le communiquez à personne.', type: 'sms' }]);
    expect(form.get('prioritize')).toBe('1');
    expect(String(url)).not.toContain('cle-de-test'); // la clé ne transite jamais dans l'URL
  });

  it('annonce « SMS » quand WhatsApp était demandé (SMS8 ne sait envoyer que des SMS)', async () => {
    spy();
    expect(await send('whatsapp')).toEqual({ channel: 'sms' });
  });

  it('traite comme un échec la réponse HTTP 200 { success:false } de SMS8 (jamais de faux succès)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: false, data: null, error: { code: 401, message: 'This API key is invalid.' } }), { status: 200 })));
    await expect(send()).rejects.toThrow(/sms8/);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Bad gateway', { status: 502 })));
    await expect(send()).rejects.toThrow(/sms8 502/);
  });

  it('exige https et une clé quand le fournisseur est forcé', () => {
    expect(() => loadConfig({ ...base, OTP_PROVIDER: 'sms8' })).toThrow(/SMS8_API_KEY/);
    expect(() => loadConfig({ ...base, SMS8_API_KEY: 'k'.repeat(20), SMS8_BASE_URL: 'http://app.sms8.io' })).toThrow(/https/);
  });

  it('le service de codes renvoie le canal réellement utilisé (SMS) à l’interface', async () => {
    const { createTestApp } = await import('../testing/harness.js');
    const app = await createTestApp();
    try {
      app.deps.otp = { provider: 'sms8', send: async () => ({ channel: 'sms' as const }) };
      const r = await app.client({ 'x-real-ip': '198.51.100.77' }).post('/api/auth/otp/request', { phone: '+224622000321', channel: 'whatsapp' });
      expect(r.body).toMatchObject({ channel: 'sms' });
      expect(r.body.devCode).toBeUndefined(); // jamais de code renvoyé hors fournisseur de développement
    } finally {
      await app.close();
    }
  }, 90_000); // clone d'une base : plus lent quand toute la suite tourne en parallèle
});

describe('capacités publiques (canaux réellement disponibles)', () => {
  it('annonce seulement ce que le fournisseur configuré sait faire', async () => {
    const { createTestApp } = await import('../testing/harness.js');
    const app = await createTestApp();
    try {
      const caps = async (otp: Record<string, string>, mail = 'none') => {
        app.deps.config.otp = loadConfig({ ...base, ...otp }).otp;
        app.deps.config.mail = loadConfig({ ...base, MAIL_PROVIDER: mail }).mail;
        return (await app.client().get('/api/capabilities')).body;
      };
      expect(await caps({ OTP_PROVIDER: 'dev' })).toEqual({ otpChannels: ['whatsapp', 'sms'], emailSending: false });
      expect((await caps({ SMS8_API_KEY: 'k'.repeat(20) }, 'dev')).otpChannels).toEqual(['sms']);
      expect((await caps({ OTP_PROVIDER: 'twilio', TWILIO_ACCOUNT_SID: 'AC', TWILIO_AUTH_TOKEN: 't', TWILIO_SMS_FROM: '+1500' })).otpChannels).toEqual(['sms']);
      expect((await caps({ OTP_PROVIDER: 'none' })).otpChannels).toEqual([]);
    } finally {
      await app.close();
    }
  }, 90_000);
});
