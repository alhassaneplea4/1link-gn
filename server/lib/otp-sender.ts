/**
 * Envoi des codes à usage unique par WhatsApp ou SMS.
 *  - `smsmobile` : passerelle smsmobileapi.com (SMS envoyés par un téléphone Android appairé) ;
 *  - `sms8` : passerelle SMS8.io (SMS envoyés par un téléphone Android appairé ; pas de WhatsApp) ;
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
  readonly provider: 'smsmobile' | 'sms8' | 'twilio' | 'dev' | 'none';
  /** Retourne le canal RÉELLEMENT utilisé quand il diffère de la demande (ex. WhatsApp demandé, SMS envoyé). */
  send(d: OtpDelivery): Promise<{ channel: OtpChannel } | void>;
}

export interface DevOtpSender extends OtpSender {
  readonly provider: 'dev';
  readonly sent: OtpDelivery[];
}

export function createOtpSender(config: AppConfig): OtpSender {
  if (config.otp.provider === 'smsmobile') {
    const { apiKey, baseUrl, port, device, whatsapp } = config.otp.smsmobile;
    return {
      provider: 'smsmobile',
      async send(d) {
        const viaWhatsapp = whatsapp && d.channel === 'whatsapp';
        // La clé voyage dans le CORPS (POST), jamais dans l'URL (journaux d'accès, historique).
        const form = new URLSearchParams({ apikey: apiKey, recipients: d.phone.replace(/^\+/, ''), message: otpMessage(d.code, d.ttlMinutes, d.locale), sendsms: viaWhatsapp ? '0' : '1', sendwa: viaWhatsapp ? '1' : '0' });
        if (port) form.set('port', port);
        if (device) form.set('sIdentifiant', device);
        const res = await fetch(`${baseUrl}/sendsms/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
          body: form,
          signal: AbortSignal.timeout(20_000),
        });
        const text = await res.text();
        let result = {} as { error?: number | string; sent?: string };
        try {
          result = ((JSON.parse(text) as { result?: typeof result }).result ?? {}) as typeof result;
        } catch {
          /* réponse non JSON : échec ci-dessous */
        }
        // Succès = HTTP 200 ET error = 0 ET sent = "1" (l'API répond 200 même pour une clé invalide : error "50", sent "api_error").
        if (!res.ok || Number(result.error) !== 0 || String(result.sent) !== '1') throw new Error(`smsmobileapi ${res.status} error=${String(result.error)} sent=${String(result.sent)}`);
        // WhatsApp n'est utilisé que si le compte le gère et que l'opérateur l'a activé ; sinon le message est parti par SMS.
        return d.channel === 'whatsapp' && !viaWhatsapp ? { channel: 'sms' as const } : undefined;
      },
    };
  }
  if (config.otp.provider === 'sms8') {
    const { apiKey, baseUrl, devices, option } = config.otp.sms8;
    return {
      provider: 'sms8',
      async send(d) {
        const form = new URLSearchParams();
        form.set('key', apiKey);
        form.set('messages', JSON.stringify([{ number: d.phone, message: otpMessage(d.code, d.ttlMinutes, d.locale), type: 'sms' }]));
        form.set('option', String(option));
        if (devices) form.set('devices', devices);
        form.set('prioritize', '1'); // un code ne doit pas attendre derrière une campagne
        const res = await fetch(`${baseUrl}/api/v1/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
          body: form,
          signal: AbortSignal.timeout(15_000),
        });
        const text = await res.text();
        let body = {} as { success?: boolean; error?: unknown };
        try {
          body = (JSON.parse(text) ?? {}) as typeof body;
        } catch {
          /* réponse non JSON : on se fie au statut HTTP */
        }
        if (!res.ok || body.success === false || body.error) throw new Error(`sms8 ${res.status}`);
        // SMS8 n'envoie que des SMS : si WhatsApp était demandé, l'interface doit annoncer « SMS ».
        return d.channel === 'sms' ? undefined : { channel: 'sms' as const };
      },
    };
  }
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
