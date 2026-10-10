import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { useT } from '@/i18n/core';
import type { PaymentProvider } from '@/models/blocks';
import { copyToClipboard } from '@/utilities/misc';
import type { BlockRenderProps } from '../types';
import { formatPrice } from '../money';
import { whatsappHref } from '../urls';
import { PgLink } from './links';

/** Catalogue : chaque produit ouvre une discussion WhatsApp pré-remplie. Aucun paiement n'est traité. */
export function ShopRender({ block, ctx }: BlockRenderProps<'shop'>) {
  const t = useT('pub');
  const { title, phone, currency, items, note } = block.data;
  return (
    <section className="pg-section">
      {title && <h2 className="pg-h2">{title}</h2>}
      <ul className="pg-products" role="list">
        {items.map((it, i) => {
          const price = formatPrice(it.price, currency);
          const message = t('pub.order.message', { product: it.name, price: price ? ` (${price})` : '' });
          return (
            <li key={i} className="pg-card pg-product">
              {it.imageUrl && <img src={it.imageUrl} alt="" width={320} height={240} loading="lazy" decoding="async" />}
              <div className="pg-product__body">
                <h3>{it.name}</h3>
                {it.description && <p>{it.description}</p>}
                <p className="pg-product__price">{price ?? t('pub.order.onRequest')}</p>
                <PgLink href={whatsappHref(phone, message)} blockId={block.id} ctx={ctx} icon="whatsapp" title={t('pub.order.button')} className="pg-btn--inline pg-btn--order" />
              </div>
            </li>
          );
        })}
      </ul>
      {note && <p className="pg-note">{note}</p>}
      <p className="pg-note pg-note--legal"><Icon name="info" size={13} /> {t('pub.order.disclaimer')}</p>
    </section>
  );
}

const PROVIDER_ICONS: Record<PaymentProvider, 'phone' | 'credit-card' | 'wallet'> = {
  orange_money: 'phone', mtn_momo: 'phone', moov_money: 'phone', wave: 'phone', bank_transfer: 'credit-card', cash: 'wallet', other: 'wallet',
};

function CopyNumber({ value, onCopied }: { value: string; onCopied: () => void }) {
  const t = useT('pub');
  const [done, setDone] = useState(false);
  return (
    <button
      type="button" className="pg-copy" aria-label={`${t('pub.payment.copy')} ${value}`}
      onClick={async () => {
        if (await copyToClipboard(value)) {
          setDone(true);
          onCopied();
          setTimeout(() => setDone(false), 2000);
        }
      }}
    >
      <Icon name={done ? 'check' : 'copy'} size={16} />
      <span aria-live="polite">{done ? t('pub.payment.copied') : t('pub.payment.copy')}</span>
    </button>
  );
}

/** Affichage des moyens de paiement. 1Link n'encaisse ni ne transfère d'argent : le client paie hors plateforme. */
export function PaymentRender({ block, ctx }: BlockRenderProps<'payment'>) {
  const t = useT('pub');
  const { title, note, methods } = block.data;
  return (
    <section className="pg-section">
      {title && <h2 className="pg-h2">{title}</h2>}
      <ul className="pg-list" role="list">
        {methods.map((m, i) => (
          <li key={i} className="pg-card pg-pay">
            <span className="pg-btn__icon"><Icon name={PROVIDER_ICONS[m.provider]} size={20} /></span>
            <div className="pg-pay__body">
              <strong>{t(`pub.payment.providers.${m.provider}`)}</strong>
              <span className="pg-pay__number">{m.number}</span>
              {m.holder && <small>{t('pub.payment.holder')} : {m.holder}</small>}
            </div>
            {m.provider !== 'cash' && !ctx.preview && <CopyNumber value={m.number.replace(/\s+/g, ' ').trim()} onCopied={() => ctx.onTrack?.(block.id)} />}
          </li>
        ))}
      </ul>
      {note && <p className="pg-note">{note}</p>}
      <p className="pg-note pg-note--legal"><Icon name="shield" size={13} /> {t('pub.payment.disclaimer')}</p>
    </section>
  );
}
