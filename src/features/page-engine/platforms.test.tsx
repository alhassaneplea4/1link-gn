import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { PLATFORMS, detectPlatform, isBareBase, searchPlatforms, urlForPlatform } from '@/models/platforms';
import { SOCIAL_PLATFORMS } from '@/models/blocks';
import { SchemaForm } from '@/components/forms/SchemaForm';
import { BrandIcon } from '@/components/ui/BrandIcon';
import { validateFields, type FieldDef } from './blocks/schema';
import { blockRegistry } from './blocks/registry';
import { PageRenderer } from './renderer/PageRenderer';
import { getSampleDocument } from './samples';
import type { PageDocument } from '@/models/page';

describe('catalogue de plateformes', () => {
  it('propose Discord, Twitch, Snapchat, Pinterest, GitHub, Spotify… en plus des réseaux historiques', () => {
    for (const id of ['discord', 'twitch', 'snapchat', 'pinterest', 'github', 'spotify', 'threads', 'reddit', 'audiomack', 'boomplay', 'kick', 'linkedin', 'facebook', 'x']) expect(SOCIAL_PLATFORMS).toContain(id);
    expect(PLATFORMS.length).toBeGreaterThanOrEqual(40);
    expect(new Set(PLATFORMS.map((p) => p.id)).size).toBe(PLATFORMS.length);
    expect(PLATFORMS.map((p) => p.id)).toEqual([...SOCIAL_PLATFORMS]); // la liste partagée avec le serveur reste identique au catalogue
  });

  it('chaque plateforme a une adresse officielle en https et un logo (ou son repli)', () => {
    for (const p of PLATFORMS) {
      expect(p.base, p.id).toMatch(/^https:\/\//);
      const { container } = render(<BrandIcon platform={p.id} />);
      expect(container.querySelector('svg'), p.id).toBeInTheDocument();
    }
  });

  it('la recherche réagit dès les premières lettres, sans accents ni casse, et connaît des alias', () => {
    expect(searchPlatforms('dis')[0]?.id).toBe('discord');
    expect(searchPlatforms('TWI').map((p) => p.id)).toEqual(expect.arrayContaining(['twitch', 'x']));
    expect(searchPlatforms('whats')[0]?.id).toBe('whatsapp');
    expect(searchPlatforms('musique').map((p) => p.id)).toEqual(expect.arrayContaining(['spotify', 'audiomack', 'boomplay']));
    expect(searchPlatforms('zzzz')).toEqual([]);
    expect(searchPlatforms('')).toHaveLength(PLATFORMS.length);
  });

  it('préremplit l’adresse officielle sans écraser un lien déjà personnalisé, et reconnaît un lien collé', () => {
    expect(urlForPlatform('facebook', '')).toBe('https://facebook.com/');
    expect(urlForPlatform('discord', 'https://instagram.com/')).toBe('https://discord.gg/');
    expect(urlForPlatform('discord', 'https://instagram.com/monpseudo')).toBe('https://instagram.com/monpseudo');
    expect(isBareBase('facebook', 'https://facebook.com/')).toBe(true);
    expect(isBareBase('facebook', 'https://facebook.com/awa.diallo')).toBe(false);
    expect(isBareBase('website', 'https://exemple.com')).toBe(false);
    expect(detectPlatform('https://www.twitch.tv/awa')?.id).toBe('twitch');
    expect(detectPlatform('https://twitter.com/awa')?.id).toBe('x');
    expect(detectPlatform('https://exemple.com')).toBeNull();
  });

  it('refuse un réseau dont il manque le nom d’utilisateur, accepte un lien complet', () => {
    const fields = blockRegistry.social.fields;
    const bare = validateFields(fields, { display: 'icons', items: [{ platform: 'facebook', url: 'https://facebook.com/' }] });
    expect(bare['items.0.url']).toBe('common.validation.profileMissing');
    expect(validateFields(fields, { display: 'icons', items: [{ platform: 'facebook', url: 'https://facebook.com/awa.diallo' }] })).toEqual({});
    expect(validateFields(blockRegistry.link.fields, { title: 'Mon site', url: 'https://exemple.com', platform: 'link', description: '', highlight: false })).toEqual({});
  });
});

const FIELDS: FieldDef[] = [{ kind: 'list', name: 'items', max: 5, defaultItem: { platform: 'instagram', url: 'https://instagram.com/' }, itemFields: [{ kind: 'platform', name: 'platform' }, { kind: 'url', name: 'url' }] }];
function Harness({ onData }: { onData: (d: Record<string, unknown>) => void }) {
  const [data, setData] = useState<Record<string, unknown>>({ items: [{ platform: 'instagram', url: 'https://instagram.com/' }] });
  return <SchemaForm labelPrefix="editor.blocks.social" fields={FIELDS} data={data} errors={{}} onChange={(p) => { const next = { ...data, ...p }; setData(next); onData(next); }} />;
}

describe('sélecteur de plateforme (barre de recherche)', () => {
  it('affiche nom + logo dès la saisie, choisit au clavier et préremplit l’adresse officielle', async () => {
    const seen = vi.fn();
    render(<Harness onData={seen} />);
    const box = screen.getByRole('combobox');
    await userEvent.click(box);
    await userEvent.type(box, 'dis');
    const list = screen.getByRole('listbox');
    const first = within(list).getAllByRole('option')[0]!;
    expect(first).toHaveTextContent('Discord');
    expect(first.querySelector('svg')).toBeInTheDocument(); // le logo est affiché avec le nom
    await userEvent.keyboard('{Enter}');
    expect(seen).toHaveBeenLastCalledWith({ items: [{ platform: 'discord', url: 'https://discord.gg/' }] });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('un lien déjà personnalisé est conservé quand on change de plateforme', async () => {
    const seen = vi.fn();
    render(<Harness onData={seen} />);
    await userEvent.clear(screen.getByLabelText(/Adresse du profil/));
    await userEvent.type(screen.getByLabelText(/Adresse du profil/), 'https://instagram.com/awa');
    const box = screen.getByRole('combobox');
    await userEvent.click(box);
    await userEvent.type(box, 'face');
    await userEvent.click(within(screen.getByRole('listbox')).getAllByRole('option')[0]!);
    expect(seen).toHaveBeenLastCalledWith({ items: [{ platform: 'facebook', url: 'https://instagram.com/awa' }] });
  });

  it('un lien collé change automatiquement la plateforme', async () => {
    const seen = vi.fn();
    render(<Harness onData={seen} />);
    const url = screen.getByLabelText(/Adresse du profil/);
    await userEvent.clear(url);
    await userEvent.click(url);
    await userEvent.paste('https://www.twitch.tv/awa');
    expect(seen).toHaveBeenLastCalledWith({ items: [{ platform: 'twitch', url: 'https://www.twitch.tv/awa' }] });
  });

  it('indique quand rien ne correspond', async () => {
    render(<Harness onData={() => undefined} />);
    const box = screen.getByRole('combobox');
    await userEvent.click(box);
    await userEvent.type(box, 'zzzzzz');
    expect(screen.getByText(/Aucune plateforme trouvée/)).toBeInTheDocument();
  });
});

describe('page publique : réseaux', () => {
  const doc = (): PageDocument => {
    const d = getSampleDocument('creator');
    return { ...d, blocks: d.blocks.map((b) => (b.type === 'social' ? { ...b, data: { display: 'icons' as const, items: [{ platform: 'discord' as const, url: 'https://discord.gg/awa' }, { platform: 'twitch' as const, url: 'https://twitch.tv/' }, { platform: 'github' as const, url: 'https://github.com/awa' }] } } : b)) };
  };
  it('affiche les nouveaux logos et masque un réseau resté à l’adresse officielle (sans nom d’utilisateur)', () => {
    const { container } = render(<PageRenderer page={doc()} pageUrl="https://1link.test/x" layout="profile" />);
    const labels = [...container.querySelectorAll('.pgp-socials a')].map((a) => a.getAttribute('aria-label'));
    expect(labels).toEqual(['Discord', 'GitHub']);
    expect(container.querySelectorAll('.pgp-socials svg')).toHaveLength(2);
  });
});
