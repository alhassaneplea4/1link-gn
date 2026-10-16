import { createBlock } from '@/features/page-engine/blocks/registry';
import { createInitialDocument } from '@/features/page-engine/document';
import { DEFAULT_APPEARANCE } from '@/models/themes';
import type { AnyBlock } from '@/models/blocks';
import type { PageDocument } from '@/models/page';
import { slugifyUsername } from '@/utilities/validation';
import type { OnboardingData } from './store';

/**
 * Transforme les saisies de l'assistant en document de page (aperçu en direct ET publication) : une page avec son profil
 * (photo, couverture, nom, titre, secteur). Les blocs (liens, services, contacts…) s'ajoutent ensuite depuis « Ma page ».
 * Le thème de base est toujours autorisé : le serveur refuse ce que l'offre ne permet pas.
 */
export function composeDocument(d: OnboardingData, fallbackName: string, username = ''): PageDocument {
  const category = d.category ?? 'individual';
  const displayName = d.identity.displayName.trim() || fallbackName;
  const base = createInitialDocument({ username, category, displayName });
  const profile = createBlock('profile', { category }, 'blk_profile');
  Object.assign(profile.data, {
    displayName,
    headline: (d.activity.headline ?? '').trim(),
    sector: (d.activity.sector ?? '').trim(),
    avatarUrl: d.identity.avatarUrl,
    coverUrl: d.identity.coverUrl ?? '',
  });
  const blocks: AnyBlock[] = [profile];
  return { ...base, blocks, appearance: structuredClone(DEFAULT_APPEARANCE) };
}

/** Adresses candidates dérivées du nom complet (la première disponible est retenue) : « awa-diallo », « awa-diallo-2 »… */
export function usernameCandidates(displayName: string, random: () => number = Math.random): string[] {
  // Les mots sont séparés par un tiret (« Awa Diallo » → « awa-diallo »), sans tirets en double ni en bordure.
  let base = slugifyUsername(displayName.trim().replace(/\s+/g, '-')).replace(/-{2,}/g, '-').replace(/^[-_]+|[-_]+$/g, '').slice(0, 24).replace(/[-_]+$/g, '');
  if (base.length < 3) base = `${base}${'membre'.slice(0, 6 - base.length)}`;
  const suffix = () => Math.floor(random() * 9000 + 1000);
  return [base, `${base}-2`, `${base}-3`, `${base}-${suffix()}`, `${base}-${suffix()}`, `${base}-${suffix()}`];
}
