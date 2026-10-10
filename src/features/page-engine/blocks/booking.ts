import { whatsappHref } from './urls';

export const BOOKING_SLOTS = ['any', 'morning', 'afternoon', 'evening'] as const;
export type BookingSlot = (typeof BOOKING_SLOTS)[number];

export interface BookingRequest {
  name: string;
  service: string;
  /** Date souhaitée au format YYYY-MM-DD, ou vide. */
  date: string;
  slot: BookingSlot;
  message: string;
}

export type BookingErrors = Partial<Record<'name' | 'date' | 'message', 'required' | 'past' | 'too_long'>>;

/** Validation : nom obligatoire, date non passée (comparée à `today`, YYYY-MM-DD), message ≤ 400 caractères. */
export function validateBooking(r: BookingRequest, today: string): BookingErrors {
  const errors: BookingErrors = {};
  if (!r.name.trim()) errors.name = 'required';
  if (r.date && r.date < today) errors.date = 'past';
  if (r.message.length > 400) errors.message = 'too_long';
  return errors;
}

export const todayLocal = (now = new Date()) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

interface MessageLabels {
  intro: (p: { name: string }) => string;
  service: (s: string) => string;
  date: (d: string) => string;
  slot: (s: BookingSlot) => string;
  note: (m: string) => string;
}

/** Compose le message WhatsApp envoyé au professionnel. Aucun serveur n'est impliqué : le visiteur envoie lui-même le message. */
export function buildBookingMessage(r: BookingRequest, l: MessageLabels): string {
  const lines = [l.intro({ name: r.name.trim() })];
  if (r.service) lines.push(l.service(r.service));
  if (r.date) lines.push(l.date(r.date));
  if (r.slot !== 'any') lines.push(l.slot(r.slot));
  if (r.message.trim()) lines.push(l.note(r.message.trim()));
  return lines.join('\n');
}

export const bookingHref = (phone: string, message: string) => whatsappHref(phone, message);
