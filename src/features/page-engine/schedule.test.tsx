import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { createBlock, validateBlock } from './blocks/registry';
import { fromLocalInput, isBlockLive, nextScheduleChange, scheduleError, scheduleState, toLocalInput } from './schedule';
import { PageRenderer } from './renderer/PageRenderer';
import { getSampleDocument } from './samples';
import type { AnyBlock } from '@/models/blocks';

const T0 = Date.parse('2026-10-10T12:00:00Z');
const at = (iso: string) => Date.parse(iso);

describe('programmation — logique pure', () => {
  it('calcule l’état selon la fenêtre', () => {
    expect(scheduleState(undefined, T0)).toBe('none');
    expect(scheduleState({ from: null, until: null }, T0)).toBe('none');
    expect(scheduleState({ from: '2026-10-11T00:00:00Z', until: null }, T0)).toBe('upcoming');
    expect(scheduleState({ from: '2026-10-09T00:00:00Z', until: '2026-10-11T00:00:00Z' }, T0)).toBe('active');
    expect(scheduleState({ from: null, until: '2026-10-10T12:00:00Z' }, T0)).toBe('expired'); // borne de fin exclusive
    expect(scheduleState({ from: '2026-10-10T12:00:00Z', until: null }, T0)).toBe('active'); // borne de début inclusive
  });

  it('un bloc masqué ne devient jamais visible par sa programmation', () => {
    const b: AnyBlock = { ...createBlock('text', { category: 'individual' }), visible: false, schedule: { from: '2026-10-09T00:00:00Z', until: null } };
    expect(isBlockLive(b, T0)).toBe(false);
    expect(isBlockLive({ ...b, visible: true }, T0)).toBe(true);
    expect(isBlockLive({ ...b, visible: true, schedule: { from: '2026-10-11T00:00:00Z', until: null } }, T0)).toBe(false);
  });

  it('détecte les fenêtres invalides', () => {
    expect(scheduleError({ from: '2026-10-11T00:00:00Z', until: '2026-10-10T00:00:00Z' })).toBe('invalid_range');
    expect(scheduleError({ from: '2026-10-10T00:00:00Z', until: '2026-10-10T00:00:00Z' })).toBe('invalid_range');
    expect(scheduleError({ from: 'n’importe quoi', until: null })).toBe('invalid_date');
    expect(scheduleError({ from: '2026-10-10T00:00:00Z', until: '2026-10-11T00:00:00Z' })).toBeNull();
    const b: AnyBlock = { ...createBlock('divider', { category: 'individual' }), schedule: { from: '2026-10-11T00:00:00Z', until: '2026-10-10T00:00:00Z' } };
    expect(validateBlock(b).schedule).toBe('common.validation.schedule');
  });

  it('convertit heure locale ↔ ISO sans perte', () => {
    const iso = '2026-10-10T09:30:00.000Z';
    expect(fromLocalInput(toLocalInput(iso))).toBe(iso);
    expect(toLocalInput(null)).toBe('');
    expect(fromLocalInput('')).toBeNull();
  });

  it('trouve le prochain changement d’état', () => {
    const a: AnyBlock = { ...createBlock('text', { category: 'individual' }), schedule: { from: '2026-10-10T13:00:00Z', until: '2026-10-12T00:00:00Z' } };
    const b: AnyBlock = { ...createBlock('text', { category: 'individual' }), schedule: { from: null, until: '2026-10-10T12:30:00Z' } };
    expect(nextScheduleChange([a, b], T0)).toBe(at('2026-10-10T12:30:00Z'));
    expect(nextScheduleChange([], T0)).toBeNull();
  });
});

afterEach(() => vi.useRealTimers());

describe('programmation — rendu', () => {
  const build = (schedule: AnyBlock['schedule']) => {
    const doc = getSampleDocument('individual');
    const text = createBlock('text', { category: 'individual' });
    text.data.body = 'Promotion de la Tabaski';
    return { ...doc, blocks: [...doc.blocks, { ...text, schedule } as AnyBlock] };
  };

  it('masque un bloc à venir ou terminé sur la page publique, l’affiche en aperçu avec une étiquette', () => {
    vi.setSystemTime(T0);
    const future = build({ from: '2026-10-11T00:00:00Z', until: null });
    const { rerender } = render(<PageRenderer page={future} pageUrl="https://1link.gn/x" />);
    expect(screen.queryByText('Promotion de la Tabaski')).not.toBeInTheDocument();
    rerender(<PageRenderer page={future} pageUrl="https://1link.gn/x" preview />);
    expect(screen.getByText('Promotion de la Tabaski')).toBeInTheDocument();
    expect(screen.getByText(/Programmé : pas encore visible/)).toBeInTheDocument();
    rerender(<PageRenderer page={build({ from: null, until: '2026-10-09T00:00:00Z' })} pageUrl="https://1link.gn/x" />);
    expect(screen.queryByText('Promotion de la Tabaski')).not.toBeInTheDocument();
  });

  it('affiche le bloc au bon moment sans rechargement', () => {
    vi.useFakeTimers({ now: T0 });
    render(<PageRenderer page={build({ from: '2026-10-10T12:00:10Z', until: null })} pageUrl="https://1link.gn/x" />);
    expect(screen.queryByText('Promotion de la Tabaski')).not.toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(11_000); });
    expect(screen.getByText('Promotion de la Tabaski')).toBeInTheDocument();
  });
});
