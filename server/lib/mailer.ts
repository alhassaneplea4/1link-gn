/**
 * E-mails transactionnels. Trois implémentations :
 *  - `resend` : envoi réel (API HTTPS, aucune dépendance) ;
 *  - `dev` : conserve les messages en mémoire et les affiche dans la console (développement et tests UNIQUEMENT) ;
 *  - `none` : aucun fournisseur configuré → l'envoi échoue honnêtement (`mail_unavailable`).
 */
import type { AppConfig } from '../config.js';
import { unavailable } from './errors.js';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  readonly provider: 'resend' | 'dev' | 'none';
  send(message: MailMessage): Promise<void>;
}

export interface DevMailer extends Mailer {
  readonly provider: 'dev';
  readonly outbox: MailMessage[];
}

export function createMailer(config: AppConfig): Mailer {
  if (config.mail.provider === 'resend') {
    const { resendKey, from } = config.mail;
    return {
      provider: 'resend',
      async send(m) {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from, to: [m.to], subject: m.subject, text: m.text }),
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) throw new Error(`resend ${res.status}`);
      },
    };
  }
  if (config.mail.provider === 'dev') return createDevMailer();
  return {
    provider: 'none',
    async send() {
      throw unavailable('mail_unavailable');
    },
  };
}

export function createDevMailer(): DevMailer {
  const outbox: MailMessage[] = [];
  return {
    provider: 'dev',
    outbox,
    async send(m) {
      outbox.push(m);
      if (outbox.length > 200) outbox.shift();
      if (process.env.NODE_ENV !== 'test') console.log(`[mail:dev] → ${m.to} · ${m.subject}\n${m.text}\n`);
    },
  };
}
