import { describe, expect, it } from 'vitest';
import { isEmail } from './validation';

describe('isEmail : adresse sûre à transmettre à un serveur d’envoi', () => {
  it('accepte les adresses usuelles', () => {
    for (const ok of ['awa@exemple.com', 'Awa.Camara@Exemple.COM', 'a+tag@sous.domaine.exemple.gn', 'prenom-nom_1@exemple.co', "o'neil@exemple.org", 'x@xn--80ak6aa92e.xn--p1ai', 'un.e@a-b.fr']) expect(isEmail(ok), ok).toBe(true);
  });

  it('refuse tout ce qui peut faire lire un autre destinataire à l’analyseur d’adresses', () => {
    const hostile = [
      'a<victime@gmail.com>.com', 'a>@exemple.com', '"a>"@exemple.test', '"x;y"@exemple.test', 'a;b@exemple.test', 'a,b@exemple.test',
      'a@exemple.test,b@exemple.test', '(c)a@exemple.test', 'a@[127.0.0.1]', 'a b@exemple.test', 'a@exemple.test\nBcc: x@y.zz', 'a\\b@exemple.test',
    ];
    for (const bad of hostile) expect(isEmail(bad), JSON.stringify(bad)).toBe(false);
  });

  it('refuse les formes invalides et les longueurs excessives', () => {
    for (const bad of ['', 'sans-arobase', '@exemple.com', 'a@', 'a@exemple', 'a@exemple.c', 'a..b@exemple.com', '.a@exemple.com', 'a.@exemple.com', 'a@-exemple.com', 'a@exemple..com']) expect(isEmail(bad), bad).toBe(false);
    expect(isEmail(`${'a'.repeat(65)}@exemple.com`)).toBe(false);
    expect(isEmail(`a@${'b'.repeat(250)}.com`)).toBe(false);
  });
});
