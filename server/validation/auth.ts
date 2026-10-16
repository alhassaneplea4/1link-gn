import { z } from 'zod';
import { isEmail } from '../../src/utilities/validation.js';

const email = z.string().trim().toLowerCase().max(254).refine(isEmail, 'email');
const password = z.string().min(1).max(200);
const e164 = z.string().regex(/^\+\d{8,15}$/, 'phone');
const token = z.string().min(16).max(200);

export const signInBody = z.object({ email, password });
export const signUpBody = z.object({
  name: z.string().trim().min(1).max(80),
  email,
  password: z.string().min(8).max(200),
  acceptTerms: z.literal(true),
});
export const otpRequestBody = z.object({ phone: e164, channel: z.enum(['whatsapp', 'sms']) });
export const otpVerifyBody = z.object({
  phone: e164,
  code: z.string().regex(/^\d{6}$/, 'code'),
  mode: z.enum(['sign_in', 'sign_up']),
  name: z.string().trim().max(80).optional(),
  acceptTerms: z.boolean().optional(),
});
export const twoFactorBody = z.object({ challenge: z.string().min(20).max(600), code: z.string().regex(/^\d{6}$/, 'code') });
export const emailCodeRequestBody = z.object({ email });
export const emailCodeVerifyBody = z.object({ email, code: z.string().regex(/^\d{6}$/, 'code'), acceptTerms: z.literal(true) });
export const mfaVerifyBody = z.object({ challenge: z.string().min(20).max(600), method: z.enum(['sms', 'email', 'totp', 'recovery']), code: z.string().trim().min(6).max(16) });
export const mfaSendBody = z.object({ challenge: z.string().min(20).max(600), method: z.enum(['sms', 'email']) });
export const challengeBody = z.object({ challenge: z.string().min(20).max(600) });
export const phoneRequestBody = z.object({ phone: e164, channel: z.enum(['whatsapp', 'sms']).default('sms') });
export const phoneResetBody = z.object({ phone: e164, code: z.string().regex(/^\d{6}$/, 'code'), password: z.string().min(1).max(200) });
export const phoneLinkVerifyBody = z.object({ phone: e164, code: z.string().regex(/^\d{6}$/, 'code') });
/** Preuve d'identité : mot de passe, ou code reçu par e-mail / SMS pour un compte sans mot de passe. */
export const identityBody = z.object({ password: z.string().min(1).max(200).optional(), code: z.string().regex(/^\d{6}$/, 'code').optional() });
export const passwordConfirmBody = identityBody;
export const twoFactorToggleBody = identityBody.extend({ enabled: z.boolean() });
export const toggleBody = twoFactorToggleBody;
export const totpEnableBody = z.object({ code: z.string().regex(/^\d{6}$/, 'code') });
export const setPasswordBody = identityBody.extend({ newPassword: z.string().min(8).max(200) });
export const deleteConfirmBody = z.object({ token: z.string().min(16).max(200), password: z.string().min(1).max(200).optional(), code: z.string().regex(/^\d{6}$/, 'code').optional() });
export const deleteCodeBody = z.object({ token: z.string().min(16).max(200) });
export const forgotBody = z.object({ email });
export const resetBody = z.object({ token, password: z.string().min(1).max(200) });
export const verifyEmailBody = z.object({ token });
export const accountDeleteBody = z.object({ password: z.string().min(1).max(200).optional(), code: z.string().regex(/^\d{6}$/, 'code').optional() });
