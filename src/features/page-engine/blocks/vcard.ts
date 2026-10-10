import type { VcardData } from '@/models/blocks';

/** Échappement vCard (RFC 6350 §3.4) : antislash, saut de ligne, point-virgule, virgule. */
const esc = (v: string) => v.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');

/** Plie une ligne à 75 caractères (RFC 6350 §3.2) : les continuations commencent par une espace. */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const parts = [line.slice(0, 75)];
  for (let i = 75; i < line.length; i += 74) parts.push(` ${line.slice(i, i + 74)}`);
  return parts.join('\r\n');
}

/** Construit une carte de contact vCard 3.0 (compatible Android, iOS, Outlook). Aucune donnée n'est envoyée nulle part. */
export function buildVCard(d: VcardData): string {
  const name = d.fullName.trim();
  const parts = name.split(/\s+/);
  const family = parts.length > 1 ? parts[parts.length - 1]! : '';
  const given = parts.length > 1 ? parts.slice(0, -1).join(' ') : name;
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${esc(family)};${esc(given)};;;`,
    `FN:${esc(name)}`,
    d.organization.trim() && `ORG:${esc(d.organization.trim())}`,
    d.jobTitle.trim() && `TITLE:${esc(d.jobTitle.trim())}`,
    d.phone.trim() && `TEL;TYPE=CELL,VOICE:${d.phone.replace(/[^\d+]/g, '')}`,
    d.email.trim() && `EMAIL;TYPE=INTERNET:${esc(d.email.trim())}`,
    d.website.trim() && `URL:${d.website.trim()}`,
    d.address.trim() && `ADR;TYPE=WORK:;;${esc(d.address.trim())};;;;`,
    d.note.trim() && `NOTE:${esc(d.note.trim())}`,
    'END:VCARD',
  ].filter(Boolean) as string[];
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export const vcardFileName = (d: VcardData) => `${slug(d.fullName) || 'contact'}.vcf`;
