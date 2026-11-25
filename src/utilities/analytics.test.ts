import { describe, expect, it } from 'vitest';
import { redactAnalyticsEvent } from './analytics';

const send = (url: string) => redactAnalyticsEvent({ type: 'pageview', url })?.url ?? null;

describe('mesure d’audience : adresses envoyées à Vercel', () => {
  it('retire les jetons des liens reçus par e-mail', () => {
    for (const page of ['reset-password', 'verify-email', 'confirm-deletion']) {
      expect(send(`https://1link.test/auth/${page}?token=secret`)).toBe(`https://1link.test/auth/${page}`);
    }
  });

  it('retire tout paramètre et toute ancre', () => {
    expect(send('https://1link.test/awa?src=whatsapp#contact')).toBe('https://1link.test/awa');
  });

  it('masque le code d’une carte physique', () => {
    expect(send('https://1link.test/c/abcdefgh23')).toBe('https://1link.test/c/[code]');
    expect(send('https://1link.test/C/abcdefgh23')).toBe('https://1link.test/c/[code]');
  });

  it('ne mesure pas l’Admin Center', () => {
    expect(send('https://1link.test/admin')).toBeNull();
    expect(send('https://1link.test/admin/users/42')).toBeNull();
    expect(send('https://1link.test/Admin/users/42')).toBeNull();
  });

  it('garde une page publique dont le pseudo commence comme une route réservée', () => {
    expect(send('https://1link.test/administrateur')).toBe('https://1link.test/administrateur');
  });
});
