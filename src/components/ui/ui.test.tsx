import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Button, Checkbox, ConfirmDialog, DataTable, Dropdown, EmptyState, Input, Modal, Pagination, Tabs, ToastProvider, useToast, type Column } from '.';

describe('Button', () => {
  it('désactive les doubles clics pendant le chargement', async () => {
    const onClick = vi.fn();
    render(<Button loading onClick={onClick}>Envoyer</Button>);
    const btn = screen.getByRole('button', { name: /envoyer/i });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('champs de formulaire', () => {
  it('relie libellé, erreur et aria-describedby', () => {
    render(<Input label="E-mail" error="Adresse invalide" />);
    const input = screen.getByLabelText('E-mail');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    const err = screen.getByRole('alert');
    expect(err).toHaveTextContent('Adresse invalide');
    expect(input.getAttribute('aria-describedby')).toBe(err.id);
  });
  it('bascule une case à cocher au clavier', async () => {
    render(<Checkbox label="J’accepte" />);
    const box = screen.getByLabelText('J’accepte');
    box.focus();
    await userEvent.keyboard(' ');
    expect(box).toBeChecked();
  });
});

function ModalHost() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Ouvrir</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Titre" footer={<button>Valider</button>}><input aria-label="champ" /></Modal>
    </>
  );
}

describe('Modal', () => {
  it('piège le focus, ferme avec Échap et restitue le focus', async () => {
    render(<ModalHost />);
    const opener = screen.getByRole('button', { name: 'Ouvrir' });
    await userEvent.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'Titre' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog.contains(document.activeElement)).toBe(true);
    for (let i = 0; i < 6; i++) await userEvent.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });
});

describe('ConfirmDialog', () => {
  it('exige la saisie du texte demandé pour les actions sensibles', async () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog open onCancel={() => undefined} onConfirm={onConfirm} title="Suspendre" confirmLabel="Suspendre" tone="danger" requireText="mariama" />);
    const confirm = screen.getByRole('button', { name: 'Suspendre' });
    expect(confirm).toBeDisabled();
    await userEvent.type(screen.getByRole('textbox'), 'mariama');
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledOnce();
  });
  it('utilise le rôle alertdialog', () => {
    render(<ConfirmDialog open onCancel={() => undefined} onConfirm={() => undefined} title="Supprimer ?" confirmLabel="Supprimer" />);
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });
});

describe('Tabs', () => {
  it('navigue aux flèches et expose les rôles ARIA', async () => {
    render(<Tabs label="Sections" items={[{ id: 'a', label: 'A', panel: <p>Panneau A</p> }, { id: 'b', label: 'B', panel: <p>Panneau B</p> }, { id: 'c', label: 'C', panel: <p>Panneau C</p> }]} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    tabs[0]!.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Panneau B');
    await userEvent.keyboard('{End}');
    expect(tabs[2]).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
  });
});

describe('Dropdown', () => {
  it('s’ouvre, navigue aux flèches et se ferme avec Échap', async () => {
    const onSelect = vi.fn();
    render(<MemoryRouter><Dropdown trigger={<button>Menu</button>} items={[{ id: '1', label: 'Un', onSelect }, { id: '2', label: 'Deux' }]} /></MemoryRouter>);
    const trigger = screen.getByRole('button', { name: 'Menu' });
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await vi.waitFor(() => expect(screen.getByRole('menuitem', { name: 'Un' })).toHaveFocus());
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Deux' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});

interface Row { id: string; name: string; n: number }
const rows: Row[] = [{ id: '1', name: 'Alpha', n: 2 }, { id: '2', name: 'Beta', n: 1 }];
const columns: Column<Row>[] = [
  { key: 'name', header: 'Nom', sortable: true, primary: true, cell: (r) => r.name },
  { key: 'n', header: 'Valeur', sortable: true, cell: (r) => r.n },
];

describe('DataTable', () => {
  it('affiche les libellés mobiles, le tri accessible et la ligne cliquable', async () => {
    const onSort = vi.fn();
    const onRow = vi.fn();
    render(<DataTable caption="Tableau" columns={columns} rows={rows} getRowId={(r) => r.id} sort={{ key: 'name', dir: 'asc' }} onSort={onSort} onRowClick={onRow} />);
    expect(screen.getByRole('columnheader', { name: /Nom/ })).toHaveAttribute('aria-sort', 'ascending');
    await userEvent.click(screen.getByRole('button', { name: /Valeur/ }));
    expect(onSort).toHaveBeenCalledWith('n');
    const cell = screen.getByText('2').closest('td')!;
    expect(cell).toHaveAttribute('data-label', 'Valeur');
    await userEvent.click(screen.getByText('Beta'));
    expect(onRow).toHaveBeenCalledWith(rows[1]);
  });
  it('gère chargement, erreur avec nouvelle tentative et état vide', async () => {
    const onRetry = vi.fn();
    const { rerender } = render(<DataTable caption="T" columns={columns} rows={undefined} getRowId={(r) => r.id} loading />);
    expect(document.querySelector('tbody')).toHaveAttribute('aria-busy', 'true');
    rerender(<DataTable caption="T" columns={columns} rows={undefined} getRowId={(r) => r.id} error="network" onRetry={onRetry} />);
    await userEvent.click(screen.getByRole('button', { name: /réessayer/i }));
    expect(onRetry).toHaveBeenCalled();
    rerender(<DataTable caption="T" columns={columns} rows={[]} getRowId={(r) => r.id} />);
    expect(screen.getByText('Aucun résultat')).toBeInTheDocument();
  });
});

describe('Pagination', () => {
  it('indique la plage, désactive les bornes et notifie le changement', async () => {
    const onChange = vi.fn();
    render(<Pagination page={1} pageSize={10} total={35} onChange={onChange} />);
    expect(screen.getByText('1–10 sur 35')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Page précédente' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Page suivante' }));
    expect(onChange).toHaveBeenCalledWith(2);
    expect(screen.getByRole('button', { name: 'Page 1' })).toHaveAttribute('aria-current', 'page');
  });
});

function ToastHost() {
  const toast = useToast();
  return <button onClick={() => toast.push({ tone: 'success', title: 'Enregistré' })}>Notifier</button>;
}
describe('Toast', () => {
  it('annonce le message via une région live', async () => {
    render(<ToastProvider><ToastHost /></ToastProvider>);
    await userEvent.click(screen.getByRole('button', { name: 'Notifier' }));
    expect(within(screen.getByRole('status')).getByText('Enregistré')).toBeInTheDocument();
  });
});

describe('EmptyState', () => {
  it('rend titre, description et action', () => {
    render(<EmptyState title="Rien" description="Ajoutez-en" action={<button>Ajouter</button>} />);
    expect(screen.getByRole('heading', { name: 'Rien' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ajouter' })).toBeInTheDocument();
  });
});
