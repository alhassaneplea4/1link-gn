/**
 * Messages envoyés aux utilisateurs à la suite d'un événement (accueil, page en ligne, décisions de modération…).
 * Jamais bloquant : l'envoi se fait après la réponse (`defer`) et un échec est journalisé sans jamais faire échouer l'action
 * déjà accomplie. Un compte sans e-mail (inscription par téléphone) ne reçoit rien. La langue est celle du compte.
 */
import { eq } from 'drizzle-orm';
import type { Deps } from '../context.js';
import { users } from '../db/schema.js';
import type { Locale } from '../lib/emails.js';
import type { MailMessage } from '../lib/mailer.js';

export interface Recipient {
  email: string | null;
  name: string;
  locale: string;
}

export const asLocale = (v: string): Locale => (v === 'en' ? 'en' : 'fr');

export function notify(deps: Deps, to: Recipient, build: (email: string, name: string, locale: Locale) => MailMessage): void {
  if (!to.email || deps.mailer.provider === 'none') return;
  deps.defer(
    deps.mailer.send(build(to.email, to.name, asLocale(to.locale))).catch((e) => console.error('[mail] notification non envoyée :', (e as Error).message)),
  );
}

/** Variante pour un utilisateur connu seulement par son identifiant. */
export async function notifyById(deps: Deps, userId: string, build: (email: string, name: string, locale: Locale) => MailMessage): Promise<void> {
  const [u] = await deps.db.select({ email: users.email, name: users.name, locale: users.locale }).from(users).where(eq(users.id, userId)).limit(1);
  if (u) notify(deps, u, build);
}
