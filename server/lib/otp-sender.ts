/**
 * Envoi des codes à usage unique par WhatsApp ou SMS.
 *  - `twilio` : API REST Twilio (WhatsApp et SMS) ;
 *  - `dev` : n'envoie rien, mémorise le message (développement et tests UNIQUEMENT — la route renvoie alors `devCode`) ;
 *  - `none` : aucun fournisseur → la demande de code échoue honnêtement (`otp_unavailable`).
 */
import type { AppConfig } from '../config.js';
import type { OtpChannel } from '../../src/models/auth.js';
import { unavailable } from './errors.js';
import { otpMessage, type Locale } from './emails.js';

export interface OtpDelivery {
  phone: string;
  channel: OtpChannel;
  code: string;
  ttlMinutes: number;
  locale: Locale;
}

export interface OtpSender {
  readonly provider: 'twilio' | 'dev' | 'none';
  send(d: OtpDelivery): Promise<void>;
}

export interface DevOtpSender extends OtpSender {
  readonly provider: 'dev';
  readonly sent: OtpDelivery[];
}

export function createOtpSender(config: AppConfig): OtpSender {
  if (config.otp.provider === 'twilio') {
    const tw = config.otp.twilio;
    const auth = `Basic ${Buffer.from(`${tw.sid}:${tw.token}`).toString('base64')}`;
    return {
      provider: 'twilio',
      async send(d) {
        const form = new URLSearchParams();
        if (d.channel === 'whatsapp') {
          if (!tw.whatsappFrom && !tw.messagingServiceSid) throw unavailable('otp_unavailable');
          form.set('To', `whatsapp:${d.phone}`);
          if (tw.messagingServiceSid) form.set('MessagingServiceSid', tw.messagingServiceSid);
          else form.set('From', `whatsapp:${tw.whatsappFrom.replace(/^whatsapp:/, '')}`);
          // Les messages WhatsApp initiés par l'entreprise exigent un modèle approuvé (catégorie « Authentication »).
          if (tw.whatsappContentSid) {
            form.set('ContentSid', tw.whatsappContentSid);
            form.set('ContentVariables', JSON.stringify({ 1: d.code }));
          } else form.set('Body', otpMessage(d.code, d.ttlMinutes, d.locale));
        } else {
          if (!tw.smsFrom && !tw.messagingServiceSid) throw unavailable('otp_unavailable');
          form.set('To', d.phone);
          if (tw.messagingServiceSid) form.set('MessagingServiceSid', tw.messagingServiceSid);
          else form.set('From', tw.smsFrom);
          form.set('Body', otpMessage(d.code, d.ttlMinutes, d.locale));
        }
        const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${tw.sid}/Messages.json`, {
          method: 'POST',
          headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: form,
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) throw new Error(`twilio ${res.status}`);
      },
    };
  }
  if (config.otp.provider === 'dev') return createDevOtpSender();
  return {
    provider: 'none',
    async send() {
      throw unavailable('otp_unavailable');
    },
  };
}

export function createDevOtpSender(): DevOtpSender {
  const sent: OtpDelivery[] = [];
  return {
    provider: 'dev',
    sent,
    async send(d) {
      sent.push(d);
      if (sent.length > 200) sent.shift();
    },
  };
}
