import { createBrowserRouter, type RouteObject } from 'react-router-dom';
import type { ComponentType } from 'react';
import { loadNamespaces } from '@/i18n/core';
import type { NamespaceName } from '@/i18n/types';
import type { AdminSection } from '@/models/auth';
import RootLayout from './RootLayout';
import { ForbiddenPage, NotFoundPage, RouteErrorPage } from './errors';
import { FullPageLoader, RedirectIfAuthenticated, RequireAdminAccess, RequireAuth, RequireOnboarded, RequireSection } from './guards';

/** Route chargée à la demande : le chunk de page ET ses dictionnaires sont prêts avant l'affichage (pas de clés brutes). */
const page = (load: () => Promise<{ default: ComponentType }>, namespaces: NamespaceName[] = []): Pick<RouteObject, 'lazy'> => ({
  lazy: async () => {
    const [mod] = await Promise.all([load(), loadNamespaces(namespaces)]);
    return { Component: mod.default };
  },
});
const layout = (load: () => Promise<{ default: ComponentType }>, namespaces: NamespaceName[] = []) => page(load, namespaces);

const adminSection = (section: AdminSection, path: string, load: () => Promise<{ default: ComponentType }>): RouteObject => ({
  element: <RequireSection section={section} />,
  children: [{ path, ...page(load, ['admin', 'analytics', 'dashboard', 'billing', 'pub']) }],
});

/** Définition des routes (réutilisée par les tests avec un routeur en mémoire). */
export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    errorElement: <RouteErrorPage />,
    HydrateFallback: FullPageLoader,
    children: [
      // — Site public —
      {
        ...layout(() => import('@/app/layouts/MarketingLayout'), ['marketing']),
        children: [
          { index: true, ...page(() => import('@/features/marketing/HomePage'), ['marketing', 'pub', 'editor']) },
          { path: 'features', ...page(() => import('@/features/marketing/FeaturesPage'), ['marketing', 'pub', 'editor']) },
          { path: 'pricing', ...page(() => import('@/features/marketing/PricingPage'), ['marketing', 'billing']) },
          { path: 'faq', ...page(() => import('@/features/marketing/FaqPage'), ['marketing']) },
          { path: 'legal/privacy', ...page(() => import('@/features/legal/Privacy'), ['marketing']) },
          { path: 'legal/terms', ...page(() => import('@/features/legal/Terms'), ['marketing']) },
          { path: 'legal/delete-account', ...page(() => import('@/features/legal/DeleteAccountInfo'), ['marketing']) },
        ],
      },

      // — Authentification —
      {
        path: 'auth',
        ...layout(() => import('@/app/layouts/AuthLayout'), ['auth']),
        children: [
          {
            element: <RedirectIfAuthenticated />,
            children: [
              { path: 'login', ...page(() => import('@/features/authentication/LoginPage'), ['auth']) },
              { path: 'register', ...page(() => import('@/features/authentication/RegisterPage'), ['auth']) },
              { path: 'forgot-password', ...page(() => import('@/features/authentication/ForgotPasswordPage'), ['auth']) },
            ],
          },
          { path: 'reset-password', ...page(() => import('@/features/authentication/ResetPasswordPage'), ['auth']) },
          { path: 'verify-email', ...page(() => import('@/features/authentication/VerifyEmailPage'), ['auth']) },
          { path: 'sign-out', ...page(() => import('@/features/authentication/SignOutPage'), ['auth']) },
          { path: 'signed-out', ...page(() => import('@/features/authentication/SignedOutPage'), ['auth']) },
          { path: 'session-expired', ...page(() => import('@/features/authentication/SessionExpiredPage'), ['auth']) },
        ],
      },

      // — Onboarding —
      {
        element: <RequireAuth />,
        children: [{ path: 'onboarding', ...page(() => import('@/features/onboarding/OnboardingPage'), ['onboarding', 'editor', 'appearance', 'pub', 'marketing']) }],
      },

      // — Dashboard utilisateur —
      {
        path: 'dashboard',
        element: <RequireAuth />,
        children: [
          {
            element: <RequireOnboarded />,
            children: [
              {
                ...layout(() => import('@/app/layouts/DashboardLayout'), ['dashboard']),
                children: [
                  { index: true, ...page(() => import('@/features/dashboard/OverviewPage'), ['dashboard', 'editor', 'analytics', 'pub', 'marketing']) },
                  { path: 'page', ...page(() => import('@/features/profile-editor/EditorPage'), ['editor', 'pub']) },
                  { path: 'appearance', ...page(() => import('@/features/appearance/AppearancePage'), ['appearance', 'editor', 'pub']) },
                  { path: 'analytics', ...page(() => import('@/features/analytics/AnalyticsPage'), ['analytics']) },
                  { path: 'subscription', ...page(() => import('@/features/subscriptions/SubscriptionPage'), ['billing', 'marketing', 'dashboard']) },
                  { path: 'settings', ...page(() => import('@/features/settings/SettingsPage'), ['dashboard', 'auth']) },
                  { path: 'security', ...page(() => import('@/features/settings/SecurityPage'), ['dashboard', 'auth']) },
                  { path: 'print', ...page(() => import('@/features/sharing/PrintPage'), ['dashboard', 'editor']) },
                ],
              },
            ],
          },
        ],
      },

      // — Admin Center (espace distinct) —
      {
        path: 'admin',
        element: <RequireAuth />,
        children: [
          {
            element: <RequireAdminAccess />,
            children: [
              {
                ...layout(() => import('@/app/layouts/AdminLayout'), ['admin']),
                children: [
                  adminSection('overview', '', () => import('@/features/admin/pages/OverviewPage')),
                  adminSection('realtime', 'realtime', () => import('@/features/admin/pages/RealtimePage')),
                  adminSection('users', 'users', () => import('@/features/admin/pages/UsersPage')),
                  adminSection('users', 'users/:id', () => import('@/features/admin/pages/UserDetailPage')),
                  adminSection('profiles', 'profiles', () => import('@/features/admin/pages/ProfilesPage')),
                  adminSection('analytics', 'analytics', () => import('@/features/admin/pages/PlatformAnalyticsPage')),
                  adminSection('subscriptions', 'subscriptions', () => import('@/features/admin/pages/SubscriptionsPage')),
                  adminSection('payments', 'payments', () => import('@/features/admin/pages/PaymentsPage')),
                  adminSection('moderation', 'moderation', () => import('@/features/admin/pages/ModerationPage')),
                  adminSection('reports', 'reports', () => import('@/features/admin/pages/ReportsPage')),
                  adminSection('support', 'support', () => import('@/features/admin/pages/SupportPage')),
                  adminSection('security', 'security', () => import('@/features/admin/pages/SecurityPage')),
                  adminSection('logs', 'logs', () => import('@/features/admin/pages/LogsPage')),
                  adminSection('system', 'system', () => import('@/features/admin/pages/SystemPage')),
                  adminSection('settings', 'settings', () => import('@/features/admin/pages/AdminSettingsPage')),
                ],
              },
            ],
          },
        ],
      },
      { path: '403', element: <ForbiddenPage /> },

      // — Page publique d'un utilisateur : toujours en DERNIER (les routes statiques ci-dessus ont priorité) —
      { path: ':username', ...page(() => import('@/features/public-profile/PublicProfilePage'), ['pub']) },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
