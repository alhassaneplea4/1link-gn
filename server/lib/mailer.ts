/**
 * E-mails transactionnels. Implémentations :
 *  - `smtp` : envoi réel par un serveur SMTP (ex. Gmail avec un mot de passe d'application) ;
 *  - `resend` : envoi réel (API HTTPS) ;
 *  - `dev` : conserve les messages en mémoire et les affiche dans la console (développement et tests UNIQUEMENT) ;
 *  - `none` : aucun fournisseur configuré → l'envoi échoue honnêtement (`mail_unavailable`).
 */
import nodemailer from 'nodemailer';
import type { AppConfig } from '../config.js';
import { unavailable } from './errors.js';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  /** Version mise en forme (facultative) ; `text` reste la version de secours. */
  html?: string;
}

export interface Mailer {
  readonly provider: 'smtp' | 'resend' | 'dev' | 'none';
  send(message: MailMessage): Promise<void>;
}

export interface DevMailer extends Mailer {
  readonly provider: 'dev';
  readonly outbox: MailMessage[];
}

export function createMailer(config: AppConfig): Mailer {
  if (config.mail.provider === 'smtp') {
    const { smtp, from } = config.mail;
    // Transport réutilisé entre les requêtes (une instance serverless garde sa connexion tant qu'elle vit).
    const transport = nodemailer.createTransport({
      host: smtp.host, port: smtp.port, secure: smtp.secure, auth: { user: smtp.user, pass: smtp.pass },
      connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000,
    });
    return {
      provider: 'smtp',
      async send(m) {
        await transport.sendMail({ from, to: m.to, subject: m.subject, text: m.text, ...(m.html ? { html: m.html } : {}) });
      },
    };
  }
  if (config.mail.provider === 'resend') {
    const { resendKey, from } = config.mail;
    return {
      provider: 'resend',
      async send(m) {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from, to: [m.to], subject: m.subject, text: m.text, ...(m.html ? { html: m.html } : {}) }),
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
