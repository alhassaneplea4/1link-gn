/**
 * Typage des clés de traduction. Les dictionnaires français sont la source de vérité :
 * une clé inexistante est une erreur de compilation.
 */
import type common from './fr/common';
import type marketing from './fr/marketing';
import type auth from './fr/auth';
import type onboarding from './fr/onboarding';
import type dashboard from './fr/dashboard';
import type editor from './fr/editor';
import type appearance from './fr/appearance';
import type analytics from './fr/analytics';
import type billing from './fr/billing';
import type admin from './fr/admin';
import type pub from './fr/pub';

export interface Dict {
  [key: string]: string | Dict;
}

export interface Namespaces {
  common: typeof common;
  marketing: typeof marketing;
  auth: typeof auth;
  onboarding: typeof onboarding;
  dashboard: typeof dashboard;
  editor: typeof editor;
  appearance: typeof appearance;
  analytics: typeof analytics;
  billing: typeof billing;
  admin: typeof admin;
  pub: typeof pub;
}

export type NamespaceName = keyof Namespaces;

type Leaves<T, P extends string> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

type StripPlural<K extends string> = K extends `${infer B}_${'one' | 'other'}` ? B : K;

export type MessageKey = {
  [N in NamespaceName]: StripPlural<Leaves<Namespaces[N], `${N}.`>>;
}[NamespaceName];
