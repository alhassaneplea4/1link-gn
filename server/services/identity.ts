/**
 * Confirmation d'identité avant une opération sensible (vérification en deux étapes, mot de passe, suppression du compte).
 * On accepte le mot de passe OU, pour un compte créé par code (sans mot de passe), un code à usage unique envoyé à l'adresse
 * e-mail du compte (à défaut, au téléphone vérifié). Les essais sont plafonnés.
 */
import type { C, Deps, UserRow } from '../context.js';
import { securityEvent } from '../lib/audit.js';
import { verifyPassword } from '../lib/crypto.js';
import { badRequest, conflict } from '../lib/errors.js';
import { enforce, keyFor } from '../lib/ratelimit.js';
import { checkOtp, emailCodeKey, issueEmailCode, issueOtp } from './accounts.js';

export interface Identity { password?: string | undefined; code?: string | undefined }

/** Envoie le code de confirmation (e-mail du compte, sinon SMS au numéro vérifié). */
export async function sendIdentityCode(c: C, deps: Deps, user: UserRow): Promise<{ via: 'email' | 'sms'; expiresInSec: number; resendInSec: number; devCode?: string }> {
  if (user.email) {
    const issued = await issueEmailCode(c, deps, user.email, { locale: user.locale === 'en' ? 'en' : 'fr' });
    return { via: 'email', ...issued };
  }
  if (user.phone && user.phoneVerifiedAt) {
    const issued = await issueOtp(c, deps, user.phone, 'sms');
    return { via: 'sms', expiresInSec: issued.expiresInSec, resendInSec: issued.resendInSec, ...(issued.devCode ? { devCode: issued.devCode } : {}) };
  }
  throw conflict('no_contact');
}

export async function confirmIdentity(c: C, deps: Deps, user: UserRow, proof: Identity): Promise<void> {
  if (proof.password) {
    await enforce(deps.db, keyFor('pw-confirm', user.id), 10, 900, deps.now());
    if (!user.passwordHash) throw conflict('no_password');
    if (!(await verifyPassword(proof.password, user.passwordHash))) {
      await securityEvent(deps.db, { kind: 'failed_login', subject: user.email ?? user.id, userId: user.id, ip: c.get('ip') }, deps.now());
      throw badRequest('wrong_password', { password: 'wrong' });
    }
    return;
  }
  if (proof.code) {
    const key = user.email ? emailCodeKey(user.email) : user.phone && user.phoneVerifiedAt ? user.phone : null;
    if (!key) throw conflict('no_contact');
    await checkOtp(c, deps, key, proof.code);
    return;
  }
  throw badRequest('confirmation_required', { password: 'required' });
}
