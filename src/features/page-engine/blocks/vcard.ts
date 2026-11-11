import type { VcardData } from '@/models/blocks';

/** Caractères de contrôle (sauf \t \n \r) : jamais écrits dans le fichier. */
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/**
 * Échappement vCard (RFC 6350 §3.4) : antislash, TOUS les sauts de ligne (\r\n, \r et \n : un saut de ligne non échappé
 * permettrait d'ajouter des propriétés, voire une seconde fiche), point-virgule, virgule.
 */
const esc = (v: string) => v.replace(CONTROL, '').replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');

/** Adresse de site : uniquement http(s), sans espace ni caractère de contrôle (jamais de saut de ligne dans une ligne `URL:`). */
const siteUrl = (v: string): string => {
  const clean = v.replace(/[\u0000-\u0020\u007F]/g, '');
  return /^https?:\/\/[^/]/i.test(clean) ? clean : '';
};

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
    siteUrl(d.website) && `URL:${siteUrl(d.website)}`,
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
