/**
 * Envoie un VRAI e-mail de bienvenue de test pour valider la configuration SMTP / Resend.
 *   npm run mail:test -- adresse@exemple.com
 */
import { loadConfig } from '../server/config.js';
import { welcomeMessage } from '../server/lib/emails.js';
import { createMailer } from '../server/lib/mailer.js';

const to = process.argv[2];
if (!to) {
  console.error('Usage : npm run mail:test -- adresse@exemple.com');
  process.exit(1);
}
const config = loadConfig({ DATABASE_URL: 'postgres://inutile', NODE_ENV: 'development', ...process.env } as Record<string, string | undefined>);
if (config.mail.provider === 'dev' || config.mail.provider === 'none') {
  console.error(`Aucun fournisseur d'envoi réel configuré (MAIL_PROVIDER=${config.mail.provider}). Renseigner SMTP_USER / SMTP_PASS ou RESEND_API_KEY.`);
  process.exit(1);
}
const link = `${config.publicUrl}/auth/verify-email?token=exemple-de-test`;
await createMailer(config).send(welcomeMessage(to, 'Test 1Link', link, 'fr'));
console.log(`E-mail de test envoyé à ${to} via ${config.mail.provider} (expéditeur : ${config.mail.from}).`);
