import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { SchemaForm } from '@/components/forms/SchemaForm';
import { blockRegistry, createBlock, validateBlock } from './blocks/registry';
import { PageRenderer } from './renderer/PageRenderer';
import { getSampleDocument } from './samples';
import type { PageDocument } from '@/models/page';

const withPhones = (phones: Record<string, string>): PageDocument => {
  const d = getSampleDocument('professional');
  return {
    ...d,
    // Sans blocs WhatsApp / appel / e-mail : seuls les numéros du profil produisent des boutons.
    blocks: d.blocks.filter((b) => !['whatsapp', 'phone', 'email'].includes(b.type)).map((b) => (b.type === 'profile' ? { ...b, data: { ...b.data, mobilePhone: '', proPhone: '', whatsappPhone: '', ...phones } } : b)),
  };
};
const view = (phones: Record<string, string>) => render(<PageRenderer page={withPhones(phones)} pageUrl="https://1link.test/x" layout="profile" />);

describe('boutons de contact du profil', () => {
  it('ne montre aucun bouton de contact sans numéro', () => {
    view({});
    expect(screen.queryByRole('link', { name: /Message|Appeler/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Partager/ })).toBeInTheDocument();
  });

  it('place le message et l’appel juste avant « Partager » et « QR code »', () => {
    const { container } = view({ mobilePhone: '+224 622 00 11 22', whatsappPhone: '+224 622 33 44 55' });
    const labels = [...container.querySelectorAll('.pgp-actions > .pgp-duo > a, .pgp-actions > button')].map((el) => el.textContent?.trim());
    expect(labels).toEqual(['Message WhatsApp', 'Appeler', 'Partager', 'QR code']);
  });

  it('bascule entre message WhatsApp et SMS selon les numéros', async () => {
    view({ mobilePhone: '+224 622 00 11 22', whatsappPhone: '+224 655 33 44 55' });
    expect(screen.getByRole('link', { name: 'Message WhatsApp' })).toHaveAttribute('href', 'https://wa.me/224655334455');
    await userEvent.click(screen.getByRole('button', { name: 'SMS' }));
    expect(screen.getByRole('link', { name: 'Message SMS' })).toHaveAttribute('href', 'sms:+224622001122');
    await userEvent.click(screen.getByRole('button', { name: 'WhatsApp' }));
    expect(screen.getByRole('link', { name: 'Message WhatsApp' })).toBeInTheDocument();
  });

  it('sans numéro WhatsApp, le message passe par SMS (pas de sélecteur) ; sans mobile, seul WhatsApp est proposé', () => {
    const sms = view({ mobilePhone: '+224 622 00 11 22' });
    expect(screen.getByRole('link', { name: 'Message SMS' })).toHaveAttribute('href', 'sms:+224622001122');
    expect(screen.queryByRole('button', { name: 'WhatsApp' })).not.toBeInTheDocument();
    sms.unmount();
    view({ whatsappPhone: '+224 655 33 44 55' });
    expect(screen.getByRole('link', { name: 'Message WhatsApp' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /SMS/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Appeler' })).not.toBeInTheDocument(); // WhatsApp seul : pas de numéro d’appel
  });

  it('l’appel direct vise le mobile, le numéro pro, ou propose les deux', async () => {
    const one = view({ proPhone: '+224 631 00 00 00' });
    expect(screen.getByRole('link', { name: 'Appeler' })).toHaveAttribute('href', 'tel:+224631000000');
    one.unmount();
    view({ mobilePhone: '+224 622 00 11 22', proPhone: '+224 631 00 00 00' });
    expect(screen.getByRole('link', { name: 'Appeler (mobile)' })).toHaveAttribute('href', 'tel:+224622001122');
    await userEvent.click(screen.getByRole('button', { name: 'Pro' }));
    expect(screen.getByRole('link', { name: 'Appeler (pro)' })).toHaveAttribute('href', 'tel:+224631000000');
  });

  it('ignore un numéro invalide', () => {
    view({ mobilePhone: 'abc', whatsappPhone: '12' });
    expect(screen.queryByRole('link', { name: /Message|Appeler/ })).not.toBeInTheDocument();
  });

  it('en aperçu, les boutons n’ouvrent rien', () => {
    render(<PageRenderer page={withPhones({ mobilePhone: '+224 622 00 11 22' })} pageUrl="https://1link.test/x" layout="profile" preview />);
    expect(screen.getByRole('link', { name: 'Message SMS' })).not.toHaveAttribute('href');
  });
});

describe('champs numéro du profil (éditeur)', () => {
  it('propose mobile, professionnel et WhatsApp, et valide leur format', () => {
    const profile = createBlock('profile', { category: 'professional' });
    expect(profile.data).toMatchObject({ mobilePhone: '', proPhone: '', whatsappPhone: '' });
    profile.data.displayName = 'Awa';
    expect(validateBlock(profile)).toEqual({});
    profile.data.mobilePhone = 'pas un numéro';
    expect(validateBlock(profile)).toEqual({ mobilePhone: 'common.validation.phone' });
  });

  it('affiche les trois champs dans le formulaire du profil', () => {
    function Harness() {
      const [data, setData] = useState<Record<string, unknown>>({ displayName: 'Awa', mobilePhone: '', proPhone: '', whatsappPhone: '' });
      const phones = blockRegistry.profile.fields.filter((f) => f.kind === 'tel');
      return <SchemaForm labelPrefix="editor.blocks.profile" fields={phones} data={data} errors={{}} onChange={(p) => setData({ ...data, ...p })} />;
    }
    render(<Harness />);
    expect(screen.getByLabelText(/Numéro mobile/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Numéro professionnel/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Numéro WhatsApp/)).toBeInTheDocument();
  });
});

