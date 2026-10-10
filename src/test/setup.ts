import '@testing-library/jest-dom/vitest';
import { afterEach, beforeAll, vi } from 'vitest';
import { cleanup, configure } from '@testing-library/react';
import { loadNamespaces } from '@/i18n/core';

// jsdom n'implémente pas matchMedia, ResizeObserver, IntersectionObserver ni scrollIntoView.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({ matches: false, media: query, onchange: null, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false }),
});
class RO { observe() {} unobserve() {} disconnect() {} }
class IO { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }
vi.stubGlobal('ResizeObserver', RO);
vi.stubGlobal('IntersectionObserver', IO);
Element.prototype.scrollIntoView = () => undefined;
window.scrollTo = () => undefined;

configure({ asyncUtilTimeout: 10000 });

beforeAll(async () => {
  await loadNamespaces(['common', 'marketing', 'auth', 'onboarding', 'dashboard', 'editor', 'appearance', 'analytics', 'billing', 'admin', 'pub']);
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
});
