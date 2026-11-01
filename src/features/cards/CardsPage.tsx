import { useEffect, useState } from 'react';
import { PageHeader, Segmented } from '@/components/ui';
import { useDocumentTitle } from '@/hooks/dom';
import { useT } from '@/i18n/core';
import { useEditor } from '@/state/editor';
import { OrderWizard } from './OrderWizard';
import { OrdersPanel } from './OrdersPanel';
import './cards.css';

/**
 * Cartes de visite 1Link : choisir un modèle (QR ou QR + NFC), personnaliser, prévisualiser recto / verso, commander, puis suivre
 * la commande. Les informations du profil sont reprises automatiquement ; le paiement est confirmé par l'équipe (aucun paiement en ligne simulé).
 */
export default function CardsPage() {
  const t = useT('cards');
  useDocumentTitle(`${t('cards.title')} · 1Link`);
  const [tab, setTab] = useState<'order' | 'orders'>('order');
  const [highlight, setHighlight] = useState<string | null>(null);
  useEffect(() => void useEditor.getState().load(), []);

  return (
    <div className="cardpg">
      <PageHeader title={t('cards.title')} description={t('cards.subtitle')} />
      <div className="cardpg__tabs">
        <Segmented label={t('cards.title')} value={tab} onChange={setTab} options={[{ value: 'order', label: t('cards.tabs.order'), icon: 'plus' }, { value: 'orders', label: t('cards.tabs.orders'), icon: 'package' }]} />
      </div>
      {tab === 'order'
        ? <OrderWizard onOrdered={(order) => { setHighlight(order.id); setTab('orders'); }} />
        : <OrdersPanel highlight={highlight} onNew={() => setTab('order')} />}
    </div>
  );
}
