import { Input, Select } from '@/components/ui';
import { intlLocale, useT } from '@/i18n/core';
import { COUNTRIES } from '@/utilities/phone';
import { countryName } from '@/utilities/phone';

interface Props {
  dial: string;
  national: string;
  onDial: (dial: string) => void;
  onNational: (value: string) => void;
  error?: string;
}

/** Pays + numéro national (l'indicatif est ajouté à part, voir `normalizePhone`). */
export function PhoneField({ dial, national, onDial, onNational, error }: Props) {
  const t = useT('auth');
  const locale = intlLocale();
  return (
    <div className="phonefield">
      <Select label={t('auth.phone.country')} value={dial} onChange={(e) => onDial(e.target.value)} wrapperClassName="phonefield__country">
        {COUNTRIES.map((c) => <option key={c.region} value={c.dial}>{countryName(c.region, locale)} (+{c.dial})</option>)}
      </Select>
      <Input label={t('auth.phone.number')} type="tel" name="tel-national" inputMode="tel" autoComplete="tel-national" placeholder="6XX XX XX XX" value={national} onChange={(e) => onNational(e.target.value)} error={error} hint={t('auth.phone.numberHint')} required prefix={`+${dial}`} />
    </div>
  );
}
