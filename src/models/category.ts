export const CATEGORY_IDS = ['individual', 'creator', 'professional', 'business', 'organization'] as const;
export type CategoryId = (typeof CATEGORY_IDS)[number];

export const isCategoryId = (v: unknown): v is CategoryId => typeof v === 'string' && (CATEGORY_IDS as readonly string[]).includes(v);
