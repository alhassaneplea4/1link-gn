import { describe, expect, it } from 'vitest';
import { contrastLevel, contrastRatio, isHex, normalizeHex, readableOn, mix } from './color';
import { isEmail, isLink, isPhone, isUrl, RESERVED_USERNAMES, slugifyUsername, validateUsername } from './validation';
import { formatCurrency, formatNumber } from './format';
import { move } from './misc';

describe('color', () => {
  it('valide et normalise le HEX', () => {
    expect(isHex('#2563EB')).toBe(true);
    expect(isHex('#abc')).toBe(true);
    expect(isHex('2563eb')).toBe(false);
    expect(normalizeHex('ABC')).toBe('#aabbcc');
    expect(normalizeHex('#12345')).toBeNull();
  });
  it('calcule le contraste WCAG', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    expect(contrastLevel(21)).toBe('AAA');
    expect(contrastLevel(4.6)).toBe('AA');
    expect(contrastLevel(3.2)).toBe('AA-large');
    expect(contrastLevel(2)).toBe('fail');
  });
  it('choisit un texte lisible', () => {
    expect(readableOn('#111827')).toBe('#ffffff');
    expect(readableOn('#ffffff')).toBe('#111827');
    expect(contrastRatio(readableOn('#2563eb'), '#2563eb')).toBeGreaterThan(4.5);
  });
  it('mélange deux couleurs', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
  });
});

describe('validation', () => {
  it('valide e-mails, URL, liens et téléphones', () => {
    expect(isEmail('a@b.co')).toBe(true);
    expect(isEmail('a@b')).toBe(false);
    expect(isUrl('https://exemple.com')).toBe(true);
    expect(isUrl('javascript:alert(1)')).toBe(false);
    expect(isLink('mailto:a@b.co')).toBe(true);
    expect(isLink('tel:+224600000000')).toBe(true);
    expect(isLink('javascript:alert(1)')).toBe(false);
    expect(isLink('data:text/html,<script>')).toBe(false);
    expect(isPhone('+224 600 00 00 00')).toBe(true);
    expect(isPhone('abc')).toBe(false);
  });
  it('contrôle les pseudonymes et les routes réservées', () => {
    expect(validateUsername('mariama')).toBeNull();
    expect(validateUsername('')).toBe('common.validation.required');
    expect(validateUsername('A!')).toBe('common.validation.usernameFormat');
    for (const reserved of ['admin', 'dashboard', 'auth', 'pricing', 'faq', 'features', 'onboarding']) {
      expect(RESERVED_USERNAMES.has(reserved)).toBe(true);
      expect(validateUsername(reserved)).toBe('common.validation.usernameReserved');
    }
  });
  it('slugifie un nom', () => {
    expect(slugifyUsername('Aïssatou Diallo')).toBe('aissatoudiallo');
  });
});

describe('format & utils', () => {
  it('formate montants et nombres sans espaces fines insécables', () => {
    expect(formatCurrency(49000, 'GNF')).not.toMatch(/[ ]/);
    expect(formatCurrency(49000, 'GNF')).toContain('49');
    expect(formatNumber(1234567)).toMatch(/1.234.567/);
  });
  it('déplace un élément sans muter la liste', () => {
    const src = ['a', 'b', 'c'];
    expect(move(src, 0, 2)).toEqual(['b', 'c', 'a']);
    expect(src).toEqual(['a', 'b', 'c']);
    expect(move(src, 5, 0)).toEqual(['a', 'b', 'c']);
  });
});
