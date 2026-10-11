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
export const challengeBody = z.object({ challenge: z.string().min(20).max(600) });
export const phoneRequestBody = z.object({ phone: e164, channel: z.enum(['whatsapp', 'sms']).default('sms') });
export const phoneResetBody = z.object({ phone: e164, code: z.string().regex(/^\d{6}$/, 'code'), password: z.string().min(1).max(200) });
export const phoneLinkVerifyBody = z.object({ phone: e164, code: z.string().regex(/^\d{6}$/, 'code') });
export const passwordConfirmBody = z.object({ password: z.string().min(1).max(200) });
export const twoFactorToggleBody = z.object({ enabled: z.boolean(), password: z.string().min(1).max(200) });
export const forgotBody = z.object({ email });
export const resetBody = z.object({ token, password: z.string().min(1).max(200) });
export const verifyEmailBody = z.object({ token });
