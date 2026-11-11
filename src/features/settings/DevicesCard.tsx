import { useCallback, useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, Icon, useToast } from '@/components/ui';
import { api } from '@/services/api';
import { useT } from '@/i18n/core';
import type { DeviceSession } from '@/models/auth';
import { formatDateTime } from '@/utilities/format';
import { intlLocale } from '@/i18n/core';

/** Pays lisible dans la langue de l'interface (« Guinée », « Guinea »). */
function countryLabel(code: string | null, locale: string): string | null {
  if (!code) return null;
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/**
 * Appareils connectés : les sessions réellement ouvertes sur le compte (lues sur le serveur), avec de quoi reconnaître chacune
 * (navigateur, système, pays, adresse IP masquée) et la fermer. Aucune session n'est affichée « de mémoire » : tout vient du serveur.
 */
export function DevicesCard() {
  const t = useT('dashboard', 'common');
  const locale = intlLocale();
  const toast = useToast();
  const [items, setItems] = useState<DeviceSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await api.auth.listSessions());
      setError(null);
    } catch {
      setError(t('dashboard.security.devices.error'));
    }
  }, [t]);
  useEffect(() => {
    void load();
  }, [load]);

  const revoke = async (id: string) => {
    setBusy(id);
    try {
      await api.auth.revokeSession(id);
      toast.push({ tone: 'success', title: t('dashboard.security.devices.revoked') });
      await load();
    } catch {
      setError(t('dashboard.security.devices.error'));
    } finally {
      setBusy(null);
    }
  };

  const revokeOthers = async () => {
    setBusy('others');
    try {
      await api.auth.revokeOtherSessions();
      toast.push({ tone: 'success', title: t('dashboard.security.devices.othersRevoked') });
      await load();
    } catch {
      setError(t('dashboard.security.devices.error'));
    } finally {
      setBusy(null);
    }
  };

  const others = (items ?? []).filter((s) => !s.current);

  return (
    <Card padding="lg" className="settings__card" data-testid="devices-card">
      <h2><Icon name="monitor" size={18} /> {t('dashboard.security.devices.title')}</h2>
      <p className="muted">{t('dashboard.security.devices.description')}</p>
      {error && <Alert tone="danger">{error}</Alert>}
      {items === null && !error && <p className="muted">{t('dashboard.security.devices.loading')}</p>}
      {items && (
        <ul className="device-list">
          {items.map((s) => {
            const what = s.browser && s.os ? t('dashboard.security.devices.browserOn', { browser: s.browser, os: s.os }) : (s.browser ?? s.os ?? t('dashboard.security.devices.unknown'));
            const where = [countryLabel(s.country, locale), s.ip].filter(Boolean).join(' · ');
            return (
              <li key={s.id} className={`device ${s.current ? 'is-current' : ''}`} data-testid="device">
                <span className="device__icon"><Icon name={s.os === 'iOS' || s.os === 'Android' ? 'smartphone' : 'monitor'} size={18} /></span>
                <div className="device__text">
                  <strong>{what} {s.current && <Badge tone="success" dot>{t('dashboard.security.devices.current')}</Badge>}</strong>
                  {where && <small>{where}</small>}
                  <small>{t('dashboard.security.devices.lastSeen', { date: formatDateTime(s.lastSeenAt) })} · {t('dashboard.security.devices.signedIn', { date: formatDateTime(s.createdAt) })}</small>
                  <small>{t(`dashboard.security.devices.factor.${s.factor}`)}</small>
                </div>
                {!s.current && <Button size="sm" variant="ghost" loading={busy === s.id} disabled={busy !== null} onClick={() => void revoke(s.id)}>{t('dashboard.security.devices.revoke')}</Button>}
              </li>
            );
          })}
        </ul>
      )}
      {items && others.length === 0 && <p className="muted">{t('dashboard.security.devices.noOthers')}</p>}
      {others.length > 0 && <Button variant="secondary" size="sm" iconLeft="logout" loading={busy === 'others'} disabled={busy !== null} onClick={() => void revokeOthers()}>{t('dashboard.security.devices.revokeOthers')}</Button>}
      <p className="subtle settings__note"><Icon name="info" size={13} /> {t('dashboard.security.devices.hint')}</p>
    </Card>
  );
}
