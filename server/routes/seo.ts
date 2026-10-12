/**
 * Référencement : plan du site et pages publiques avec leurs balises de partage rendues CÔTÉ SERVEUR.
 * Une application React ne montre ses balises qu'après exécution du JavaScript : or WhatsApp, Facebook, X ou les robots
 * simples lisent le HTML brut. Ici chaque adresse `/pseudo` reçoit donc son titre, sa description, son image (Open Graph),
 * son lien canonique et ses données structurées. Rien de privé n'y figure : ni e-mail, ni téléphone.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Hono } from 'hono';
import { and, desc, eq, notLike } from 'drizzle-orm';
import type { HonoEnv } from '../context.js';
import { pages, users } from '../db/schema.js';
import { resolvePublicPage } from '../services/pages.js';
import { TEST_EMAIL_DOMAIN } from '../services/test-accounts.js';
import { RESERVED_USERNAMES } from '../../src/utilities/validation.js';
import type { PageDocument } from '../../src/models/page.js';

export const seoRoutes = new Hono<HonoEnv>();

const SHELL = '<!doctype html><html lang="fr"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>1Link</title></head><body><div id="root"></div></body></html>';
let template: Promise<string> | undefined;
/** Le HTML construit par Vite (fourni à la fonction par `includeFiles`) ; une coquille minimale hors production. */
const loadTemplate = () => (template ??= readFile(resolve(process.cwd(), 'dist/index.html'), 'utf8').catch(() => SHELL));

const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const clip = (v: string, n: number) => (v.length > n ? `${v.slice(0, n - 1).trimEnd()}…` : v);
const json = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c');

/** Retire les balises que la page remplace, puis ajoute le bloc de balises avant </head>. */
function withHead(html: string, title: string, block: string): string {
  return html
    .replace(/<title>[\s\S]*?<\/title>/i, '')
    .replace(/<meta\s+(?:name|property)="(?:description|robots|og:[a-z:_]+|twitter:[a-z:_]+)"[^>]*>\s*/gi, '')
    .replace(/<link\s+rel="canonical"[^>]*>\s*/gi, '')
    .replace(/<\/head>/i, () => `<title>${esc(title)}</title>\n${block}\n</head>`);
}

function metaBlock(o: { url: string; title: string; description: string; image: string; type: string; noindex: boolean; ld?: unknown }): string {
  return [
    `<meta name="description" content="${esc(o.description)}" />`,
    `<meta name="robots" content="${o.noindex ? 'noindex,nofollow' : 'index,follow,max-image-preview:large'}" />`,
    `<link rel="canonical" href="${esc(o.url)}" />`,
    '<meta property="og:site_name" content="1Link" />',
    `<meta property="og:type" content="${o.type}" />`,
    `<meta property="og:url" content="${esc(o.url)}" />`,
    `<meta property="og:title" content="${esc(o.title)}" />`,
    `<meta property="og:description" content="${esc(o.description)}" />`,
    `<meta property="og:image" content="${esc(o.image)}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${esc(o.title)}" />`,
    `<meta name="twitter:description" content="${esc(o.description)}" />`,
    `<meta name="twitter:image" content="${esc(o.image)}" />`,
    ...(o.ld ? [`<script type="application/ld+json">${json(o.ld)}</script>`] : []),
  ].join('\n');
}

const absolute = (base: string, v: string) => (v.startsWith('/') ? `${base}${v}` : v);

function structuredData(page: PageDocument, url: string, image: string) {
  const profile = page.blocks.find((b) => b.type === 'profile');
  if (!profile || profile.type !== 'profile') return undefined;
  const d = profile.data;
  const sameAs = page.blocks.flatMap((b) => (b.type === 'social' ? b.data.items.map((i) => i.url) : [])).filter((u) => /^https:\/\//.test(u));
  const person = page.category === 'individual' || page.category === 'creator' || page.category === 'professional';
  const entity = {
    '@type': person ? 'Person' : 'Organization',
    name: d.displayName,
    ...(d.headline ? { description: d.headline, ...(person ? { jobTitle: d.headline } : {}) } : {}),
    url,
    image,
    ...(sameAs.length ? { sameAs } : {}),
  };
  return { '@context': 'https://schema.org', '@type': 'ProfilePage', url, name: d.displayName, ...(page.publishedAt ? { dateModified: page.updatedAt, dateCreated: page.publishedAt } : {}), mainEntity: entity };
}

/** Page publique d'un pseudo : HTML de l'application + balises propres à la page. */
seoRoutes.get('/seo/:username', async (c) => {
  const deps = c.get('deps');
  const base = deps.config.publicUrl;
  const raw = c.req.param('username').toLowerCase();
  const html = await loadTemplate();
  const headers = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=0, must-revalidate', 'vercel-cdn-cache-control': 'max-age=60, stale-while-revalidate=300' };
  // Routes de l'application (/features, /pricing…) : on sert l'application telle quelle.
  if (RESERVED_USERNAMES.has(raw)) return c.body(html, 200, headers);

  const res = await resolvePublicPage(deps, raw);
  if (res.state !== 'published') {
    const gone = withHead(html, '1Link', metaBlock({ url: `${base}/${raw}`, title: '1Link', description: '1Link', image: `${base}/og-default.png`, type: 'website', noindex: true }));
    return c.body(gone, res.state === 'not_found' ? 404 : 200, { ...headers, 'vercel-cdn-cache-control': 'max-age=10' });
  }
  const page = res.page;
  const profile = page.blocks.find((b) => b.type === 'profile');
  const d = profile?.type === 'profile' ? profile.data : null;
  const url = `${base}/${page.username}`;
  const title = `${page.share.title || d?.displayName || page.username} · 1Link`;
  const description = clip(page.share.description || d?.headline || d?.bio || '1Link — une page, tous vos liens.', 200);
  const image = absolute(base, d?.coverUrl || d?.avatarUrl || '/og-default.png');
  // Comptes de démonstration : ne jamais les proposer aux moteurs de recherche.
  const [owner] = await deps.db.select({ email: users.email }).from(pages).innerJoin(users, eq(users.id, pages.userId)).where(eq(pages.username, page.username)).limit(1);
  const noindex = Boolean(owner?.email?.endsWith(`@${TEST_EMAIL_DOMAIN}`));
  const body = withHead(html, title, metaBlock({ url, title, description, image, type: 'profile', noindex, ld: structuredData(page, url, image) }));
  return c.body(body, 200, headers);
});

const STATIC: Array<{ path: string; priority: string; freq: string }> = [
  { path: '/', priority: '1.0', freq: 'weekly' },
  { path: '/features', priority: '0.8', freq: 'monthly' },
  { path: '/pricing', priority: '0.8', freq: 'monthly' },
  { path: '/faq', priority: '0.6', freq: 'monthly' },
  { path: '/legal/privacy', priority: '0.3', freq: 'yearly' },
  { path: '/legal/terms', priority: '0.3', freq: 'yearly' },
  { path: '/legal/delete-account', priority: '0.2', freq: 'yearly' },
];

/** Plan du site : pages du site + pages publiques actives (jamais les comptes de démonstration). */
seoRoutes.get('/sitemap.xml', async (c) => {
  const deps = c.get('deps');
  const base = deps.config.publicUrl;
  const rows = await deps.db
    .select({ username: pages.username, at: pages.updatedAt })
    .from(pages)
    .innerJoin(users, eq(users.id, pages.userId))
    .where(and(eq(pages.status, 'published'), eq(users.status, 'active'), notLike(users.email, `%@${TEST_EMAIL_DOMAIN}`)))
    .orderBy(desc(pages.updatedAt))
    .limit(45_000);
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const urls = [
    ...STATIC.map((s) => `<url><loc>${esc(base + s.path)}</loc><changefreq>${s.freq}</changefreq><priority>${s.priority}</priority></url>`),
    ...rows.filter((r) => r.username).map((r) => `<url><loc>${esc(`${base}/${r.username}`)}</loc><lastmod>${day(r.at)}</lastmod><changefreq>weekly</changefreq><priority>0.5</priority></url>`),
  ];
  return c.body(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`, 200, {
    'content-type': 'application/xml; charset=utf-8',
    'cache-control': 'public, max-age=0, must-revalidate',
    'vercel-cdn-cache-control': 'max-age=3600, stale-while-revalidate=86400',
  });
});
