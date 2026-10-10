import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { buildBookingMessage, todayLocal, validateBooking, type BookingRequest } from './blocks/booking';
import { createBlock, isBlockComplete, validateBlock } from './blocks/registry';
import { PageRenderer } from './renderer/PageRenderer';
import { getSampleDocument } from './samples';
import type { BookingData } from '@/models/blocks';

const req = (over: Partial<BookingRequest> = {}): BookingRequest => ({ name: 'Awa', service: '', date: '', slot: 'any', message: '', ...over });

describe('rendez-vous — logique', () => {
  it('valide nom, date non passée et longueur du message', () => {
    expect(validateBooking(req({ name: ' ' }), '2026-10-10').name).toBe('required');
    expect(validateBooking(req({ date: '2026-10-09' }), '2026-10-10').date).toBe('past');
    expect(validateBooking(req({ date: '2026-10-10' }), '2026-10-10').date).toBeUndefined();
    expect(validateBooking(req({ message: 'x'.repeat(401) }), '2026-10-10').message).toBe('too_long');
    expect(validateBooking(req(), '2026-10-10')).toEqual({});
  });
  it('compose un message avec uniquement les informations fournies', () => {
    const labels = { intro: ({ name }: { name: string }) => `Bonjour ${name}`, service: (s: string) => `S:${s}`, date: (d: string) => `D:${d}`, slot: (s: string) => `C:${s}`, note: (m: string) => `M:${m}` };
    expect(buildBookingMessage(req(), labels)).toBe('Bonjour Awa');
    expect(buildBookingMessage(req({ service: 'Coupe', date: '2026-10-12', slot: 'morning', message: 'Merci' }), labels)).toBe('Bonjour Awa\nS:Coupe\nD:2026-10-12\nC:morning\nM:Merci');
  });
  it('todayLocal formate la date locale', () => {
    expect(todayLocal(new Date(2026, 9, 5))).toBe('2026-10-05');
  });
  it('le bloc exige un numéro WhatsApp et des motifs nommés', () => {
    const b = createBlock('booking', { category: 'professional' });
    expect(isBlockComplete(b)).toBe(false);
    expect(validateBlock(b).phone).toBe('common.validation.required');
    expect(validateBlock({ ...b, data: { ...b.data, phone: '+224 622 00 00 00', services: [{ name: '' }] } })['services.0.name']).toBe('common.validation.required');
  });
});

const page = (data: Partial<BookingData> = {}) => {
  const doc = getSampleDocument('professional');
  const b = createBlock('booking', { category: 'professional' });
  b.data = { title: 'Consultation', phone: '+224 622 00 00 00', availability: 'Lun–Ven 9h–17h', services: [{ name: 'Première consultation' }], note: '', ...data };
  return { ...doc, blocks: [...doc.blocks, b] };
};

describe('rendez-vous — formulaire visiteur', () => {
  it('refuse un formulaire invalide, puis ouvre WhatsApp avec un message prêt, sans rien stocker', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<PageRenderer page={page()} pageUrl="https://1link.gn/x" />);
    await userEvent.click(screen.getByRole('button', { name: /Demander un rendez-vous/ }));
    await userEvent.click(screen.getByRole('button', { name: /Envoyer sur WhatsApp/ }));
    expect(await screen.findByText('Ce champ est obligatoire.')).toBeInTheDocument();
    expect(open).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText(/Votre nom/), 'Awa Diallo');
    await userEvent.selectOptions(screen.getByLabelText('Motif'), 'Première consultation');
    await userEvent.selectOptions(screen.getByLabelText('Créneau'), 'morning');
    await userEvent.type(screen.getByLabelText(/Message/), 'Merci de confirmer');
    await userEvent.click(screen.getByRole('button', { name: /Envoyer sur WhatsApp/ }));
    expect(open).toHaveBeenCalledOnce();
    const [url, target, features] = open.mock.calls[0]!;
    const parsed = new URL(String(url));
    expect(parsed.origin + parsed.pathname).toBe('https://wa.me/224622000000');
    const text = parsed.searchParams.get('text')!;
    expect(text).toContain('Awa Diallo');
    expect(text).toContain('Première consultation');
    expect(text).toContain('Matin');
    expect(text).toContain('Merci de confirmer');
    expect(target).toBe('_blank');
    expect(features).toContain('noopener');
    expect(screen.getByText(/1Link ne conserve aucune de vos informations/)).toBeInTheDocument();
    open.mockRestore();
  });

  it('refuse une date passée', async () => {
    render(<PageRenderer page={page()} pageUrl="https://1link-gn/x" />);
    await userEvent.click(screen.getByRole('button', { name: /Demander un rendez-vous/ }));
    await userEvent.type(screen.getByLabelText(/Votre nom/), 'Awa');
    await userEvent.type(screen.getByLabelText('Date souhaitée'), '2020-01-01');
    await userEvent.click(screen.getByRole('button', { name: /Envoyer sur WhatsApp/ }));
    expect(await screen.findByText(/à partir d’aujourd’hui/)).toBeInTheDocument();
  });

  it('en aperçu, l’envoi est inerte', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<PageRenderer page={page()} pageUrl="https://1link.gn/x" preview />);
    await userEvent.click(screen.getByRole('button', { name: /Demander un rendez-vous/ }));
    await userEvent.type(screen.getByLabelText(/Votre nom/), 'Awa');
    await userEvent.click(screen.getByRole('button', { name: /Envoyer sur WhatsApp/ }));
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });
});
