/**
 * Envoie un VRAI SMS de test (un code fictif) au numéro indiqué, via le fournisseur configuré (SMS8_API_KEY ou Twilio).
 * Chaque SMS consomme un crédit : à n'utiliser qu'avec VOTRE numéro.
 *   npm run sms:test -- +224622000000
 */
import { loadConfig } from '../server/config.js';
import { createOtpSender } from '../server/lib/otp-sender.js';
import { normalizePhone } from '../src/utilities/phone.js';

const phone = normalizePhone(process.argv[2] ?? '');
if (!phone) {
  console.error('Usage : npm run sms:test -- +224622000000');
  process.exit(1);
}
const config = loadConfig({ DATABASE_URL: 'postgres://inutile', NODE_ENV: 'development', ...process.env } as Record<string, string | undefined>);
if (config.otp.provider === 'dev' || config.otp.provider === 'none') {
  console.error(`Aucun fournisseur de SMS réel configuré (OTP_PROVIDER=${config.otp.provider}). Renseigner SMS8_API_KEY (ou TWILIO_*).`);
  process.exit(1);
}
const code = String(Math.floor(100000 + Math.random() * 900000));
await createOtpSender(config).send({ phone, channel: 'sms', code, ttlMinutes: 5, locale: 'fr' });
console.log(`SMS de test envoyé à ${phone} via ${config.otp.provider} (code fictif ${code}). Vérifiez la réception sur le téléphone.`);
