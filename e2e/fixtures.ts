import { expect, test as base, type APIRequestContext, type Page } from '@playwright/test';
import { createDb, type Db } from '../server/db/client.js';
import { addEvents, createReport, createUser, uniqueEmail, type UserFixture } from '../server/testing/fixtures.js';
import type { AdminRole } from '../src/models/auth.js';

export interface Account {
  id: string;
  email: string;
  password: string;
  name: string;
  username: string | null;
  pageId: string | null;
}

let n = 0;
const uname = (prefix = 'u') => `${prefix}${Date.now().toString(36).slice(-5)}${(n++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export interface Seed {
  db: Db;
  /** Créatrice avec une page PUBLIÉE (3 blocs) et un e-mail vérifié. */
  creator(o?: UserFixture & { username?: string }): Promise<Account>;
  admin(role: AdminRole, o?: UserFixture): Promise<Account>;
  report(account: Account, reason?: 'spam' | 'scam' | 'impersonation'): Promise<void>;
  views(account: Account, views: number, clicks?: number): Promise<void>;
}

/**
 * Jeu de test : les comptes sont créés directement dans la base du serveur de test (chaque test crée les siens,
 * donc aucun test n'en dépend un autre). La plateforme, elle, ne contient aucune donnée d'exemple.
 */
export const test = base.extend<{ seed: Seed }, { database: Db }>({
  database: [
    async ({}, use) => {
      const handle = createDb(process.env.E2E_DATABASE_URL!, 3);
      await use(handle.db);
      await handle.close();
    },
    { scope: 'worker' },
  ],
  seed: async ({ database }, use) => {
    const toAccount = (r: Awaited<ReturnType<typeof createUser>>, name: string): Account => ({ id: r.user.id, email: r.email!, password: r.password, name, username: r.page?.username ?? null, pageId: r.page?.id ?? null });
    const seed: Seed = {
      db: database,
      async creator(o = {}) {
        const name = o.name ?? 'Mariama Bah';
        const r = await createUser(database, { plan: 'pro', category: 'creator', ...o, name, page: o.page ?? { username: o.username ?? uname('m'), published: true } });
        return toAccount(r, name);
      },
      async admin(role, o = {}) {
        const name = o.name ?? `Admin ${role}`;
        return toAccount(await createUser(database, { ...o, name, adminRole: role, onboardingDone: true, email: o.email ?? uniqueEmail(role) }), name);
      },
      async report(account, reason = 'spam') {
        await createReport(database, account.pageId, account.username!, { reason });
      },
      async views(account, views, clicks = 0) {
        await addEvents(database, account.pageId!, { views, clicks });
      },
    };
    await use(seed);
  },
});

export { expect };

/** Connexion par le formulaire avec mot de passe, comme un utilisateur (la connexion par défaut envoie un code par e-mail). */
export async function signIn(page: Page, who: Pick<Account, 'email' | 'password'>) {
  await page.goto('/auth/login');
  await page.getByRole('button', { name: 'Se connecter avec un mot de passe' }).click();
  await page.getByLabel(/Adresse e-mail/).fill(who.email);
  await page.getByLabel(/^Mot de passe/).fill(who.password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.waitForURL(/\/(dashboard|admin|onboarding)/);
}

/** Inscription par e-mail, sans mot de passe : un code est envoyé à l'adresse (parcours réel : le compte est créé en base). */
export async function registerNew(page: Page, email: string) {
  await page.goto('/auth/register');
  await page.getByLabel(/Adresse e-mail/).fill(email);
  await page.getByLabel(/J’accepte/).check();
  await page.getByRole('button', { name: 'Recevoir le code par e-mail' }).click();
  await page.getByRole('button', { name: 'Remplir' }).click(); // fournisseur de test : le code est révélé par l'interface
  await page.getByRole('button', { name: 'Valider' }).click();
  await expect(page).toHaveURL(/\/onboarding/);
}

/** Connexion d'un compte SANS mot de passe : code reçu par e-mail. */
export async function signInByCode(page: Page, email: string) {
  await page.goto('/auth/login');
  await page.getByLabel(/Adresse e-mail/).fill(email);
  await page.getByRole('button', { name: 'Recevoir le code par e-mail' }).click();
  await page.getByRole('button', { name: 'Remplir' }).click();
  await page.getByRole('button', { name: 'Valider' }).click();
  await page.waitForURL(/\/(dashboard|admin|onboarding)/);
}

/** Dernier message « envoyé » à une adresse (boîte d'envoi du serveur de test : aucun e-mail réel n'est expédié). */
export async function latestMail(request: APIRequestContext, to: string): Promise<{ subject: string; text: string }> {
  for (let i = 0; i < 20; i++) {
    const outbox = (await (await request.get('/api/dev/outbox')).json()) as { mails: { to: string; subject: string; text: string }[] };
    const mail = outbox.mails.filter((m) => m.to === to).at(-1);
    if (mail) return mail;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Aucun e-mail pour ${to}`);
}

export const tokenFrom = (mail: { text: string }) => decodeURIComponent(/token=([^\s&]+)/.exec(mail.text)![1]!);
