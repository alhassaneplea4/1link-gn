/**
 * Textes juridiques (politique de confidentialité, conditions d'utilisation, suppression du compte).
 * Ils décrivent ce que la plateforme fait réellement : toute évolution du traitement des données doit s'accompagner
 * d'une mise à jour de ce fichier (et de la date `UPDATED`). À faire relire par un juriste avant lancement commercial.
 */
export const UPDATED = '2026-10-12';
export const CONTACT_EMAIL = 'astronetgn@gmail.com';

export interface LegalSection {
  title: string;
  paragraphs?: string[];
  items?: string[];
}
export interface LegalDocument {
  title: string;
  intro: string;
  updated: string;
  sections: LegalSection[];
}
export type LegalKind = 'privacy' | 'terms' | 'deleteAccount';
export type LegalLocale = 'fr' | 'en';

const privacyFr: LegalDocument = {
  title: 'Politique de confidentialité',
  updated: 'Dernière mise à jour : 12 octobre 2026',
  intro: 'Cette politique explique quelles données 1Link collecte, pourquoi, avec qui elles sont partagées, combien de temps elles sont conservées et comment exercer vos droits. 1Link est édité par ASTRONET GN INC, Conakry, Guinée.',
  sections: [
    {
      title: '1. Qui est responsable de vos données ?',
      paragraphs: [`Le responsable du traitement est ASTRONET GN INC (Conakry, Guinée), éditeur de 1Link. Pour toute question sur vos données : ${CONTACT_EMAIL}.`],
    },
    {
      title: '2. Les données que nous collectons',
      items: [
        'Données de compte : nom, adresse e-mail et/ou numéro de téléphone, langue, type de profil choisi. Le mot de passe n’est jamais conservé en clair : seule une empreinte irréversible (scrypt) est stockée.',
        'Contenu de votre page : textes, liens, coordonnées que vous choisissez d’afficher, images que vous téléversez. Une fois votre page publiée, ce contenu est public : n’y mettez que ce que vous acceptez de montrer à tout le monde.',
        'Statistiques d’audience de votre page : nombre de vues et de clics, canal d’origine (paramètre de lien), pays approximatif. Aucun cookie n’est déposé chez vos visiteurs et leur adresse IP n’est pas conservée avec ces statistiques : un visiteur du jour est compté grâce à une empreinte technique qui change chaque jour et ne permet pas de le reconnaître d’un jour à l’autre.',
        'Données de sécurité : adresse IP et navigateur associés à vos sessions de connexion, aux tentatives de connexion et aux demandes de codes, afin de protéger les comptes contre les abus.',
        'Codes de vérification (SMS) : conservés sous forme d’empreinte, valables 5 minutes.',
        'Signalements : si vous signalez une page, le motif et vos précisions sont transmis à la modération (le signalement est anonyme pour le titulaire de la page).',
      ],
    },
    {
      title: '3. Pourquoi nous les utilisons',
      items: [
        'Fournir le service : créer votre compte, héberger et publier votre page, vous connecter (mot de passe, code SMS, double authentification).',
        'Vous envoyer des messages liés à votre compte : confirmation d’adresse, réinitialisation de mot de passe, avis de sécurité, page en ligne, décisions de modération. Nous n’envoyons pas de publicité.',
        'Assurer la sécurité et lutter contre la fraude et les abus (limitation du nombre de tentatives, modération des pages signalées).',
        'Vous montrer les statistiques de votre propre page.',
        'Respecter nos obligations légales.',
      ],
      paragraphs: ['Ces traitements reposent sur l’exécution du service que vous demandez, sur notre intérêt légitime à protéger la plateforme et, le cas échéant, sur nos obligations légales.'],
    },
    {
      title: '4. Avec qui sont-elles partagées ?',
      paragraphs: ['Nous ne vendons aucune donnée personnelle. Nous faisons appel à des prestataires techniques qui traitent des données pour notre compte :'],
      items: [
        'Vercel Inc. : hébergement de l’application (États-Unis / réseau mondial).',
        'Neon : base de données PostgreSQL qui contient vos données.',
        'Google (Gmail / SMTP) : envoi des e-mails liés à votre compte.',
        'smsmobileapi.com : transmission des SMS de vérification (votre numéro de téléphone et le code).',
      ],
    },
    {
      title: '5. Transferts hors de Guinée',
      paragraphs: ['Nos prestataires peuvent traiter des données hors de Guinée, notamment aux États-Unis et en Europe. Nous choisissons des prestataires qui appliquent des mesures de sécurité reconnues (chiffrement des échanges, contrôle des accès).'],
    },
    {
      title: '6. Combien de temps les conservons-nous ?',
      items: [
        'Compte, page et images : tant que votre compte existe, puis effacés à sa suppression.',
        'Sessions de connexion : 30 jours au plus (12 heures pour l’administration), puis effacées.',
        'Codes de vérification et compteurs anti-abus : de quelques minutes à 2 jours.',
        'Statistiques d’audience détaillées : 400 jours au plus.',
        'Journaux de sécurité : 12 mois au plus ; journaux d’erreurs techniques : 90 jours.',
      ],
    },
    {
      title: '7. Vos droits',
      paragraphs: ['Vous pouvez à tout moment accéder à vos données, les corriger, vous opposer à un traitement ou demander leur effacement. La plupart de ces actions se font directement dans votre espace (Paramètres, Sécurité). Vous pouvez supprimer définitivement votre compte vous-même : voir la page « Supprimer mon compte ». Pour toute autre demande (accès, portabilité…), écrivez-nous ; nous répondons sous 30 jours.', 'Vous pouvez aussi saisir l’autorité compétente en matière de protection des données personnelles si vous estimez que vos droits ne sont pas respectés.'],
    },
    {
      title: '8. Cookies et stockage local',
      paragraphs: ['1Link n’utilise aucun cookie publicitaire ni traceur d’analyse tiers. Un seul cookie est déposé quand vous vous connectez : le cookie de session, strictement nécessaire, protégé (HttpOnly, Secure). Le navigateur conserve aussi vos préférences d’affichage (langue, thème, mode économe). Aucune donnée de votre compte n’est stockée dans le navigateur.'],
    },
    {
      title: '9. Paiements',
      paragraphs: ['1Link ne traite aucun paiement et ne collecte aucun numéro de carte ni de compte bancaire. Les moyens de paiement que vous affichez sur votre page (Mobile Money, virement…) sont de simples informations que vos visiteurs utilisent en dehors de 1Link, sous votre responsabilité.'],
    },
    {
      title: '10. Mineurs',
      paragraphs: ['1Link s’adresse aux personnes âgées d’au moins 16 ans. Si vous pensez qu’un mineur de moins de 16 ans a créé un compte, contactez-nous : nous supprimerons ses données.'],
    },
    {
      title: '11. Sécurité',
      paragraphs: ['Les échanges sont chiffrés (HTTPS), les mots de passe sont protégés par une empreinte irréversible, les sessions sont inaccessibles au JavaScript du navigateur, le nombre de tentatives est limité et une double authentification par SMS est disponible. Aucun système n’étant infaillible, nous vous informerons en cas d’incident affectant vos données.'],
    },
    {
      title: '12. Modifications',
      paragraphs: ['Nous pouvons mettre à jour cette politique ; la date en haut de page indique la dernière version. En cas de changement important, nous vous en informerons dans le service.'],
    },
  ],
};

const privacyEn: LegalDocument = {
  title: 'Privacy policy',
  updated: 'Last updated: 12 October 2026',
  intro: 'This policy explains which data 1Link collects, why, who it is shared with, how long it is kept and how to exercise your rights. 1Link is published by ASTRONET GN INC, Conakry, Guinea.',
  sections: [
    { title: '1. Who is responsible for your data?', paragraphs: [`The data controller is ASTRONET GN INC (Conakry, Guinea), publisher of 1Link. For any question about your data: ${CONTACT_EMAIL}.`] },
    {
      title: '2. Data we collect',
      items: [
        'Account data: name, email address and/or phone number, language, chosen profile type. Your password is never stored in clear text: only an irreversible hash (scrypt) is kept.',
        'Your page content: texts, links, contact details you choose to display, images you upload. Once your page is published this content is public: only add what you are happy to show to everyone.',
        'Your page audience statistics: number of views and clicks, origin channel (link parameter), approximate country. No cookie is set on your visitors and their IP address is not stored with these statistics: a daily visitor is counted using a technical fingerprint that changes every day and cannot be used to recognise someone from one day to the next.',
        'Security data: IP address and browser linked to your sign-in sessions, sign-in attempts and code requests, to protect accounts against abuse.',
        'Verification codes (SMS): stored as a hash, valid for 5 minutes.',
        'Reports: if you report a page, the reason and your details are sent to moderation (the report is anonymous for the page owner).',
      ],
    },
    {
      title: '3. Why we use it',
      items: [
        'To provide the service: create your account, host and publish your page, sign you in (password, SMS code, two-step verification).',
        'To send you messages about your account: email confirmation, password reset, security notices, page live, moderation decisions. We do not send advertising.',
        'To keep the platform safe and fight fraud and abuse (attempt limits, moderation of reported pages).',
        'To show you the statistics of your own page.',
        'To meet our legal obligations.',
      ],
      paragraphs: ['These uses are based on performing the service you ask for, on our legitimate interest in protecting the platform and, where applicable, on legal obligations.'],
    },
    {
      title: '4. Who it is shared with',
      paragraphs: ['We do not sell personal data. We use technical providers that process data on our behalf:'],
      items: [
        'Vercel Inc.: application hosting (United States / global network).',
        'Neon: the PostgreSQL database that holds your data.',
        'Google (Gmail / SMTP): sending of account-related emails.',
        'smsmobileapi.com: delivery of verification SMS (your phone number and the code).',
      ],
    },
    { title: '5. Transfers outside Guinea', paragraphs: ['Our providers may process data outside Guinea, in particular in the United States and Europe. We choose providers that apply recognised security measures (encrypted traffic, access control).'] },
    {
      title: '6. How long we keep it',
      items: [
        'Account, page and images: as long as your account exists, then erased when it is deleted.',
        'Sign-in sessions: 30 days at most (12 hours for administration), then erased.',
        'Verification codes and anti-abuse counters: from a few minutes to 2 days.',
        'Detailed audience statistics: 400 days at most.',
        'Security logs: 12 months at most; technical error logs: 90 days.',
      ],
    },
    {
      title: '7. Your rights',
      paragraphs: ['You can at any time access your data, correct it, object to a use or ask for its erasure. Most of these actions are available in your space (Settings, Security). You can permanently delete your account yourself: see the “Delete my account” page. For any other request (access, portability…) write to us; we answer within 30 days.', 'You may also contact the competent personal data protection authority if you believe your rights are not respected.'],
    },
    {
      title: '8. Cookies and local storage',
      paragraphs: ['1Link uses no advertising cookie or third-party analytics tracker. A single cookie is set when you sign in: the session cookie, strictly necessary and protected (HttpOnly, Secure). Your browser also keeps your display preferences (language, theme, data-saving mode). No account data is stored in the browser.'],
    },
    { title: '9. Payments', paragraphs: ['1Link does not process any payment and does not collect card or bank account numbers. The payment methods you display on your page (Mobile Money, transfer…) are simply information your visitors use outside 1Link, under your responsibility.'] },
    { title: '10. Minors', paragraphs: ['1Link is intended for people aged 16 or over. If you believe someone under 16 has created an account, contact us: we will delete their data.'] },
    { title: '11. Security', paragraphs: ['Traffic is encrypted (HTTPS), passwords are protected by an irreversible hash, sessions cannot be read by browser JavaScript, attempts are rate-limited and SMS two-step verification is available. As no system is infallible, we will inform you of any incident affecting your data.'] },
    { title: '12. Changes', paragraphs: ['We may update this policy; the date at the top shows the latest version. We will notify you in the service of any important change.'] },
  ],
};

const termsFr: LegalDocument = {
  title: 'Conditions d’utilisation',
  updated: 'Dernière mise à jour : 12 octobre 2026',
  intro: 'En créant un compte ou en utilisant 1Link, vous acceptez les présentes conditions. Si vous n’êtes pas d’accord, n’utilisez pas le service.',
  sections: [
    { title: '1. Le service', paragraphs: ['1Link permet de créer une page publique personnalisée qui rassemble vos liens, réseaux, services, contacts et informations pratiques, partageable à l’adresse 1link-gn.vercel.app/votre-pseudo. 1Link est édité par ASTRONET GN INC (Conakry, Guinée).'] },
    { title: '2. Votre compte', items: ['Vous devez avoir au moins 16 ans et fournir des informations exactes.', 'Vous êtes responsable de la confidentialité de votre mot de passe et de ce qui se passe sur votre compte. Activez la double authentification si possible.', 'Un compte est personnel ; il ne peut être ni vendu ni cédé.'] },
    {
      title: '3. Votre contenu',
      paragraphs: ['Vous restez propriétaire de ce que vous publiez. Vous nous accordez uniquement le droit de l’héberger et de l’afficher pour faire fonctionner le service (page publique, aperçus de partage, moteurs de recherche). Vous garantissez avoir le droit de publier ce contenu (textes, images, marques, coordonnées de tiers…).'],
    },
    {
      title: '4. Règles d’usage',
      paragraphs: ['Il est interdit de publier ou de faire la promotion de :'],
      items: [
        'des contenus illégaux, haineux, violents, pornographiques ou portant atteinte aux mineurs ;',
        'des arnaques, escroqueries, faux produits ou fausses promesses de gains ;',
        'l’usurpation d’identité ou l’imitation trompeuse d’une personne, d’une marque ou d’un organisme ;',
        'des contenus violant des droits d’auteur ou d’autres droits de tiers ;',
        'des logiciels malveillants, du spam, ou toute tentative de perturber ou d’attaquer le service.',
      ],
    },
    { title: '5. Modération', paragraphs: ['Toute personne peut signaler une page. L’équipe peut avertir, masquer une page, suspendre ou supprimer un compte qui enfreint ces conditions ou la loi, avec ou sans préavis en cas de risque pour autrui. Le badge « Profil vérifié » est accordé uniquement après examen d’une demande et peut être retiré.'] },
    { title: '6. Offres et paiements', paragraphs: ['1Link propose une offre gratuite et des offres payantes (Pro, Business) dont le contenu et les prix sont indiqués sur la page Tarifs. 1Link ne traite aucun paiement entre vous et vos visiteurs : les commandes se font par WhatsApp et les moyens de paiement affichés sont de simples informations, sous votre seule responsabilité. Les conditions de facturation d’une offre payante vous sont communiquées avant toute souscription.'] },
    { title: '7. Disponibilité', paragraphs: ['Nous faisons de notre mieux pour que 1Link soit disponible en continu, mais le service est fourni « en l’état », sans garantie d’absence d’interruption ou d’erreur. Les envois de SMS et d’e-mails dépendent d’opérateurs tiers.'] },
    { title: '8. Responsabilité', paragraphs: ['Dans les limites permises par la loi, ASTRONET GN INC n’est pas responsable des contenus publiés par les utilisateurs, des échanges entre un utilisateur et ses visiteurs, ni des dommages indirects (perte de revenus, d’audience, de données…). Vous êtes responsable de l’usage que vous faites du service.'] },
    { title: '9. Fin du compte', paragraphs: ['Vous pouvez supprimer votre compte à tout moment depuis Paramètres → Supprimer mon compte ; vos données sont alors effacées (voir la politique de confidentialité). Nous pouvons suspendre ou supprimer un compte en cas de violation des présentes conditions.'] },
    { title: '10. Données personnelles', paragraphs: ['Le traitement de vos données est décrit dans la politique de confidentialité, qui fait partie des présentes conditions.'] },
    { title: '11. Modifications', paragraphs: ['Nous pouvons faire évoluer ces conditions ; la date en haut de page indique la dernière version. Continuer à utiliser le service après une modification vaut acceptation.'] },
    { title: '12. Droit applicable et contact', paragraphs: [`Les présentes conditions sont régies par le droit guinéen. Pour toute question ou réclamation : ${CONTACT_EMAIL}.`] },
  ],
};

const termsEn: LegalDocument = {
  title: 'Terms of use',
  updated: 'Last updated: 12 October 2026',
  intro: 'By creating an account or using 1Link you accept these terms. If you do not agree, do not use the service.',
  sections: [
    { title: '1. The service', paragraphs: ['1Link lets you create a personalised public page that gathers your links, social networks, services, contacts and practical information, shareable at 1link-gn.vercel.app/your-username. 1Link is published by ASTRONET GN INC (Conakry, Guinea).'] },
    { title: '2. Your account', items: ['You must be at least 16 and provide accurate information.', 'You are responsible for keeping your password confidential and for what happens on your account. Turn on two-step verification where possible.', 'An account is personal; it may not be sold or transferred.'] },
    { title: '3. Your content', paragraphs: ['You remain the owner of what you publish. You only grant us the right to host and display it to run the service (public page, sharing previews, search engines). You guarantee you have the right to publish this content (texts, images, brands, third-party contact details…).'] },
    {
      title: '4. Rules of use',
      paragraphs: ['You may not publish or promote:'],
      items: [
        'illegal, hateful, violent or pornographic content, or content harming minors;',
        'scams, fraud, counterfeit products or false promises of earnings;',
        'impersonation or misleading imitation of a person, brand or organisation;',
        'content infringing copyright or other third-party rights;',
        'malware, spam, or any attempt to disrupt or attack the service.',
      ],
    },
    { title: '5. Moderation', paragraphs: ['Anyone can report a page. The team may warn, hide a page, suspend or delete an account that breaches these terms or the law, with or without notice where others are at risk. The “Verified profile” badge is granted only after a request is reviewed and may be removed.'] },
    { title: '6. Plans and payments', paragraphs: ['1Link offers a free plan and paid plans (Pro, Business) whose content and prices are shown on the Pricing page. 1Link does not process any payment between you and your visitors: orders are placed through WhatsApp and the payment methods displayed are simple information, under your sole responsibility. Billing terms of a paid plan are communicated to you before any subscription.'] },
    { title: '7. Availability', paragraphs: ['We do our best to keep 1Link available at all times, but the service is provided “as is”, with no guarantee of uninterrupted or error-free operation. SMS and email delivery depend on third-party operators.'] },
    { title: '8. Liability', paragraphs: ['To the extent permitted by law, ASTRONET GN INC is not liable for content published by users, for exchanges between a user and their visitors, or for indirect damages (loss of income, audience, data…). You are responsible for how you use the service.'] },
    { title: '9. Ending your account', paragraphs: ['You can delete your account at any time from Settings → Delete my account; your data is then erased (see the privacy policy). We may suspend or delete an account that breaches these terms.'] },
    { title: '10. Personal data', paragraphs: ['The processing of your data is described in the privacy policy, which is part of these terms.'] },
    { title: '11. Changes', paragraphs: ['We may update these terms; the date at the top shows the latest version. Continuing to use the service after a change means you accept it.'] },
    { title: '12. Governing law and contact', paragraphs: [`These terms are governed by Guinean law. For any question or complaint: ${CONTACT_EMAIL}.`] },
  ],
};

const deleteFr: LegalDocument = {
  title: 'Supprimer mon compte',
  updated: 'Dernière mise à jour : 16 octobre 2026',
  intro: 'Vous pouvez supprimer votre compte 1Link et vos données à tout moment. La suppression se fait en deux temps, pour éviter toute erreur : votre demande, puis une confirmation finale après 15 jours sans activité.',
  sections: [
    {
      title: 'Depuis l’application ou le site',
      items: ['Connectez-vous à votre compte.', 'Ouvrez Tableau de bord → Paramètres.', 'Dans la zone sensible « Supprimer mon compte », cliquez sur « Demander la suppression » puis confirmez avec votre mot de passe (ou, si votre compte n’a pas de mot de passe, avec le code reçu par e-mail). Vous êtes alors déconnecté.', 'Pendant 15 jours, ne vous reconnectez pas : se reconnecter annule la demande.', 'Après 15 jours sans activité, un e-mail contient un lien de confirmation valable 7 jours. Ouvrez-le et validez votre mot de passe : le compte est alors supprimé définitivement.'],
    },
    {
      title: 'Ce qui est supprimé',
      items: ['Votre compte et vos informations de connexion (nom, e-mail, téléphone).', 'Votre page publique, son adresse et toutes ses statistiques.', 'Vos images téléversées.', 'Vos sessions, vos codes et vos traces de sécurité liées à votre e-mail ou numéro.'],
      paragraphs: ['Une fois la confirmation finale validée, la suppression est immédiate et définitive : elle ne peut pas être annulée. Un e-mail de confirmation vous est envoyé.'],
    },
    {
      title: 'Ce qui peut être conservé',
      paragraphs: ['Les pièces comptables liées à un paiement éventuel doivent être conservées par obligation légale : dans ce cas, contactez-nous. Des sauvegardes techniques de notre hébergeur peuvent contenir vos données quelques jours avant leur effacement définitif. Les comptes administrateurs doivent d’abord perdre leur rôle.'],
    },
    {
      title: 'Vous ne pouvez pas vous connecter ?',
      paragraphs: [`Écrivez-nous depuis l’adresse e-mail du compte à ${CONTACT_EMAIL} avec pour objet « Suppression de compte » : nous traitons la demande sous 30 jours maximum.`],
    },
  ],
};

const deleteEn: LegalDocument = {
  title: 'Delete my account',
  updated: 'Last updated: 16 October 2026',
  intro: 'You can delete your 1Link account and your data at any time. Deletion takes two steps, to avoid mistakes: your request, then a final confirmation after 15 days without activity.',
  sections: [
    {
      title: 'From the app or the website',
      items: ['Sign in to your account.', 'Open Dashboard → Settings.', 'In the sensitive “Delete my account” area, click “Request deletion” then confirm with your password (or, if your account has no password, with the code received by email). You are then signed out.', 'For 15 days, do not sign in again: signing in cancels the request.', 'After 15 days without activity, an email contains a confirmation link valid for 7 days. Open it and validate your password: the account is then permanently deleted.'],
    },
    {
      title: 'What is deleted',
      items: ['Your account and sign-in details (name, email, phone).', 'Your public page, its address and all its statistics.', 'Your uploaded images.', 'Your sessions, codes and security traces tied to your email or number.'],
      paragraphs: ['Once the final confirmation is validated, deletion is immediate and permanent: it cannot be undone. A confirmation email is sent to you.'],
    },
    {
      title: 'What may be kept',
      paragraphs: ['Accounting records linked to any payment must be kept by law: in that case, contact us. Technical backups of our host may contain your data for a few days before final erasure. Administrator accounts must first lose their role.'],
    },
    {
      title: 'Cannot sign in?',
      paragraphs: [`Write to us from the account’s email address at ${CONTACT_EMAIL} with the subject “Account deletion”: we process the request within 30 days at most.`],
    },
  ],
};

export const LEGAL: Record<LegalLocale, Record<LegalKind, LegalDocument>> = {
  fr: { privacy: privacyFr, terms: termsFr, deleteAccount: deleteFr },
  en: { privacy: privacyEn, terms: termsEn, deleteAccount: deleteEn },
};
