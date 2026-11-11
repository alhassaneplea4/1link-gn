import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestApp, signUpByCode, type TestApp } from '../testing/harness.js';
import { nameFromEmail } from '../../src/utilities/validation.js';
import { createPendingVerification, createReport, createUser, FIXTURE_APPEARANCE, fixtureContent, uniqueEmail } from '../testing/fixtures.js';

let t: TestApp;
beforeAll(async () => void (t = await createTestApp()));
afterAll(async () => t.close());

let ip = 1;
const tick = () => new Promise((r) => setTimeout(r, 30));
const mailsTo = (email: string) => t.mailer.outbox.filter((m) => m.to === email);
const welcomeTo = (email: string) => mailsTo(email).filter((m) => /Bienvenue sur 1Link|Welcome to 1Link/.test(m.subject));
const doc = (username: string, version = 0) => ({ username, category: 'creator', blocks: fixtureContent('A').blocks, appearance: FIXTURE_APPEARANCE, share: { title: '', description: '' }, version });

describe('e-mails de bienvenue et de suivi', () => {
  it('envoie UN seul message d’accueil (sans confirmation d’adresse exigée) à l’inscription, en HTML et en texte', async () => {
    const email = uniqueEmail('accueil');
    await signUpByCode(t, { email, headers: { 'x-real-ip': `203.0.113.${ip++}` } });
    await tick();
    const mails = welcomeTo(email!); // le code de vérification est un autre message : l'accueil, lui, est unique
    expect(mails).toHaveLength(1);
    expect(mails[0]!.subject).toMatch(/Bienvenue sur 1Link/);
    expect(mails[0]!.text).toContain(nameFromEmail(email));
    expect(mails[0]!.text).not.toMatch(/token=/);
    expect(mails[0]!.text).toContain('http://localhost:5173/onboarding');
    expect(mails[0]!.html).toContain('<a href="http://localhost:5173/onboarding"');
    expect(mails[0]!.html).not.toMatch(/<script|onerror=/i);
  });

  it('échappe le nom de l’utilisateur dans la version HTML', async () => {
    const { email } = await createUser(t.db, { name: '<img src=x onerror=alert(1)>' });
    await t.client({ 'x-real-ip': `203.0.113.${ip++}` }).post('/api/auth/password/forgot', { email: email! });
    await tick();
    const html = mailsTo(email!).at(-1)!.html!;
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('écrit en anglais quand l’interface est en anglais, et garde la langue du compte', async () => {
    const email = uniqueEmail('english');
    await signUpByCode(t, { email, headers: { 'x-real-ip': `203.0.113.${ip++}`, 'accept-language': 'en' } });
    await tick();
    expect(welcomeTo(email!)[0]!.subject).toMatch(/Welcome to 1Link/);
    await t.client({ 'x-real-ip': `203.0.113.${ip++}` }).post('/api/auth/password/forgot', { email: email! });
    await tick();
    expect(mailsTo(email!).at(-1)!.subject).toBe('Reset your password'); // langue du compte, pas celle de la requête
  });

  it('n’envoie rien à un compte créé par téléphone (pas d’e-mail)', async () => {
    const before = t.mailer.outbox.length;
    const c = t.client({ 'x-real-ip': `203.0.113.${ip++}` });
    await c.post('/api/auth/otp/request', { phone: '+224622777888', channel: 'sms' });
    await c.post('/api/auth/otp/verify', { phone: '+224622777888', code: t.otp.sent.at(-1)!.code, mode: 'sign_up', name: 'Tel', acceptTerms: true });
    await tick();
    expect(t.mailer.outbox.length).toBe(before);
  });

  it('prévient quand le mot de passe est modifié', async () => {
    const { email } = await createUser(t.db);
    await t.client({ 'x-real-ip': `203.0.113.${ip++}` }).post('/api/auth/password/forgot', { email: email! });
    await tick();
    const token = decodeURIComponent(/token=([^\s&]+)/.exec(mailsTo(email!).at(-1)!.text)![1]!);
    await t.client({ 'x-real-ip': `203.0.113.${ip++}` }).post('/api/auth/password/reset', { token, password: 'Nouveau-Mot-de-passe-9' });
    await tick();
    expect(mailsTo(email!).at(-1)!.subject).toMatch(/mot de passe 1Link a été modifié/);
  });

  it('félicite à la PREMIÈRE publication seulement', async () => {
    const { email, password } = await createUser(t.db, { name: 'Fatou Bah', plan: 'pro' });
    const c = t.client({ 'x-real-ip': `203.0.113.${ip++}` });
    await c.post('/api/auth/sign-in', { email: email!, password });
    const username = `live${ip}`;
    const first = await c.post('/api/me/page/publish', doc(username));
    await tick();
    const live = mailsTo(email!).filter((m) => /en ligne/.test(m.subject));
    expect(live).toHaveLength(1);
    expect(live[0]!.text).toContain(`http://localhost:5173/${username}`);
    await c.post('/api/me/page/publish', doc(username, first.body.version));
    await tick();
    expect(mailsTo(email!).filter((m) => /en ligne/.test(m.subject))).toHaveLength(1);
  });

  it('informe de la décision de vérification, de la suspension d’un compte et d’une page', async () => {
    const owner = await createUser(t.db, { name: 'Moussa Sylla', page: { username: `notif${ip}`, published: true } });
    const admin = await createUser(t.db, { adminRole: 'super_admin', name: 'Chef' });
    const a = t.client({ 'x-real-ip': `203.0.113.${ip++}` });
    await a.post('/api/auth/sign-in', { email: admin.email, password: admin.password });

    const req = await createPendingVerification(t.db, owner.user.id);
    await a.post(`/api/admin/verifications/${req.id}/decision`, { decision: 'approve', note: 'Registre confirmé' });
    await tick();
    expect(mailsTo(owner.email!).at(-1)).toMatchObject({ subject: 'Votre profil est maintenant vérifié' });
    expect(mailsTo(owner.email!).at(-1)!.text).toContain('Registre confirmé');

    const rep = await createReport(t.db, owner.page!.id, owner.page!.username!);
    await a.post(`/api/admin/reports/${rep.id}/decision`, { decision: 'suspend', note: '' });
    await tick();
    expect(mailsTo(owner.email!).at(-1)!.subject).toMatch(/page 1Link a été suspendue/);

    await a.patch(`/api/admin/users/${owner.user.id}/status`, { status: 'suspended' });
    await tick();
    expect(mailsTo(owner.email!).at(-1)!.subject).toMatch(/compte 1Link a été suspendu/);
    await a.patch(`/api/admin/users/${owner.user.id}/status`, { status: 'active' });
    await tick();
    expect(mailsTo(owner.email!).at(-1)!.subject).toMatch(/réactivé/);
  });

  it('une panne du fournisseur d’e-mail ne fait jamais échouer l’action', async () => {
    const failing = await createTestApp();
    try {
      vi.spyOn(failing.mailer, 'send').mockRejectedValue(new Error('SMTP down'));
      const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const { email } = await createUser(failing.db, { email: uniqueEmail('panne') });
      const r = await failing.client({ 'x-real-ip': '203.0.113.250' }).post('/api/auth/password/forgot', { email: email! });
      expect(r.status).toBe(204); // aucune erreur n'est révélée : l'envoi échoue en silence, l'utilisateur pourra réessayer
      quiet.mockRestore();
    } finally {
      await failing.close();
    }
  });
});
