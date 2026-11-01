import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Badge, Button, Input, Skeleton, Textarea, useToast } from '@/components/ui';
import { paths } from '@/app/configuration/paths';
import { pageShareUrl } from '@/app/configuration/env';
import { useResource } from '@/hooks/useResource';
import { useT } from '@/i18n/core';
import { isApiError } from '@/models/api';
import {
  CARD_TEMPLATES, CARD_TEMPLATE_IDS, MAX_CARDS_PER_ORDER, MAX_UNITS_PER_LINE, defaultDesign, priceOrder,
  type CardDelivery, type CardDesign, type CardKind, type CardOrder, type CardProduct, type CardTemplateId,
} from '@/models/cards';
import { api } from '@/services/api';
import { useEditor } from '@/state/editor';
import { useSession } from '@/state/session';
import { formatCurrency } from '@/utilities/format';
import { isPhone } from '@/utilities/validation';
import { CardFace, CardPreview } from './CardPreview';
import { DesignFields, withTemplate } from './DesignFields';

const STEPS = ['model', 'design', 'quantity', 'delivery', 'review'] as const;
type Step = (typeof STEPS)[number];

/** Ce que le profil contient déjà : récupéré automatiquement pour préremplir la carte (rien n'est inventé). */
function useProfileDefaults() {
  const doc = useEditor((s) => s.doc);
  const user = useSession((s) => s.session?.user);
  return useMemo(() => {
    const profile = doc?.blocks.find((b) => b.type === 'profile');
    const d = profile?.type === 'profile' ? profile.data : null;
    return {
      username: doc?.username ?? '',
      published: doc?.status === 'published',
      loaded: Boolean(doc),
      name: d?.displayName || user?.name || '',
      title: d?.headline ?? '',
      organization: '',
      contact: d?.mobilePhone || d?.proPhone || d?.whatsappPhone || user?.phone || '',
      imageUrl: d?.avatarUrl ?? '',
      userName: user?.name ?? '',
      phone: d?.mobilePhone || user?.phone || '',
    };
  }, [doc, user]);
}

export function OrderWizard({ onOrdered }: { onOrdered: (order: CardOrder) => void }) {
  const t = useT('cards', 'common');
  const toast = useToast();
  const profile = useProfileDefaults();
  const catalog = useResource(() => api.cards.getCatalog(), []);
  const [step, setStep] = useState<Step>('model');
  const [reached, setReached] = useState(0);
  const [kind, setKind] = useState<CardKind>('qr');
  const [format, setFormat] = useState<'unit' | 'pack'>('unit');
  const [units, setUnits] = useState(1);
  const [design, setDesign] = useState<CardDesign>(() => defaultDesign('classic_white'));
  const [prefilled, setPrefilled] = useState(false);
  const [delivery, setDelivery] = useState<CardDelivery>({ fullName: '', phone: '', city: '', address: '', notes: '' });
  const [showErrors, setShowErrors] = useState(false);
  const [side, setSide] = useState<'front' | 'back'>('front');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Récupération automatique des informations du profil, une seule fois.
  useEffect(() => {
    if (prefilled || !profile.loaded) return;
    setPrefilled(true);
    setDesign((d) => ({ ...d, name: d.name || profile.name, title: d.title || profile.title, contact: d.contact || profile.contact, imageUrl: d.imageUrl || profile.imageUrl }));
    setDelivery((v) => ({ ...v, fullName: v.fullName || profile.userName, phone: v.phone || profile.phone }));
  }, [profile, prefilled]);

  const products: CardProduct[] = catalog.data?.products ?? [];
  const forKind = products.filter((p) => p.kind === kind);
  const unitProduct = forKind.find((p) => p.quantity === 1);
  const packProduct = forKind.find((p) => p.quantity > 1);
  const product = format === 'pack' ? packProduct ?? unitProduct : unitProduct ?? packProduct;
  const effectiveFormat = product && product.quantity > 1 ? 'pack' : 'unit';
  const price = product ? priceOrder(product, units) : null;
  const tooMany = price ? price.cardsCount > MAX_CARDS_PER_ORDER : false;
  const cheapest = (k: CardKind) => products.filter((p) => p.kind === k).sort((a, b) => a.price / a.quantity - b.price / b.quantity)[0];

  const url = profile.username ? pageShareUrl(profile.username) : '';
  const index = STEPS.indexOf(step);

  const designErrors = showErrors && !design.name.trim() ? { name: t('common.validation.required') } : undefined;
  const dErr = (k: keyof CardDelivery, min = 1) => (showErrors && delivery[k].trim().length < min ? t('common.validation.required') : undefined);
  const phoneErr = showErrors && delivery.phone.trim() && !isPhone(delivery.phone) ? t('common.validation.phone') : dErr('phone');
  const valid = {
    model: true,
    design: design.name.trim().length > 0,
    quantity: Boolean(product) && units >= 1 && units <= MAX_UNITS_PER_LINE && !tooMany,
    delivery: delivery.fullName.trim().length >= 2 && isPhone(delivery.phone) && delivery.city.trim().length >= 2 && delivery.address.trim().length >= 3,
    review: true,
  } satisfies Record<Step, boolean>;

  const go = (s: Step) => { setShowErrors(false); setStep(s); setReached((r) => Math.max(r, STEPS.indexOf(s))); };
  const next = () => {
    if (!valid[step]) { setShowErrors(true); return; }
    go(STEPS[Math.min(STEPS.length - 1, index + 1)]!);
  };

  const submit = async () => {
    if (!product) return;
    setBusy(true);
    setError(null);
    try {
      const order = await api.cards.createOrder({ productId: product.id, units, design, delivery });
      toast.push({ tone: 'success', title: t('cards.review.done') });
      onOrdered(order);
    } catch (e) {
      const code = isApiError(e) ? e.message : 'unknown';
      setError(['page_not_published', 'product_unavailable', 'subscription_required', 'rate_limited', 'too_many_cards'].includes(code) ? t(`cards.errors.${code as 'page_not_published'}`) : t('cards.errors.unknown'));
    } finally {
      setBusy(false);
    }
  };

  if (catalog.status === 'loading' || !profile.loaded) return <Skeleton height={420} radius={16} />;
  if (!profile.published || !profile.username) {
    return (
      <Alert tone="warning" title={t('cards.needPage.title')} action={<Link to={paths.dashboard.page}>{t('cards.needPage.cta')}</Link>}>
        {t('cards.needPage.text')}
      </Alert>
    );
  }
  if (!products.length) return <Alert tone="info" title={t('cards.noProducts.title')}>{t('cards.noProducts.text')}</Alert>;

  return (
    <div className="cardwiz">
      <div className="card cardwiz__main">
        <ol className="cardsteps" role="list" aria-label={t('cards.stepsLabel')}>
          {STEPS.map((s, i) => (
            <li key={s}>
              <button type="button" className={i < index ? 'is-done' : ''} aria-current={s === step ? 'step' : undefined} disabled={i > reached} onClick={() => go(s)}>
                <span className="cardsteps__n" aria-hidden="true">{i + 1}</span>{t(`cards.steps.${s}`)}
              </button>
            </li>
          ))}
        </ol>

        <div>
          <h2 className="cardwiz__title">{t(`cards.${step}.title`)}</h2>
          <p className="cardwiz__lead">{t(`cards.${step}.lead`)}</p>
        </div>

        {step === 'model' && (
          <>
            <fieldset className="kindpick">
              <legend className="sr-only">{t('cards.model.kindLegend')}</legend>
              {(['qr', 'nfc'] as const).map((k) => {
                const from = cheapest(k);
                return (
                  <label key={k} className="kindcard">
                    <input type="radio" name="kind" checked={kind === k} onChange={() => { setKind(k); setFormat('unit'); }} />
                    <strong>{t(`cards.kinds.${k}.label`)}{k === 'nfc' && <Badge tone="info">NFC</Badge>}</strong>
                    <small>{t(`cards.kinds.${k}.text`)}</small>
                    {from && <span className="kindcard__price">{t('cards.model.from', { price: formatCurrency(from.price / from.quantity, from.currency) })}</span>}
                  </label>
                );
              })}
            </fieldset>
            <ul className="tplgrid" role="list" aria-label={t('cards.model.templates')}>
              {CARD_TEMPLATE_IDS.map((id) => (
                <li key={id}>
                  <label className="tplcard">
                    <input type="radio" name="template" checked={design.templateId === id} onChange={() => setDesign((d) => withTemplate(d, id))} />
                    <CardTemplateThumb id={id} design={design} />
                    <span className="tplcard__name">{t(`cards.templates.${id}`)}</span>
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}

        {step === 'design' && (
          <>
            <div className="cardform__profile">
              <span>{t('cards.design.linkedProfile')}</span>
              <strong>{url.replace(/^https?:\/\//, '')}</strong>
              <Badge tone="success" dot>{t('cards.design.published')}</Badge>
            </div>
            <DesignFields design={design} onChange={(patch) => setDesign((d) => ({ ...d, ...patch }))} errors={designErrors} profileImage={profile.imageUrl} />
          </>
        )}

        {step === 'quantity' && (
          <>
            <div className="qtyformats" role="radiogroup" aria-label={t('cards.quantity.format')}>
              {unitProduct && (
                <label className="kindcard">
                  <input type="radio" name="format" checked={effectiveFormat === 'unit'} onChange={() => { setFormat('unit'); setUnits(1); }} />
                  <strong>{t('cards.quantity.unit')}</strong>
                  <small>{t('cards.quantity.unitText')}</small>
                  <span className="kindcard__price">{formatCurrency(unitProduct.price, unitProduct.currency)}</span>
                </label>
              )}
              {packProduct && (
                <label className="kindcard">
                  <input type="radio" name="format" checked={effectiveFormat === 'pack'} onChange={() => { setFormat('pack'); setUnits(1); }} />
                  <strong>{t('cards.quantity.pack', { n: packProduct.quantity })}</strong>
                  <small>{t('cards.quantity.packText', { each: formatCurrency(packProduct.price / packProduct.quantity, packProduct.currency) })}</small>
                  <span className="kindcard__price">{formatCurrency(packProduct.price, packProduct.currency)}</span>
                </label>
              )}
            </div>
            {product && (
              <>
                <div className="qty">
                  <Button variant="secondary" size="sm" aria-label={t('cards.quantity.less')} disabled={units <= 1} onClick={() => setUnits((u) => Math.max(1, u - 1))}>−</Button>
                  <Input aria-label={effectiveFormat === 'pack' ? t('cards.quantity.packsCount') : t('cards.quantity.cardsCount')} type="number" min={1} max={MAX_UNITS_PER_LINE} inputMode="numeric" value={units}
                    onChange={(e) => setUnits(Math.min(MAX_UNITS_PER_LINE, Math.max(1, Math.floor(Number(e.target.value)) || 1)))} />
                  <Button variant="secondary" size="sm" aria-label={t('cards.quantity.more')} disabled={units >= MAX_UNITS_PER_LINE} onClick={() => setUnits((u) => Math.min(MAX_UNITS_PER_LINE, u + 1))}>+</Button>
                  <span className="subtle">{effectiveFormat === 'pack' ? t('cards.quantity.packsUnit') : t('cards.quantity.cardsUnit')}</span>
                </div>
                <div className="pricebox" aria-live="polite">
                  <div className="pricebox__row"><span>{t('cards.quantity.cards')}</span><strong>{price!.cardsCount}</strong></div>
                  <div className="pricebox__row"><span>{t('cards.quantity.unitPrice')}</span><span>{formatCurrency(product.price, product.currency)}</span></div>
                  <div className="pricebox__row pricebox__total"><span>{t('cards.quantity.total')}</span><span>{formatCurrency(price!.total, product.currency)}</span></div>
                </div>
                {tooMany && <p className="field__error" role="alert">{t('cards.errors.too_many_cards', { max: MAX_CARDS_PER_ORDER })}</p>}
              </>
            )}
          </>
        )}

        {step === 'delivery' && (
          <div className="cardform">
            <div className="cardform__row">
              <Input label={t('cards.delivery.fullName')} value={delivery.fullName} required autoComplete="name" maxLength={80} onChange={(e) => setDelivery({ ...delivery, fullName: e.target.value })} error={dErr('fullName', 2)} />
              <Input label={t('cards.delivery.phone')} hint={t('cards.delivery.phoneHint')} value={delivery.phone} required type="tel" inputMode="tel" autoComplete="tel" maxLength={40} onChange={(e) => setDelivery({ ...delivery, phone: e.target.value })} error={phoneErr} />
            </div>
            <div className="cardform__row">
              <Input label={t('cards.delivery.city')} value={delivery.city} required autoComplete="address-level2" maxLength={60} onChange={(e) => setDelivery({ ...delivery, city: e.target.value })} error={dErr('city', 2)} />
              <Input label={t('cards.delivery.address')} hint={t('cards.delivery.addressHint')} value={delivery.address} required autoComplete="street-address" maxLength={200} onChange={(e) => setDelivery({ ...delivery, address: e.target.value })} error={dErr('address', 3)} />
            </div>
            <Textarea label={t('cards.delivery.notes')} optionalLabel={t('common.optional')} value={delivery.notes} rows={2} maxLength={300} onChange={(e) => setDelivery({ ...delivery, notes: e.target.value })} />
            <Alert tone="info">{t('cards.delivery.zone')}</Alert>
          </div>
        )}

        {step === 'review' && product && price && (
          <>
            <dl className="recap">
              <div><dt>{t('cards.review.product')}</dt><dd>{t(`cards.kinds.${product.kind}.label`)} · {t(`cards.templates.${design.templateId}`)}</dd></div>
              <div><dt>{t('cards.review.profile')}</dt><dd>{url.replace(/^https?:\/\//, '')}</dd></div>
              <div><dt>{t('cards.review.cards')}</dt><dd>{price.cardsCount}</dd></div>
              <div><dt>{t('cards.review.delivery')}</dt><dd>{delivery.fullName} · {delivery.phone}<br />{delivery.address}, {delivery.city}</dd></div>
              <div><dt>{t('cards.quantity.total')}</dt><dd className="pricebox__total">{formatCurrency(price.total, product.currency)}</dd></div>
            </dl>
            <Alert tone="info" title={t('cards.review.paymentTitle')}>{t('cards.review.paymentText')}</Alert>
            {error && <Alert tone="danger">{error}</Alert>}
          </>
        )}

        <div className="cardwiz__nav">
          <Button variant="ghost" iconLeft="arrow-left" disabled={index === 0 || busy} onClick={() => go(STEPS[index - 1]!)}>{t('common.back')}</Button>
          {step === 'review'
            ? <Button variant="gradient" iconRight="check" loading={busy} onClick={() => void submit()}>{t('cards.review.order')}</Button>
            : <Button variant="gradient" iconRight="arrow-right" onClick={next}>{t('common.continue')}</Button>}
        </div>
      </div>

      <aside className="card cardwiz__preview" aria-label={t('cards.preview.title')}>
        <CardPreview design={design} url={url} nfc={kind === 'nfc'} side={side} onSide={setSide} />
        <p className="cardwiz__note">{t('cards.preview.note')}</p>
      </aside>
    </div>
  );
}

/** Miniature d'un modèle, rendue avec le contenu courant de la carte. */
function CardTemplateThumb({ id, design }: { id: CardTemplateId; design: CardDesign }) {
  const t = useT('cards');
  const preview: CardDesign = { ...design, templateId: id, accent: CARD_TEMPLATES[id].accents.includes(design.accent) ? design.accent : CARD_TEMPLATES[id].accents[0]! };
  return <CardFace design={preview} side="front" url="" nfc={false} qr={null} label={t(`cards.templates.${id}`)} />;
}
