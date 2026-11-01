import { describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { UpgradePromptHost, openUpgradePrompt } from './UpgradePrompt';
import { PlanGateNotice } from './PlanNotice';

const Where = () => <p data-testid="where">{useLocation().pathname}</p>;
const mount = (ui = <></>) => render(
  <MemoryRouter initialEntries={['/dashboard/page']}>
    <Routes><Route path="*" element={<>{ui}<UpgradePromptHost /><Where /></>} /></Routes>
  </MemoryRouter>,
);

describe('modal d’abonnement des fonctionnalités verrouillées', () => {
  it('propose oui / non, plus tard et ne fait rien tant qu’on ne répond pas', async () => {
    mount();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    act(() => openUpgradePrompt({ plan: 'pro', feature: 'Galerie' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('« Galerie » est disponible avec l’offre Pro.');
    await userEvent.click(screen.getByRole('button', { name: 'Non, plus tard' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/dashboard/page');
  });

  it('« Oui » ouvre la page des offres', async () => {
    mount();
    act(() => openUpgradePrompt({ plan: 'basic' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Cette fonctionnalité est disponible avec l’offre Basique.');
    await userEvent.click(screen.getByRole('button', { name: 'Oui, m’abonner' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/dashboard/subscription');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('la notice « Réservé à l’offre … » ouvre le même modal', async () => {
    mount(<PlanGateNotice plan="pro" />);
    await userEvent.click(screen.getByRole('button', { name: 'Voir les offres' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('offre Pro');
    await userEvent.click(screen.getByRole('button', { name: 'Non, plus tard' }));
  });
});
