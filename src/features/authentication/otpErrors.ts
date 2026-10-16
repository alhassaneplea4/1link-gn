import { isApiError } from '@/models/api';
import type { useT } from '@/i18n/core';

type T = ReturnType<typeof useT>;

/** Traduit une erreur d'API liée aux codes à usage unique (SMS/WhatsApp), sans rien révéler de plus que le serveur. */
export function explainOtpError(t: T, e: unknown): string {
  if (!isApiError(e)) return t('auth.phone.errors.generic');
  const msg = e.message;
  const num = (k: string) => Number(e.fields?.[k] ?? 0);
  if (e.code === 'network') return t('auth.errors.network');
  if (msg === 'invalid_code') return t('auth.phone.errors.invalidCode', { count: num('attemptsLeft') });
  if (msg === 'code_expired' || msg === 'expired') return t('auth.phone.errors.expired');
  if (msg === 'too_many_attempts') return t('auth.phone.errors.tooManyAttempts');
  if (msg === 'resend_too_soon') return t('auth.phone.errors.resendTooSoon', { s: num('retryAfterSec') });
  if (msg === 'too_many_requests') return t('auth.phone.errors.tooManyRequests', { min: Math.ceil(num('retryAfterSec') / 60) });
  if (msg === 'phone_taken') return t('auth.phone.errors.phoneTaken');
  if (msg === 'account_suspended') return t('auth.errors.suspended');
  if (msg === 'otp_unavailable') return t('auth.phone.errors.unavailable');
  if (msg === 'country_not_supported') return t('auth.phone.errors.country');
  if (msg === 'invalid_challenge') return t('auth.twoFactor.expired');
  if (msg === 'wrong_password') return t('auth.errors.wrongPassword');
  if (msg === 'weak_password') return t('auth.errors.weakPassword');
  if (msg === 'no_account') return t('auth.phone.errors.noAccount');
  if (msg === 'mail_unavailable') return t('auth.emailCode.unavailable');
  return t('auth.phone.errors.generic');
}
