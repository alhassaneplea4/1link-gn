/** Gabarits des e-mails (français par défaut, anglais selon `Accept-Language`). Texte brut : lisible partout. */
import type { MailMessage } from './mailer.js';

export type Locale = 'fr' | 'en';

export const pickLocale = (acceptLanguage: string | undefined): Locale => (/^\s*en/i.test(acceptLanguage ?? '') ? 'en' : 'fr');

const SIGNATURE = { fr: '— L’équipe 1Link', en: '— The 1Link team' } as const;

export function verifyEmailMessage(to: string, name: string, link: string, locale: Locale): MailMessage {
  return locale === 'en'
    ? { to, subject: 'Confirm your email address', text: `Hello ${name},\n\nConfirm your email address to publish your page:\n${link}\n\nThis link is valid for 24 hours. If you did not create a 1Link account, ignore this message.\n\n${SIGNATURE.en}` }
    : { to, subject: 'Confirmez votre adresse e-mail', text: `Bonjour ${name},\n\nConfirmez votre adresse e-mail pour pouvoir publier votre page :\n${link}\n\nCe lien est valable 24 heures. Si vous n’avez pas créé de compte 1Link, ignorez ce message.\n\n${SIGNATURE.fr}` };
}

export function resetPasswordMessage(to: string, name: string, link: string, locale: Locale): MailMessage {
  return locale === 'en'
    ? { to, subject: 'Reset your password', text: `Hello ${name},\n\nChoose a new password:\n${link}\n\nThis link is valid for 1 hour and can be used once. If you did not ask for it, ignore this message: your password is unchanged.\n\n${SIGNATURE.en}` }
    : { to, subject: 'Réinitialisez votre mot de passe', text: `Bonjour ${name},\n\nChoisissez un nouveau mot de passe :\n${link}\n\nCe lien est valable 1 heure et ne sert qu’une fois. Si vous n’êtes pas à l’origine de cette demande, ignorez ce message : votre mot de passe reste inchangé.\n\n${SIGNATURE.fr}` };
}

export function moderationWarningMessage(to: string, name: string, note: string): MailMessage {
  return {
    to,
    subject: 'Avertissement concernant votre page 1Link',
    text: `Bonjour ${name},\n\nL’équipe de modération a examiné un signalement concernant votre page.${note ? `\n\nMessage de la modération : ${note}` : ''}\n\nMerci de vérifier que votre contenu respecte les conditions d’utilisation. Sans modification, votre page pourra être suspendue.\n\n${SIGNATURE.fr}`,
  };
}

export function otpMessage(code: string, minutes: number, locale: Locale): string {
  return locale === 'en'
    ? `Your 1Link code: ${code}. Valid for ${minutes} minutes. Never share it with anyone.`
    : `Votre code 1Link : ${code}. Valable ${minutes} minutes. Ne le communiquez à personne.`;
}
