import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { buildVCard, vcardFileName } from './blocks/vcard';
import { createBlock } from './blocks/registry';
import { PageRenderer } from './renderer/PageRenderer';
import { getSampleDocument } from './samples';
import { useEditor } from '@/state/editor';
import { useSession } from '@/state/session';
import type { VcardData } from '@/models/blocks';

const data: VcardData = {
  label: '', fullName: 'Mamadou Alpha Keita', organization: 'Kalou, Studio; SARL', jobTitle: 'Développeur', phone: '+224 600 00 00 00',
  email: 'm@exemple.com', website: 'https://exemple.com', address: 'Kaloum\nConakry', note: 'Disponible',
};

describe('vCard', () => {
  it('neutralise l’injection de lignes : ni propriété ni seconde fiche ne peuvent être ajoutées', () => {
    const hostile = buildVCard({ ...data, website: 'https://exemple.com/x\r\nEND:VCARD\r\nBEGIN:VCARD\r\nFN:Support 1Link', note: 'a\rEND:VCARD\rBEGIN:VCARD', address: 'x\u0000\nEND:VCARD' });
    const lines = hostile.split('\r\n');
    expect(lines.filter((l) => l === 'BEGIN:VCARD')).toHaveLength(1);
    expect(lines.filter((l) => l === 'END:VCARD')).toHaveLength(1);
    expect(lines.filter((l) => l.startsWith('FN:'))).toHaveLength(1);
    expect(hostile).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/);
  });

  it('n’écrit une adresse de site que si elle est en http(s)', () => {
    expect(buildVCard({ ...data, website: 'javascript:alert(1)' })).not.toContain('URL:');
    expect(buildVCard({ ...data, website: 'data:text/html,x' })).not.toContain('URL:');
    expect(buildVCard({ ...data, website: ' https://exemple.com/ok ' })).toContain('URL:https://exemple.com/ok');
  });

  it('produit une carte 3.0 valide avec échappements et fins de ligne CRLF', () => {
    const v = buildVCard(data);
    expect(v.startsWith('BEGIN:VCARD\r\nVERSION:3.0\r\n')).toBe(true);
    expect(v.endsWith('END:VCARD\r\n')).toBe(true);
    expect(v).toContain('FN:Mamadou Alpha Keita');
    expect(v).toContain('N:Keita;Mamadou Alpha;;;');
    expect(v).toContain('ORG:Kalou\\, Studio\\; SARL');
    expect(v).toContain('TEL;TYPE=CELL,VOICE:+224600000000');
    expect(v).toContain('ADR;TYPE=WORK:;;Kaloum\\nConakry;;;;');
    expect(v).not.toMatch(/[^\r]\n/);
  });
  it('omet les champs vides et plie les lignes longues à 75 caractères', () => {
    const v = buildVCard({ ...data, organization: '', phone: '', note: 'x'.repeat(200) });
    expect(v).not.toContain('ORG:');
    expect(v).not.toContain('TEL');
    const physical = v.split('\r\n');
    expect(physical.every((l) => l.length <= 75)).toBe(true);
    expect(physical.some((l) => l.startsWith(' '))).toBe(true);
  });
  it('génère un nom de fichier sûr', () => {
    expect(vcardFileName({ ...data, fullName: 'Aïssatou Diallo' })).toBe('aissatou-diallo.vcf');
    expect(vcardFileName({ ...data, fullName: '###' })).toBe('contact.vcf');
  });
  it('le bloc est incomplet sans nom et reprend le nom du profil à l’ajout', () => {
    expect(createBlock('vcard', { category: 'individual' }).data.fullName).toBe('');
    const doc = structuredClone(getSampleDocument('professional'));
    useEditor.setState({ status: 'ready', doc, saved: doc, past: [], future: [], dirty: false });
    useSession.setState({ status: 'authenticated', session: { user: {} as never, permissions: [], entitlements: { maxBlocks: 500, removeBranding: true, analyticsDays: 90, teamSeats: 1 }, access: { phase: 'subscribed', plan: 'pro', trialEndsAt: null, daysLeft: null, locked: false, paidTrialAvailable: false }, expiresAt: '' } });
    const res = useEditor.getState().addBlock('vcard');
    const added = useEditor.getState().doc!.blocks.find((b) => res.ok && b.id === res.id);
    expect(added?.type === 'vcard' && added.data.fullName).toBe('Mamadou Keita');
  });
  it('télécharge un fichier .vcf au clic sur la page publique (pas en aperçu)', async () => {
    const create = vi.fn(() => 'blob:x');
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const doc = getSampleDocument('individual');
    const block = { ...createBlock('vcard', { category: 'individual' }), data } as ReturnType<typeof createBlock<'vcard'>>;
    const tracked = vi.fn();
    const { rerender } = render(<PageRenderer page={{ ...doc, blocks: [...doc.blocks, block] }} pageUrl="https://1link.gn/x" onTrack={tracked} />);
    await userEvent.click(screen.getByRole('link', { name: /Enregistrer mon contact/ }));
    expect(create).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(tracked).toHaveBeenCalledWith(block.id);
    rerender(<PageRenderer page={{ ...doc, blocks: [...doc.blocks, block] }} pageUrl="https://1link.gn/x" preview onTrack={tracked} />);
    await userEvent.click(screen.getByRole('link', { name: /Enregistrer mon contact/ }));
    expect(create).toHaveBeenCalledOnce();
    click.mockRestore();
  });
});
