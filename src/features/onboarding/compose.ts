import { CATEGORY_CONFIG } from '@/features/categories/config';
import { createBlock } from '@/features/page-engine/blocks/registry';
import { getThemePreset, mergeAppearance } from '@/features/page-engine/appearance/themes';
import { createInitialDocument } from '@/features/page-engine/document';
import type { AnyBlock } from '@/models/blocks';
import type { PageDocument } from '@/models/page';
import { isEmail, isPhone, isUrl } from '@/utilities/validation';
import { isBareBase } from '@/models/platforms';
import type { OnboardingData } from './store';

const filled = (s: string | undefined) => (s ?? '').trim().length > 0;

/** Transforme les saisies de l'assistant en document de page (utilisé pour l'aperçu en direct ET la publication). */
export function composeDocument(d: OnboardingData, fallbackName: string): PageDocument {
  const category = d.category ?? 'individual';
  const cfg = CATEGORY_CONFIG[category];
  const base = createInitialDocument({ username: d.identity.username, category, displayName: d.identity.displayName || fallbackName });
  const ctx = { category };
  const blocks: AnyBlock[] = [];

  const profile = createBlock('profile', ctx, 'blk_profile');
  Object.assign(profile.data, {
    displayName: d.identity.displayName || fallbackName,
    headline: d.activity.headline ?? '',
    bio: d.activity.bio ?? '',
    avatarUrl: d.identity.avatarUrl,
    coverUrl: d.identity.coverUrl ?? '',
    location: d.activity.location ?? '',
  });
  blocks.push(profile);

  // Seuls les réseaux dont l'adresse va au-delà de l'adresse officielle (nom d'utilisateur saisi) sont publiés.
  const socials = d.socials.filter((s) => isUrl(s.url) && !isBareBase(s.platform, s.url));
  if (socials.length) {
    const b = createBlock('social', ctx);
    b.data.items = socials;
    blocks.push(b);
  }

  for (const l of d.links.filter((x) => filled(x.title) && isUrl(x.url))) {
    const b = createBlock('link', ctx);
    b.data.title = l.title.trim();
    b.data.url = l.url.trim();
    blocks.push(b);
  }

  const items = d.items.filter((i) => filled(i.name));
  if (items.length && cfg.contentBlock === 'service') {
    const b = createBlock('service', ctx);
    b.data.items = items.map((i) => ({ name: i.name.trim(), description: i.description.trim(), price: i.price.trim(), url: '' }));
    blocks.push(b);
  } else if (items.length && cfg.contentBlock === 'portfolio') {
    const b = createBlock('portfolio', ctx);
    b.data.items = items.map((i) => ({ title: i.name.trim(), description: i.description.trim(), imageUrl: i.imageUrl.trim(), url: '' }));
    blocks.push(b);
  } else if (filled(d.about)) {
    const b = createBlock('text', ctx);
    b.data.body = d.about.trim();
    blocks.push(b);
  }

  const email = d.activity.email?.trim() ?? '';
  const phone = d.activity.phone?.trim() ?? '';
  const contactItems = [
    ...(isEmail(email) ? [{ kind: 'email' as const, label: '', value: email }] : []),
    ...(isPhone(phone) ? [{ kind: 'phone' as const, label: '', value: phone }, { kind: 'whatsapp' as const, label: '', value: phone }] : []),
  ];
  if (contactItems.length) {
    const b = createBlock('contact', ctx);
    b.data.items = contactItems;
    blocks.push(b);
  }
  if ((category === 'business' || category === 'organization') && filled(d.activity.location)) {
    const b = createBlock('location', ctx);
    b.data.address = d.activity.location!.trim();
    blocks.push(b);
  }

  let appearance = getThemePreset(d.themeId ?? cfg.themeId);
  if (d.primaryColor) appearance = mergeAppearance(appearance, { themeId: 'custom', colors: { primary: d.primaryColor } });
  return { ...base, blocks, appearance };
}
