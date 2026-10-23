import { useMemo, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/overlays';
import { useT } from '@/i18n/core';
import type { PaymentProvider } from '@/models/blocks';
import { copyToClipboard } from '@/utilities/misc';
import type { BlockRenderProps } from '../types';
import { formatAltPrice, formatPrice, parseRate } from '../money';
import { formatCurrency } from '@/utilities/format';
import { whatsappHref } from '../urls';
import { PgLink } from './links';
import { PgImage } from './image';

/** Catalogue : chaque produit peut être commandé seul ou ajouté à un panier multi-produits avec commande groupée sur WhatsApp. */
export function ShopRender({ block, ctx }: BlockRenderProps<'shop'>) {
  const t = useT('pub');
  const { title, phone, currency, items, note, altCurrency, altRate } = block.data;
  const alt = altCurrency && altCurrency !== 'none' && parseRate(altRate ?? '') !== null ? altCurrency : null;

  const [cart, setCart] = useState<Record<number, number>>({});
  const [cartOpen, setCartOpen] = useState(false);
  const [delivery, setDelivery] = useState('');
  const [instructions, setInstructions] = useState('');

  const addItem = (idx: number) => setCart((prev) => ({ ...prev, [idx]: (prev[idx] ?? 0) + 1 }));
  const decItem = (idx: number) =>
    setCart((prev) => {
      const cur = prev[idx] ?? 0;
      if (cur <= 1) {
        const { [idx]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [idx]: cur - 1 };
    });
  const deleteItem = (idx: number) =>
    setCart((prev) => {
      const { [idx]: _, ...rest } = prev;
      return rest;
    });
  const clearCart = () => setCart({});

  const cartEntries = useMemo(
    () =>
      Object.entries(cart)
        .map(([idxStr, qty]) => ({ item: items[Number(idxStr)]!, index: Number(idxStr), qty }))
        .filter((e) => Boolean(e.item && e.qty > 0)),
    [cart, items],
  );

  const totalCount = cartEntries.reduce((sum, e) => sum + e.qty, 0);
  const totalPrice = cartEntries.reduce((sum, e) => {
    const num = parseFloat(String(e.item.price).replace(/[^\d.]/g, ''));
    return sum + (isNaN(num) ? 0 : num * e.qty);
  }, 0);

  const formattedTotal = formatCurrency(totalPrice, currency);
  const altFormattedTotal = alt && totalPrice > 0 ? formatAltPrice(String(totalPrice), altRate, alt) : null;

  const cartMessage = useMemo(() => {
    if (cartEntries.length === 0) return '';
    const lines: string[] = ['Bonjour, je souhaite passer cette commande sur votre 1Link :', ''];
    for (const { item, qty } of cartEntries) {
      const uPrice = formatPrice(item.price, currency) ?? t('pub.order.onRequest');
      const unitNum = parseFloat(String(item.price).replace(/[^\d.]/g, ''));
      const lineTotal = !isNaN(unitNum) ? formatCurrency(unitNum * qty, currency) : uPrice;
      lines.push(`• ${qty}x ${item.name} (${uPrice}) = ${lineTotal}`);
    }
    lines.push('');
    if (totalPrice > 0) {
      lines.push(`Total : ${formattedTotal}${altFormattedTotal ? ` (≈ ${altFormattedTotal})` : ''}`);
    }
    if (delivery.trim()) {
      lines.push(`Lieu de livraison : ${delivery.trim()}`);
    }
    if (instructions.trim()) {
      lines.push(`Précisions : ${instructions.trim()}`);
    }
    lines.push('');
    lines.push('Pouvez-vous me confirmer la disponibilité et les modalités ?');
    return lines.join('\n');
  }, [cartEntries, totalPrice, formattedTotal, altFormattedTotal, delivery, instructions, currency, t]);

  return (
    <section className="pg-section">
      {title && <h2 className="pg-h2">{title}</h2>}
      <ul className="pg-products" role="list">
        {items.map((it, i) => {
          const price = formatPrice(it.price, currency);
          const message = t('pub.order.message', { product: it.name, price: price ? ` (${price})` : '' });
          const qty = cart[i] ?? 0;
          return (
            <li key={i} className="pg-card pg-product">
              {it.imageUrl && <PgImage src={it.imageUrl} alt="" width={320} height={240} ctx={ctx} />}
              <div className="pg-product__body">
                <h3>{it.name}</h3>
                {it.description && <p>{it.description}</p>}
                <p className="pg-product__price">{price ?? t('pub.order.onRequest')}</p>
                {alt && price && <p className="pg-product__alt">≈ {formatAltPrice(it.price, altRate, alt)}</p>}

                <div className="pg-product__actions">
                  {qty > 0 ? (
                    <div className="pg-stepper" role="group" aria-label={it.name}>
                      <button type="button" className="pg-stepper__btn" onClick={() => decItem(i)} aria-label="Moins">
                        <Icon name="minus" size={14} />
                      </button>
                      <span className="pg-stepper__val">{qty}</span>
                      <button type="button" className="pg-stepper__btn" onClick={() => addItem(i)} aria-label="Plus">
                        <Icon name="plus" size={14} />
                      </button>
                    </div>
                  ) : (
                    <button type="button" className="pg-btn-add-cart" onClick={() => addItem(i)}>
                      <Icon name="plus" size={14} />
                      <span>{t('pub.order.addToCart')}</span>
                    </button>
                  )}
                  <PgLink href={whatsappHref(phone, message)} blockId={block.id} ctx={ctx} icon="whatsapp" title={t('pub.order.button')} className="pg-btn--inline pg-btn--order" />
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {totalCount > 0 && (
        <div className="pg-cart-float">
          <button
            type="button"
            className="pg-cart-float__btn"
            onClick={() => setCartOpen(true)}
            aria-label={`${t('pub.order.cart')} : ${totalCount} articles, total ${formattedTotal}`}
          >
            <span className="pg-cart-float__left">
              <span className="pg-cart-float__badge">{totalCount}</span>
              <span>{t('pub.order.cart')}</span>
            </span>
            <span className="pg-cart-float__right">
              <strong>{formattedTotal}</strong>
              <Icon name="arrow-right" size={16} />
            </span>
          </button>
        </div>
      )}

      {alt && <p className="pg-note">{t('pub.order.altNote', { alt, rate: formatCurrency(parseRate(altRate ?? '')!, currency) })}</p>}
      {note && <p className="pg-note">{note}</p>}
      <p className="pg-note pg-note--legal"><Icon name="info" size={13} /> {t('pub.order.disclaimer')}</p>

      {cartOpen && (
        <Modal
          open={cartOpen}
          onClose={() => setCartOpen(false)}
          title={`${t('pub.order.cartTitle')} (${totalCount})`}
          description={t('pub.order.disclaimer')}
        >
          <div className="pg-cart-modal">
            <div className="pg-cart-list">
              {cartEntries.map(({ item, index, qty }) => {
                const uPrice = formatPrice(item.price, currency) ?? t('pub.order.onRequest');
                const unitNum = parseFloat(String(item.price).replace(/[^\d.]/g, ''));
                const lineTotal = !isNaN(unitNum) ? formatCurrency(unitNum * qty, currency) : uPrice;
                return (
                  <div key={index} className="pg-cart-row">
                    <div className="pg-cart-row__info">
                      <strong>{item.name}</strong>
                      <span className="pg-cart-row__price">{uPrice}</span>
                    </div>
                    <div className="pg-cart-row__ctrl">
                      <div className="pg-stepper">
                        <button type="button" className="pg-stepper__btn" onClick={() => decItem(index)} aria-label="Moins">
                          <Icon name="minus" size={13} />
                        </button>
                        <span className="pg-stepper__val">{qty}</span>
                        <button type="button" className="pg-stepper__btn" onClick={() => addItem(index)} aria-label="Plus">
                          <Icon name="plus" size={13} />
                        </button>
                      </div>
                      <span className="pg-cart-row__total">{lineTotal}</span>
                      <button type="button" className="pg-cart-row__del" onClick={() => deleteItem(index)} aria-label="Supprimer">
                        <Icon name="trash" size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pg-cart-inputs">
              <label className="pg-field">
                <span>{t('pub.order.deliveryLabel')}</span>
                <input
                  type="text"
                  value={delivery}
                  onChange={(e) => setDelivery(e.target.value)}
                  placeholder={t('pub.order.deliveryPlaceholder')}
                  maxLength={120}
                />
              </label>
              <label className="pg-field">
                <span>{t('pub.order.notesLabel')}</span>
                <input
                  type="text"
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder={t('pub.order.notesPlaceholder')}
                  maxLength={200}
                />
              </label>
            </div>

            <div className="pg-cart-total">
              <span>{t('pub.order.total')}</span>
              <strong>{formattedTotal}</strong>
              {altFormattedTotal && <small>≈ {altFormattedTotal}</small>}
            </div>

            <div className="pg-cart-foot">
              <PgLink
                href={whatsappHref(phone, cartMessage)}
                blockId={block.id}
                ctx={ctx}
                icon="whatsapp"
                title={`${t('pub.order.checkout')} (${formattedTotal})`}
                className="pg-btn--inline pg-btn--order pg-btn--checkout"
              />
              <button type="button" className="pg-cart-clear" onClick={clearCart}>
                {t('pub.order.clearCart')}
              </button>
            </div>
          </div>
        </Modal>
      )}
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
