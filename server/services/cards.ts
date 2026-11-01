/**
 * 1Link Cards — commandes de cartes de visite physiques.
 *  - Le serveur recalcule TOUT (prix, nombre de cartes, statuts) : le client ne fait que proposer.
 *  - Aucun paiement n'est traité par la plateforme : le client règle selon la consigne de l'équipe (Mobile Money, virement…)
 *    et c'est l'équipe qui ENREGISTRE le paiement reçu. Rien n'est jamais « payé » sans cet enregistrement.
 *  - Une commande n'entre en production qu'après paiement confirmé ET visuel validé ET partenaire d'impression renseigné.
 *  - Chaque carte reçoit un code public définitif : le QR code et la puce NFC ne contiennent que `<domaine>/c/<code>`.
 */
import { randomInt } from 'node:crypto';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { AuthContext, C, Deps } from '../context.js';
import { cardOrders, cardProducts, cardSettings, cards, pages, users } from '../db/schema.js';
import { audit } from '../lib/audit.js';
import { newId } from '../lib/crypto.js';
import { badRequest, conflict, forbidden, HttpError, notFound } from '../lib/errors.js';
import { runList, type ListSpec } from '../lib/lists.js';
import { enforce, keyFor } from '../lib/ratelimit.js';
import type { ListQuery } from '../../src/models/api.js';
import {
  CARD_CODE_ALPHABET, CARD_CODE_LENGTH, CARD_CODE_RE, CARD_STATUS_FLOW, MAX_CARDS_PER_ORDER, cardUrl, priceOrder,
  type AdminCardOrder, type AdminCardOrderRow, type CardCatalog, type CardDelivery, type CardDesign, type CardItem, type CardKind, type CardOrder,
  type CardOrderEvent, type CardOrderStatus, type CardProduct, type CardProductId, type NfcTestResult,
} from '../../src/models/cards.js';
import { assertNotLocked } from './access.js';
import { uniqueViolation } from './accounts.js';

type OrderRow = typeof cardOrders.$inferSelect;
type CardRow = typeof cards.$inferSelect;

const PAYMENT_KEY = 'payment_instructions';
const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);
const pick = (alphabet: string, n: number) => Array.from({ length: n }, () => alphabet[randomInt(0, alphabet.length)]).join('');
export const newCardCode = () => pick(CARD_CODE_ALPHABET, CARD_CODE_LENGTH);
const newReference = () => `CRT-${pick('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 6)}`;

const productOf = (r: typeof cardProducts.$inferSelect): CardProduct => ({ id: r.id as CardProductId, kind: r.kind as CardKind, quantity: r.quantity, price: r.price, currency: r.currency, active: r.active });

function cardOf(base: string, r: CardRow): CardItem {
  return {
    id: r.id, code: r.code, url: cardUrl(base, r.code), kind: r.kind as CardKind, status: r.status as CardItem['status'], disabledBy: r.disabledBy as CardItem['disabledBy'],
    scanCount: r.scanCount, lastScannedAt: iso(r.lastScannedAt),
    nfc: r.kind === 'nfc' ? { chipId: r.nfcChipId, programmedUrl: r.nfcProgrammedUrl, result: r.nfcResult as NfcTestResult, programmedAt: iso(r.nfcProgrammedAt) } : null,
  };
}

function orderOf(base: string, r: OrderRow, items: CardRow[], username: string | null): CardOrder {
  return {
    id: r.id, reference: r.reference, status: r.status as CardOrderStatus, productId: r.productId as CardProductId, kind: r.kind as CardKind, units: r.units, cardsCount: r.cardsCount,
    unitPrice: r.unitPrice, total: r.total, currency: r.currency, design: r.design, delivery: r.delivery, username,
    payment: r.paidAt ? { method: r.paymentMethod ?? '', reference: r.paymentRef ?? '', paidAt: r.paidAt.toISOString() } : null,
    designApprovedAt: iso(r.designApprovedAt), designNote: r.designNote, printPartner: r.printPartner, partnerRef: r.partnerRef,
    shipping: { carrier: r.carrier, trackingRef: r.trackingRef, shippedAt: iso(r.shippedAt), deliveredAt: iso(r.deliveredAt) },
    cards: items.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.code.localeCompare(b.code)).map((c) => cardOf(base, c)),
    history: r.history as CardOrderEvent[], createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
  };
}

const event = (actor: string, text: string, now: Date): CardOrderEvent => ({ at: now.toISOString(), event: text, actor });

// — Catalogue —

async function paymentInstructions(deps: Deps): Promise<string> {
  const [row] = await deps.db.select().from(cardSettings).where(eq(cardSettings.key, PAYMENT_KEY)).limit(1);
  return row?.value ?? '';
}

export async function getCatalog(deps: Deps): Promise<CardCatalog> {
  const rows = await deps.db.select().from(cardProducts).where(eq(cardProducts.active, true));
  const order = ['qr_basic', 'nfc_premium', 'qr_pack10', 'nfc_pack10'];
  return { products: rows.map(productOf).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)), paymentInstructions: await paymentInstructions(deps) };
}

// — Commandes (client) —

async function ownerPage(deps: Deps, userId: string) {
  const [page] = await deps.db.select().from(pages).where(eq(pages.userId, userId)).limit(1);
  // Les cartes pointent vers le profil public : il doit exister et être en ligne.
  if (!page || !page.username || page.status !== 'published' || !page.published) throw conflict('page_not_published');
  return page;
}

export interface NewOrder { productId: CardProductId; units: number; design: CardDesign; delivery: CardDelivery }

export async function createOrder(c: C, deps: Deps, auth: AuthContext, input: NewOrder): Promise<CardOrder> {
  assertNotLocked(auth.access);
  const now = deps.now();
  await enforce(deps.db, keyFor('card-order', auth.user.id), 10, 86_400, now);
  const page = await ownerPage(deps, auth.user.id);
  const [product] = await deps.db.select().from(cardProducts).where(eq(cardProducts.id, input.productId)).limit(1);
  if (!product || !product.active) throw conflict('product_unavailable');
  const { cardsCount, total } = priceOrder(product, input.units);
  if (cardsCount > MAX_CARDS_PER_ORDER) throw badRequest('too_many_cards', { units: 'too_many' });

  const base = deps.config.publicUrl;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const id = newId('cdo');
      const row = await deps.db.transaction(async (tx) => {
        const [created] = await tx
          .insert(cardOrders)
          .values({
            id, reference: newReference(), userId: auth.user.id, pageId: page.id, productId: product.id, kind: product.kind, units: input.units, cardsCount, unitPrice: product.price, total, currency: product.currency,
            design: input.design, delivery: input.delivery, history: [event(auth.user.name, 'Commande passée', now)],
          })
          .returning();
        // Un code public unique par carte, définitif : en cas (très improbable) de collision, on retire un autre code.
        const inserted: CardRow[] = [];
        while (inserted.length < cardsCount) {
          const batch = Array.from({ length: cardsCount - inserted.length }, () => ({ id: newId('crd'), code: newCardCode(), orderId: id, userId: auth.user.id, pageId: page.id, kind: product.kind }));
          inserted.push(...(await tx.insert(cards).values(batch).onConflictDoNothing({ target: cards.code }).returning()));
        }
        await audit(tx, { actorId: auth.user.id, actorLabel: auth.user.name, action: `Commande de cartes ${created!.reference}`, target: id, ip: c.get('ip') }, now);
        return { order: created!, items: inserted };
      });
      return orderOf(base, row.order, row.items, page.username);
    } catch (e) {
      if (!uniqueViolation(e)?.includes('reference')) throw e; // seule une collision de référence justifie un nouvel essai
    }
  }
  throw new HttpError(500, 'server_error');
}

async function loadOrders(deps: Deps, rows: OrderRow[]): Promise<CardOrder[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [items, owners] = await Promise.all([
    deps.db.select().from(cards).where(inArray(cards.orderId, ids)),
    deps.db.select({ id: pages.id, username: pages.username }).from(pages).where(inArray(pages.id, rows.map((r) => r.pageId))),
  ]);
  const names = new Map(owners.map((o) => [o.id, o.username]));
  return rows.map((r) => orderOf(deps.config.publicUrl, r, items.filter((i) => i.orderId === r.id), names.get(r.pageId) ?? null));
}

export async function listMyOrders(deps: Deps, userId: string): Promise<CardOrder[]> {
  const rows = await deps.db.select().from(cardOrders).where(eq(cardOrders.userId, userId)).orderBy(desc(cardOrders.createdAt)).limit(50);
  return loadOrders(deps, rows);
}

async function myOrder(deps: Deps, userId: string, id: string): Promise<OrderRow> {
  const [row] = await deps.db.select().from(cardOrders).where(and(eq(cardOrders.id, id), eq(cardOrders.userId, userId))).limit(1);
  if (!row) throw notFound('order');
  return row;
}

export async function cancelMyOrder(c: C, deps: Deps, auth: AuthContext, id: string): Promise<CardOrder> {
  const now = deps.now();
  await deps.db.transaction(async (tx) => {
    const [row] = await tx.select().from(cardOrders).where(and(eq(cardOrders.id, id), eq(cardOrders.userId, auth.user.id))).for('update').limit(1);
    if (!row) throw notFound('order');
    // Après paiement, l'annulation passe par l'équipe (remboursement éventuel à traiter à la main).
    if (row.status !== 'awaiting_payment') throw conflict('cannot_cancel');
    await tx.update(cardOrders).set({ status: 'canceled', history: [...row.history, event(auth.user.name, 'Commande annulée par le client', now)], updatedAt: now }).where(eq(cardOrders.id, id));
    await tx.update(cards).set({ status: 'disabled', disabledBy: 'admin' }).where(eq(cards.orderId, id));
    await audit(tx, { actorId: auth.user.id, actorLabel: auth.user.name, action: `Commande de cartes ${row.reference} annulée`, target: id, ip: c.get('ip') }, now);
  });
  return (await loadOrders(deps, [await myOrder(deps, auth.user.id, id)]))[0]!;
}

/** Le client peut corriger son visuel tant qu'il n'est pas validé ; toute correction annule une éventuelle validation précédente. */
export async function updateMyDesign(deps: Deps, auth: AuthContext, id: string, design: CardDesign): Promise<CardOrder> {
  const now = deps.now();
  await deps.db.transaction(async (tx) => {
    const [row] = await tx.select().from(cardOrders).where(and(eq(cardOrders.id, id), eq(cardOrders.userId, auth.user.id))).for('update').limit(1);
    if (!row) throw notFound('order');
    if (!['awaiting_payment', 'paid', 'validating'].includes(row.status)) throw conflict('design_locked');
    await tx
      .update(cardOrders)
      .set({ design, designApprovedAt: null, history: [...row.history, event(auth.user.name, 'Visuel modifié par le client', now)], updatedAt: now })
      .where(eq(cardOrders.id, id));
  });
  return (await loadOrders(deps, [await myOrder(deps, auth.user.id, id)]))[0]!;
}

/** Perte ou vol : le propriétaire désactive sa carte (le lien cesse aussitôt de fonctionner) et peut la réactiver, sauf si l'équipe l'a désactivée. */
export async function setMyCardActive(c: C, deps: Deps, auth: AuthContext, cardId: string, active: boolean): Promise<CardItem> {
  const now = deps.now();
  const [row] = await deps.db.select().from(cards).where(and(eq(cards.id, cardId), eq(cards.userId, auth.user.id))).limit(1);
  if (!row) throw notFound('card');
  if (row.status === 'disabled' && row.disabledBy === 'admin') throw forbidden('disabled_by_admin');
  const [order] = await deps.db.select({ status: cardOrders.status }).from(cardOrders).where(eq(cardOrders.id, row.orderId)).limit(1);
  if (order?.status === 'canceled') throw conflict('order_canceled');
  const [updated] = await deps.db.update(cards).set(active ? { status: 'active', disabledBy: null } : { status: 'disabled', disabledBy: 'owner' }).where(eq(cards.id, cardId)).returning();
  await audit(deps.db, { actorId: auth.user.id, actorLabel: auth.user.name, action: active ? 'Carte réactivée' : 'Carte désactivée par son propriétaire', target: row.code, ip: c.get('ip'), level: active ? 'info' : 'warning' }, now);
  return cardOf(deps.config.publicUrl, updated!);
}

// — Résolution publique (QR code et puce NFC) —

export type CardResolution = { state: 'active'; username: string } | { state: 'disabled' } | { state: 'unavailable' } | { state: 'not_found' };

/**
 * Où mène une carte. Sans compte ni application : le visiteur ouvre simplement l'adresse. Le code reste valable même si le
 * propriétaire change de pseudonyme ou de contenu, puisque seul l'identifiant de la carte est écrit dans le QR code et la puce.
 */
export async function resolveCard(deps: Deps, code: string, countScan: boolean): Promise<CardResolution> {
  const value = code.toLowerCase();
  if (!CARD_CODE_RE.test(value)) return { state: 'not_found' };
  const res = await deps.db.execute<{ id: string; status: string; ostatus: string; username: string | null; pstatus: string; ustatus: string }>(sql`
    select c.id, c.status, o.status as ostatus, p.username, p.status as pstatus, u.status as ustatus
    from cards c join card_orders o on o.id = c.order_id join pages p on p.id = c.page_id join users u on u.id = c.user_id
    where c.code = ${value} limit 1`);
  const r = res.rows[0];
  if (!r) return { state: 'not_found' };
  if (r.status !== 'active' || r.ostatus === 'canceled') return { state: 'disabled' };
  if (!r.username || r.pstatus !== 'published' || r.ustatus !== 'active') return { state: 'unavailable' };
  if (countScan) {
    deps.defer(deps.db.update(cards).set({ scanCount: sql`${cards.scanCount} + 1`, lastScannedAt: deps.now() }).where(eq(cards.id, r.id)).then(() => undefined).catch(() => undefined));
  }
  return { state: 'active', username: r.username };
}

// — Administration —

const ORDER_STATUS_SQL = sql`o.status`;
const ordersSpec: ListSpec = {
  from: sql`card_orders o join users u on u.id = o.user_id left join pages p on p.id = o.page_id`,
  select: sql`o.id, o.reference, u.name as customer, p.username, o.kind, o.cards_count, o.total, o.currency, o.status, o.created_at`,
  searchColumns: [sql`o.reference`, sql`u.name`, sql`p.username`, sql`u.email`, sql`o.print_partner`],
  filters: { status: ORDER_STATUS_SQL, kind: sql`o.kind` },
  sorts: { reference: sql`o.reference`, customer: sql`u.name`, kind: sql`o.kind`, cardsCount: sql`o.cards_count`, total: sql`o.total`, status: ORDER_STATUS_SQL, createdAt: sql`o.created_at` },
  defaultSort: 'createdAt', defaultDir: 'desc', tiebreak: sql`o.id`,
};

export async function adminListOrders(deps: Deps, q: ListQuery) {
  const res = await runList<Record<string, unknown>>(deps.db, ordersSpec, q);
  const items: AdminCardOrderRow[] = res.rows.map((r) => ({
    id: r.id as string, reference: r.reference as string, customer: r.customer as string, username: (r.username as string | null) ?? null, kind: r.kind as CardKind,
    cardsCount: r.cards_count as number, total: r.total as number, currency: r.currency as string, status: r.status as CardOrderStatus, createdAt: iso(r.created_at as string)!,
  }));
  return { items, total: res.total, page: res.page, pageSize: res.pageSize };
}

async function adminOrderRow(deps: Deps, id: string): Promise<OrderRow> {
  const [row] = await deps.db.select().from(cardOrders).where(eq(cardOrders.id, id)).limit(1);
  if (!row) throw notFound('order');
  return row;
}

export async function adminGetOrder(deps: Deps, id: string): Promise<AdminCardOrder> {
  const row = await adminOrderRow(deps, id);
  const [order] = await loadOrders(deps, [row]);
  const [u] = await deps.db.select({ id: users.id, name: users.name, email: users.email, phone: users.phone }).from(users).where(eq(users.id, row.userId)).limit(1);
  return { ...order!, customer: u ?? { id: row.userId, name: '—', email: null, phone: null } };
}

/** Applique une modification à une commande verrouillée, ajoute une ligne à l'historique et journalise l'action. */
async function mutate(c: C, deps: Deps, actor: AuthContext, id: string, label: string, fn: (row: OrderRow, tx: Parameters<Parameters<Deps['db']['transaction']>[0]>[0], now: Date) => Promise<Partial<typeof cardOrders.$inferInsert>>): Promise<AdminCardOrder> {
  const now = deps.now();
  await deps.db.transaction(async (tx) => {
    const [row] = await tx.select().from(cardOrders).where(eq(cardOrders.id, id)).for('update').limit(1);
    if (!row) throw notFound('order');
    const patch = await fn(row, tx, now);
    await tx.update(cardOrders).set({ ...patch, history: [...row.history, event(actor.user.name, label, now)], updatedAt: now }).where(eq(cardOrders.id, id));
    await audit(tx, { actorId: actor.user.id, actorLabel: actor.user.name, action: `Cartes ${row.reference} : ${label}`, target: id, ip: c.get('ip') }, now);
  });
  return adminGetOrder(deps, id);
}

/** Enregistre un paiement REÇU par l'équipe (Mobile Money, virement, espèces). C'est la seule porte vers « Payée ». */
export function recordPayment(c: C, deps: Deps, actor: AuthContext, id: string, input: { method: string; reference: string }) {
  return mutate(c, deps, actor, id, `Paiement enregistré (${input.method} · ${input.reference})`, async (row, _tx, now) => {
    if (row.status !== 'awaiting_payment') throw conflict('not_awaiting_payment');
    return { status: 'paid', paymentMethod: input.method, paymentRef: input.reference, paidAt: now };
  });
}

export function reviewDesign(c: C, deps: Deps, actor: AuthContext, id: string, input: { approved: boolean; note: string }) {
  return mutate(c, deps, actor, id, input.approved ? 'Visuel validé' : `Visuel refusé${input.note ? ` — ${input.note}` : ''}`, async (row, _tx, now) => {
    if (!['paid', 'validating'].includes(row.status)) throw conflict('design_review_closed');
    if (!input.approved && !input.note) throw badRequest('note_required', { note: 'required' });
    return { designApprovedAt: input.approved ? now : null, designNote: input.note };
  });
}

export function setProduction(c: C, deps: Deps, actor: AuthContext, id: string, input: { printPartner: string; partnerRef: string }) {
  return mutate(c, deps, actor, id, `Partenaire d'impression : ${input.printPartner || '—'}`, async (row) => {
    if (['awaiting_payment', 'delivered', 'canceled'].includes(row.status)) throw conflict('production_closed');
    return { printPartner: input.printPartner, partnerRef: input.partnerRef };
  });
}

const STATUS_LABEL: Record<CardOrderStatus, string> = {
  awaiting_payment: 'En attente de paiement', paid: 'Payée', validating: 'En validation', in_production: 'En production', quality_check: 'En contrôle', shipped: 'Expédiée', delivered: 'Livrée', canceled: 'Annulée',
};

export function changeStatus(c: C, deps: Deps, actor: AuthContext, id: string, input: { status: CardOrderStatus; note: string; carrier: string; trackingRef: string }) {
  return mutate(c, deps, actor, id, `Statut : ${STATUS_LABEL[input.status]}${input.note ? ` — ${input.note}` : ''}`, async (row, tx, now) => {
    const from = row.status as CardOrderStatus;
    if (!CARD_STATUS_FLOW[from].includes(input.status)) throw conflict('invalid_transition');
    const patch: Partial<typeof cardOrders.$inferInsert> = { status: input.status };
    if (input.status === 'in_production' && from !== 'quality_check') {
      // Jamais de production sans argent reçu, sans visuel validé ni imprimeur désigné.
      if (!row.paidAt) throw conflict('payment_required');
      if (!row.designApprovedAt) throw conflict('design_not_approved');
      if (!row.printPartner.trim()) throw conflict('partner_required');
    }
    if (input.status === 'shipped') {
      if (row.kind === 'nfc') {
        const items = await tx.select().from(cards).where(eq(cards.orderId, row.id));
        const expected = (code: string) => cardUrl(deps.config.publicUrl, code);
        if (items.some((i) => i.nfcResult !== 'passed' || i.nfcProgrammedUrl !== expected(i.code))) throw conflict('nfc_not_tested');
      }
      patch.shippedAt = now;
      patch.carrier = input.carrier;
      patch.trackingRef = input.trackingRef;
    }
    if (input.status === 'delivered') patch.deliveredAt = now;
    if (input.status === 'canceled') await tx.update(cards).set({ status: 'disabled', disabledBy: 'admin' }).where(eq(cards.orderId, row.id));
    return patch;
  });
}

/** Programmation et test de la puce NFC (manuels, par l'équipe ou le partenaire) : on enregistre ce qui a été fait, rien n'est simulé. */
export async function recordNfc(c: C, deps: Deps, actor: AuthContext, cardId: string, input: { chipId: string; programmedUrl: string; result: NfcTestResult }): Promise<AdminCardOrder> {
  const now = deps.now();
  const [card] = await deps.db.select().from(cards).where(eq(cards.id, cardId)).limit(1);
  if (!card) throw notFound('card');
  if (card.kind !== 'nfc') throw conflict('not_nfc');
  const [order] = await deps.db.select().from(cardOrders).where(eq(cardOrders.id, card.orderId)).limit(1);
  if (!order || !['in_production', 'quality_check'].includes(order.status)) throw conflict('nfc_closed');
  const expected = cardUrl(deps.config.publicUrl, card.code);
  // Ce qui est écrit dans la puce doit être exactement l'adresse publique de la carte (et rien d'autre).
  if (input.programmedUrl && input.programmedUrl !== expected) throw badRequest('nfc_url_mismatch', { programmedUrl: 'mismatch' });
  if (input.result === 'passed' && (!input.chipId || input.programmedUrl !== expected)) throw badRequest('nfc_incomplete', { chipId: 'required' });
  await deps.db.transaction(async (tx) => {
    await tx
      .update(cards)
      .set({ nfcChipId: input.chipId, nfcProgrammedUrl: input.programmedUrl, nfcResult: input.result, nfcProgrammedAt: input.programmedUrl ? now : null })
      .where(eq(cards.id, cardId));
    await audit(tx, { actorId: actor.user.id, actorLabel: actor.user.name, action: `NFC ${card.code} : test ${input.result}`, target: order.id, ip: c.get('ip') }, now);
  });
  return adminGetOrder(deps, order.id);
}

export async function adminSetCardActive(c: C, deps: Deps, actor: AuthContext, cardId: string, active: boolean): Promise<AdminCardOrder> {
  const now = deps.now();
  const [card] = await deps.db.select().from(cards).where(eq(cards.id, cardId)).limit(1);
  if (!card) throw notFound('card');
  await deps.db.update(cards).set(active ? { status: 'active', disabledBy: null } : { status: 'disabled', disabledBy: 'admin' }).where(eq(cards.id, cardId));
  await audit(deps.db, { actorId: actor.user.id, actorLabel: actor.user.name, action: active ? 'Carte réactivée par l’équipe' : 'Carte désactivée par l’équipe', target: card.code, ip: c.get('ip'), level: active ? 'info' : 'warning' }, now);
  return adminGetOrder(deps, card.orderId);
}

export async function adminProducts(deps: Deps): Promise<{ products: CardProduct[]; paymentInstructions: string }> {
  const rows = await deps.db.select().from(cardProducts);
  const order = ['qr_basic', 'nfc_premium', 'qr_pack10', 'nfc_pack10'];
  return { products: rows.map(productOf).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)), paymentInstructions: await paymentInstructions(deps) };
}

export async function updateProduct(c: C, deps: Deps, actor: AuthContext, id: string, patch: { price?: number; active?: boolean }) {
  const now = deps.now();
  const [updated] = await deps.db.update(cardProducts).set({ ...patch, updatedAt: now }).where(eq(cardProducts.id, id)).returning();
  if (!updated) throw notFound('product');
  await audit(deps.db, { actorId: actor.user.id, actorLabel: actor.user.name, action: `Tarif ${id} modifié`, target: id, ip: c.get('ip') }, now);
  return adminProducts(deps);
}

export async function setPaymentInstructions(c: C, deps: Deps, actor: AuthContext, value: string) {
  const now = deps.now();
  await deps.db.insert(cardSettings).values({ key: PAYMENT_KEY, value, updatedAt: now }).onConflictDoUpdate({ target: cardSettings.key, set: { value, updatedAt: now } });
  await audit(deps.db, { actorId: actor.user.id, actorLabel: actor.user.name, action: 'Consigne de paiement des cartes modifiée', target: PAYMENT_KEY, ip: c.get('ip') }, now);
  return adminProducts(deps);
}
