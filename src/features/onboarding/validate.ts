import { CATEGORY_CONFIG } from '@/features/categories/config';
import { validateFields } from '@/features/page-engine/blocks/schema';
import { isBareBase } from '@/models/platforms';
import { isUrl, validateUsername } from '@/utilities/validation';
import type { OnboardingData, StepId } from './store';

export type StepErrors = Record<string, string>;

/** Validation pure d'une étape. Les valeurs sont des clés de message (common.validation.*) ou des codes. */
export function validateStep(step: StepId, d: OnboardingData): StepErrors {
  const errors: StepErrors = {};
  switch (step) {
    case 'category':
      if (!d.category) errors.category = 'common.validation.required';
      break;
    case 'identity': {
      if (!d.identity.displayName.trim()) errors.displayName = 'common.validation.required';
      const u = validateUsername(d.identity.username);
      if (u) errors.username = u;
      break;
    }
    case 'activity': {
      if (!d.category) break;
      const fields = CATEGORY_CONFIG[d.category].activityFields;
      Object.assign(errors, validateFields(fields, d.activity as Record<string, unknown>));
      break;
    }
    case 'links':
      d.socials.forEach((s, i) => { if (s.url.trim() && !isBareBase(s.platform, s.url) && !isUrl(s.url)) errors[`socials.${i}.url`] = 'common.validation.url'; });
      d.links.forEach((l, i) => {
        const hasTitle = l.title.trim() !== '';
        const hasUrl = l.url.trim() !== '';
        if (hasTitle && !hasUrl) errors[`links.${i}.url`] = 'common.validation.required';
        if (hasUrl && !hasTitle) errors[`links.${i}.title`] = 'common.validation.required';
        if (hasUrl && !isUrl(l.url)) errors[`links.${i}.url`] = 'common.validation.url';
      });
      break;
    default:
      break;
  }
  return errors;
}

export const isStepValid = (step: StepId, d: OnboardingData) => Object.keys(validateStep(step, d)).length === 0;
