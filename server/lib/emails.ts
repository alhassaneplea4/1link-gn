/**
 * Gabarits des e-mails transactionnels (français par défaut, anglais selon la langue du compte).
 * Chaque message existe en version texte (secours, lisible partout) et en HTML sobre à la marque, sans image distante ni suivi.
 */
import type { MailMessage } from './mailer.js';

export type Locale = 'fr' | 'en';

export const pickLocale = (acceptLanguage: string | undefined): Locale => (/^\s*en/i.test(acceptLanguage ?? '') ? 'en' : 'fr');

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

interface Layout {
  locale: Locale;
  title: string;
  paragraphs: string[];
  cta?: { label: string; url: string };
  /** Texte discret sous le bouton (validité du lien, etc.). */
  small?: string;
}

const FOOTER = {
  fr: { tagline: 'Un lien, pour toute votre présence.', why: 'Vous recevez ce message parce qu’un compte 1Link est associé à cette adresse e-mail.', team: '— L’équipe 1Link' },
  en: { tagline: 'One link, for your whole presence.', why: 'You are receiving this message because a 1Link account is linked to this email address.', team: '— The 1Link team' },
} as const;

function render({ locale, title, paragraphs, cta, small }: Layout): { text: string; html: string } {
  const f = FOOTER[locale];
  const text = [title, '', ...paragraphs, ...(cta ? ['', `${cta.label} : ${cta.url}`] : []), ...(small ? ['', small] : []), '', f.team, f.why].join('\n');
  const button = cta
    ? `<p style="margin:28px 0"><a href="${esc(cta.url)}" style="background:#2563eb;color:#ffffff;text-decoration:none;font-weight:600;padding:13px 24px;border-radius:10px;display:inline-block">${esc(cta.label)}</a></p><p style="margin:0 0 4px;color:#6b7280;font-size:13px;word-break:break-all">${esc(cta.url)}</p>`
    : '';
  const html = `<!doctype html><html lang="${locale}"><body style="margin:0;background:#f3f4f6;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#111827">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td style="background:linear-gradient(135deg,#2563eb,#7c3aed);background-color:#2563eb;padding:22px 28px;color:#ffffff"><div style="font-size:22px;font-weight:800;letter-spacing:-0.02em">1Link</div><div style="font-size:13px;opacity:.9">${esc(f.tagline)}</div></td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 16px;font-size:21px;line-height:1.3">${esc(title)}</h1>
${paragraphs.map((p) => `<p style="margin:0 0 14px;line-height:1.6;font-size:15px">${esc(p)}</p>`).join('\n')}
${button}
${small ? `<p style="margin:12px 0 0;color:#6b7280;font-size:13px;line-height:1.5">${esc(small)}</p>` : ''}
<p style="margin:24px 0 0;font-size:14px">${esc(f.team)}</p>
</td></tr>
<tr><td style="padding:16px 28px;background:#f9fafb;color:#6b7280;font-size:12px;line-height:1.5">${esc(f.why)}</td></tr>
</table></td></tr></table></body></html>`;
  return { text, html };
}

const msg = (to: string, subject: string, layout: Layout): MailMessage => ({ to, subject, ...render(layout) });

/** Première inscription : accueil + confirmation de l'adresse dans un seul message (pas deux e-mails à la suite). */
export function welcomeMessage(to: string, name: string, link: string, locale: Locale): MailMessage {
  return locale === 'en'
    ? msg(to, 'Welcome to 1Link — confirm your email', {
        locale, title: `Welcome to 1Link, ${name}!`,
        paragraphs: ['Your account is ready. 1Link gathers your links, services and contacts on a single page you can share anywhere — WhatsApp, Instagram, TikTok, a business card.', 'One last step before you can publish: confirm your email address.'],
        cta: { label: 'Confirm my email address', url: link }, small: 'This link is valid for 24 hours. If you did not create a 1Link account, ignore this message.',
      })
    : msg(to, 'Bienvenue sur 1Link — confirmez votre adresse e-mail', {
        locale, title: `Bienvenue sur 1Link, ${name} !`,
        paragraphs: ['Votre compte est prêt. 1Link rassemble vos liens, services et contacts sur une seule page que vous partagez partout : WhatsApp, Instagram, TikTok, carte de visite.', 'Dernière étape avant de pouvoir publier : confirmez votre adresse e-mail.'],
        cta: { label: 'Confirmer mon adresse e-mail', url: link }, small: 'Ce lien est valable 24 heures. Si vous n’avez pas créé de compte 1Link, ignorez ce message.',
      });
}

/** Renvoi du lien de confirmation (sans le message d'accueil). */
export function verifyEmailMessage(to: string, name: string, link: string, locale: Locale): MailMessage {
  return locale === 'en'
    ? msg(to, 'Confirm your email address', { locale, title: `Hello ${name}`, paragraphs: ['Confirm your email address to publish your page.'], cta: { label: 'Confirm my email address', url: link }, small: 'This link is valid for 24 hours.' })
    : msg(to, 'Confirmez votre adresse e-mail', { locale, title: `Bonjour ${name}`, paragraphs: ['Confirmez votre adresse e-mail pour pouvoir publier votre page.'], cta: { label: 'Confirmer mon adresse e-mail', url: link }, small: 'Ce lien est valable 24 heures.' });
}

export function resetPasswordMessage(to: string, name: string, link: string, locale: Locale): MailMessage {
  return locale === 'en'
    ? msg(to, 'Reset your password', { locale, title: `Hello ${name}`, paragraphs: ['Someone asked to reset the password of your 1Link account. Choose a new one:'], cta: { label: 'Choose a new password', url: link }, small: 'This link is valid for 1 hour and can be used once. If you did not ask for it, ignore this message: your password is unchanged.' })
    : msg(to, 'Réinitialisez votre mot de passe', { locale, title: `Bonjour ${name}`, paragraphs: ['Une demande de réinitialisation du mot de passe de votre compte 1Link a été faite. Choisissez-en un nouveau :'], cta: { label: 'Choisir un nouveau mot de passe', url: link }, small: 'Ce lien est valable 1 heure et ne sert qu’une fois. Si vous n’êtes pas à l’origine de cette demande, ignorez ce message : votre mot de passe reste inchangé.' });
}

export function passwordChangedMessage(to: string, name: string, locale: Locale): MailMessage {
  return locale === 'en'
    ? msg(to, 'Your 1Link password was changed', { locale, title: `Hello ${name}`, paragraphs: ['The password of your 1Link account has just been changed and all your other sessions were signed out.', 'If this was not you, reset your password immediately and contact us.'] })
    : msg(to, 'Votre mot de passe 1Link a été modifié', { locale, title: `Bonjour ${name}`, paragraphs: ['Le mot de passe de votre compte 1Link vient d’être modifié et toutes vos autres sessions ont été fermées.', 'Si ce n’était pas vous, réinitialisez votre mot de passe immédiatement et contactez-nous.'] });
}

/** Première publication : la page est en ligne. */
export function pageLiveMessage(to: string, name: string, url: string, locale: Locale): MailMessage {
  return locale === 'en'
    ? msg(to, 'Your 1Link page is live 🎉', { locale, title: `Your page is live, ${name}!`, paragraphs: ['Anyone can now open your page. Share it on WhatsApp, in your Instagram bio or print your poster and business cards from your dashboard.'], cta: { label: 'Open my page', url }, small: 'Tip: use the tracked links in the Share window to see which channel brings the most visits.' })
    : msg(to, 'Votre page 1Link est en ligne 🎉', { locale, title: `Votre page est en ligne, ${name} !`, paragraphs: ['Tout le monde peut maintenant ouvrir votre page. Partagez-la sur WhatsApp, dans la bio de votre Instagram, ou imprimez votre affiche et vos cartes de visite depuis votre tableau de bord.'], cta: { label: 'Ouvrir ma page', url }, small: 'Astuce : utilisez les liens de suivi de la fenêtre « Partager » pour savoir quel canal vous apporte le plus de visites.' });
}

export function verificationDecisionMessage(to: string, name: string, approved: boolean, note: string, locale: Locale): MailMessage {
  const n = note.trim();
  return locale === 'en'
    ? msg(to, approved ? 'Your profile is now verified' : 'Your verification request was not approved', {
        locale, title: approved ? 'Verified profile ✔' : 'Verification not approved', paragraphs: approved
          ? [`Good news ${name}: the “Verified profile” badge now appears on your public page.`, ...(n ? [`Note from the team: ${n}`] : [])]
          : [`Hello ${name}, we could not approve your verification request.`, ...(n ? [`Reason: ${n}`] : []), 'You can submit a new request from your account settings once the point is fixed.'],
      })
    : msg(to, approved ? 'Votre profil est maintenant vérifié' : 'Votre demande de vérification n’a pas été acceptée', {
        locale, title: approved ? 'Profil vérifié ✔' : 'Vérification non acceptée', paragraphs: approved
          ? [`Bonne nouvelle ${name} : le badge « Profil vérifié » apparaît désormais sur votre page publique.`, ...(n ? [`Message de l’équipe : ${n}`] : [])]
          : [`Bonjour ${name}, nous n’avons pas pu accepter votre demande de vérification.`, ...(n ? [`Motif : ${n}`] : []), 'Vous pouvez refaire une demande depuis les paramètres de votre compte une fois le point corrigé.'],
      });
}

export type AccountNotice = 'account_suspended' | 'account_reinstated' | 'page_suspended' | 'page_reinstated';

export function accountNoticeMessage(to: string, name: string, kind: AccountNotice, locale: Locale): MailMessage {
  const fr = {
    account_suspended: ['Votre compte 1Link a été suspendu', 'Votre compte a été suspendu par notre équipe de modération. Votre page n’est plus visible et vous ne pouvez plus vous connecter.', 'Si vous pensez à une erreur, répondez à ce message pour demander un réexamen.'],
    account_reinstated: ['Votre compte 1Link est réactivé', 'Votre compte est de nouveau actif : vous pouvez vous connecter.', 'Merci de respecter les conditions d’utilisation.'],
    page_suspended: ['Votre page 1Link a été suspendue', 'Après examen d’un signalement, votre page a été suspendue : elle n’est plus visible du public.', 'Si vous pensez à une erreur, répondez à ce message pour demander un réexamen.'],
    page_reinstated: ['Votre page 1Link est de nouveau en ligne', 'Après examen, votre page a été réactivée et est de nouveau visible.', 'Merci de respecter les conditions d’utilisation.'],
  } as const;
  const en = {
    account_suspended: ['Your 1Link account was suspended', 'Your account was suspended by our moderation team. Your page is no longer visible and you can no longer sign in.', 'If you think this is a mistake, reply to this message to ask for a review.'],
    account_reinstated: ['Your 1Link account is active again', 'Your account is active again: you can sign in.', 'Please respect the terms of use.'],
    page_suspended: ['Your 1Link page was suspended', 'After reviewing a report, your page was suspended: it is no longer visible to the public.', 'If you think this is a mistake, reply to this message to ask for a review.'],
    page_reinstated: ['Your 1Link page is back online', 'After review, your page was reinstated and is visible again.', 'Please respect the terms of use.'],
  } as const;
  const [subject, body, closing] = (locale === 'en' ? en : fr)[kind];
  return msg(to, subject, { locale, title: locale === 'en' ? `Hello ${name}` : `Bonjour ${name}`, paragraphs: [body, closing] });
}

export function moderationWarningMessage(to: string, name: string, note: string, locale: Locale = 'fr'): MailMessage {
  const n = note.trim();
  return locale === 'en'
    ? msg(to, 'Warning about your 1Link page', { locale, title: `Hello ${name}`, paragraphs: ['Our moderation team reviewed a report about your page.', ...(n ? [`Message from moderation: ${n}`] : []), 'Please check that your content respects the terms of use. If nothing changes, your page may be suspended.'] })
    : msg(to, 'Avertissement concernant votre page 1Link', { locale, title: `Bonjour ${name}`, paragraphs: ['L’équipe de modération a examiné un signalement concernant votre page.', ...(n ? [`Message de la modération : ${n}`] : []), 'Merci de vérifier que votre contenu respecte les conditions d’utilisation. Sans modification, votre page pourra être suspendue.'] });
}

export type SecurityNotice = 'two_factor_on' | 'two_factor_off' | 'phone_linked' | 'phone_removed';

export function securityNoticeMessage(to: string, name: string, kind: SecurityNotice, locale: Locale): MailMessage {
  const fr = {
    two_factor_on: ['Double authentification activée', 'La double authentification par SMS est maintenant active : un code vous sera demandé à chaque connexion.'],
    two_factor_off: ['Double authentification désactivée', 'La double authentification par SMS vient d’être désactivée sur votre compte.'],
    phone_linked: ['Un numéro de téléphone a été ajouté à votre compte', 'Un numéro de téléphone vérifié vient d’être associé à votre compte 1Link.'],
    phone_removed: ['Le numéro de téléphone de votre compte a été retiré', 'Le numéro de téléphone associé à votre compte 1Link vient d’être retiré (la double authentification est désactivée).'],
  } as const;
  const en = {
    two_factor_on: ['Two-step verification enabled', 'Two-step verification by SMS is now active: a code will be requested every time you sign in.'],
    two_factor_off: ['Two-step verification disabled', 'Two-step verification by SMS was just turned off on your account.'],
    phone_linked: ['A phone number was added to your account', 'A verified phone number was just linked to your 1Link account.'],
    phone_removed: ['The phone number was removed from your account', 'The phone number linked to your 1Link account was just removed (two-step verification is off).'],
  } as const;
  const [subject, body] = (locale === 'en' ? en : fr)[kind];
  const warn = locale === 'en' ? 'If this was not you, reset your password immediately and contact us.' : 'Si ce n’était pas vous, réinitialisez immédiatement votre mot de passe et contactez-nous.';
  return msg(to, subject, { locale, title: locale === 'en' ? `Hello ${name}` : `Bonjour ${name}`, paragraphs: [body, warn] });
}

export function otpMessage(code: string, minutes: number, locale: Locale): string {
  return locale === 'en'
    ? `Your 1Link code: ${code}. Valid for ${minutes} minutes. Never share it with anyone.`
    : `Votre code 1Link : ${code}. Valable ${minutes} minutes. Ne le communiquez à personne.`;
}

export function accountDeletedMessage(to: string, name: string, locale: Locale): MailMessage {
  return locale === 'en'
    ? msg(to, 'Your 1Link account was deleted', { locale, title: `Goodbye ${name}`, paragraphs: ['As requested, your 1Link account, your page, your images and your personal data have been deleted.', 'If you did not ask for this, contact us right away.'] })
    : msg(to, 'Votre compte 1Link a été supprimé', { locale, title: `Au revoir ${name}`, paragraphs: ['À votre demande, votre compte 1Link, votre page, vos images et vos données personnelles ont été supprimés.', 'Si vous n’êtes pas à l’origine de cette demande, contactez-nous immédiatement.'] });
}
