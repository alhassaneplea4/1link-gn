import type { Dict } from '../types';

export default {
  title: 'Set up my account',
  stepsLabel: 'Setup steps',
  stepOf: 'Step {n} of {total}',
  livePreview: 'Live preview of your page',
  validate: 'Confirm my account',
  steps: {
    link: 'Your link',
    category: 'Account type',
    profile: 'Profile',
  },
  link: {
    title: 'Choose your 1Link address',
    lead: 'This is the address of your page, the one you will share everywhere. We check first that it is free.',
    available: 'This address is free: it is yours.',
    later: 'You can change it later from your overview.',
  },
  category: { title: 'Which type of account?', lead: 'Your account type adapts the suggestions and your dashboard. You can change it later.', legend: 'Account type' },
  profile: {
    title: 'Your profile',
    lead: 'Photo, cover, name, sector and title: what visitors see first. Everything can be edited later.',
    name: 'Full name',
    nameOrg: 'Brand or organisation name',
    nameHint: 'As it will appear on your page.',
    sector: 'Business sector',
    sectorHint: 'E.g. “Restaurants”, “Education”, “Music”.',
    titleField: 'Title',
    titleHint: 'Your job, your role or a tagline. E.g. “Interior architect”.',
  },
  sections: {
    link: { title: 'Your address', hint: 'Lowercase letters, digits, hyphens and underscores (3 to 30 characters).' },
    photos: { title: 'Photos', hint: 'A cover and a profile photo build trust right away. You can change them at any time.' },
    identity: { title: 'Name, sector and title', hint: 'What visitors read first.' },
  },
  identity: {
    coverTitle: 'Cover photo',
    coverAdd: 'Add a cover',
    coverHint: 'Wide image (landscape). Optional: without a cover, a gradient in your colours is used.',
    photoTitle: 'Profile photo',
    photo: 'Add a photo or logo',
    photoHint: 'Optional. A square image looks best.',
  },
} satisfies Dict;
