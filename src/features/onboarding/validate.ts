import type { OnboardingData, StepId } from './store';

export type StepErrors = Record<string, string>;

/** Validation pure d'une étape. Les valeurs sont des clés de message (common.validation.*). */
export function validateStep(step: StepId, d: OnboardingData): StepErrors {
  const errors: StepErrors = {};
  if (step === 'category' && !d.category) errors.category = 'common.validation.required';
  if (step === 'profile') {
    if (!d.identity.displayName.trim()) errors.displayName = 'common.validation.required';
    if ((d.identity.displayName ?? '').length > 60) errors.displayName = 'common.validation.tooLong';
    if ((d.activity.headline ?? '').length > 90) errors.headline = 'common.validation.tooLong';
    if ((d.activity.sector ?? '').length > 60) errors.sector = 'common.validation.tooLong';
  }
  return errors;
}

export const isStepValid = (step: StepId, d: OnboardingData) => Object.keys(validateStep(step, d)).length === 0;
