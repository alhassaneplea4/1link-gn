import { describe, expect, it } from 'vitest';
import { countryName, formatInternational, maskPhone, normalizePhone } from './phone';

describe('normalizePhone', () => {
  it('accepte les formes courantes guinéennes', () => {
    expect(normalizePhone('622 00 00 00')).toBe('+224622000000');
    expect(normalizePhone('0622000000')).toBe('+224622000000');
    expect(normalizePhone('+224 622 00 00 00')).toBe('+224622000000');
    expect(normalizePhone('00224622000000')).toBe('+224622000000');
    expect(normalizePhone('(224) 622-00-00-00')).toBe('+224622000000');
  });
  it('applique l’indicatif choisi pour un numéro national', () => {
    expect(normalizePhone('77 123 45 67', '221')).toBe('+221771234567');
    expect(normalizePhone('+33 6 12 34 56 78', '224')).toBe('+33612345678');
  });
  it('refuse les saisies invalides', () => {
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone('abc')).toBeNull();
    expect(normalizePhone('12345')).toBeNull();
    expect(normalizePhone('62200000')).toBeNull(); // trop court pour la Guinée (9 chiffres)
    expect(normalizePhone('+224 622 00 00 00 99')).toBeNull(); // trop long
    expect(normalizePhone('+0622000000')).toBeNull();
    expect(normalizePhone('6220000000000000000')).toBeNull();
  });
  it('formate et masque pour l’affichage', () => {
    expect(formatInternational('+224622000000')).toBe('+224 622 00 00 00');
    expect(maskPhone('+224622000000')).toBe('+224 6•• •• •• 00');
  });
  it('localise le nom du pays', () => {
    expect(countryName('GN', 'fr-FR')).toMatch(/Guin/);
    expect(countryName('GN', 'en-GB')).toBe('Guinea');
  });
});
