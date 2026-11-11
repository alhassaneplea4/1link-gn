import { useCallback, useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, ConfirmDialog, Icon, Input, useToast } from '@/components/ui';
import { api } from '@/services/api';
import { useT } from '@/i18n/core';
import type { PasskeyInfo } from '@/models/auth';
import { useSession } from '@/state/session';
import { formatDate } from '@/utilities/format';
import { explainPasskeyRegisterError, passkeysSupported, registerPasskey } from '@/features/authentication/passkeys';
import { explainOtpError } from '@/features/authentication/otpErrors';
import { useIdentity } from './IdentityField';

/**
 * Clés d'accès (passkeys) : connexion par l'empreinte, le visage ou le code de l'appareil. Ajouter ou retirer une clé exige une
 * preuve d'identité (mot de passe ou code) ; ajouter une clé renforce aussitôt la session courante (second facteur).
 */
export function PasskeysCard() {
  const t = useT('dashboard', 'auth', 'common');
  const toast = useToast();
  const setSession = useSession((s) => s.setSession);
  const supported = passkeysSupported();
  const [items, setItems] = useState<PasskeyInfo[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [removing, setRemoving] = useState<PasskeyInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const identity = useIdentity();

  const load = useCallback(() => api.auth.listPasskeys().then(setItems, () => setItems([])), []);
  useEffect(() => {
    void load();
  }, [load]);

  const closeAdd = () => { setAdding(false); setName(''); setError(null); identity.reset(); };
  const closeRemove = () => { setRemoving(null); setError(null); identity.reset(); };

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      const { session } = await registerPasskey(identity.proof, name.trim() || t('dashboard.security.passkeys.defaultName'));
      setSession(session);
      toast.push({ tone: 'success', title: t('dashboard.security.passkeys.added') });
      closeAdd();
      await load();
    } catch (e) {
      setError(explainPasskeyRegisterError(t, e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    setError(null);
    try {
      await api.auth.removePasskey(removing.id, identity.proof);
      toast.push({ tone: 'success', title: t('dashboard.security.passkeys.removed') });
      closeRemove();
      await load();
    } catch (e) {
      setError(explainOtpError(t, e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card padding="lg" className="settings__card" data-testid="passkeys-card">
      <h2><Icon name="fingerprint" size={18} /> {t('dashboard.security.passkeys.title')}</h2>
      <p className="muted">{t('dashboard.security.passkeys.text')}</p>
      {items && items.length === 0 && <p className="muted">{t('dashboard.security.passkeys.none')}</p>}
      {items && items.length > 0 && (
        <ul className="device-list">
          {items.map((p) => (
            <li key={p.id} className="device" data-testid="passkey">
              <span className="device__icon"><Icon name="key" size={18} /></span>
              <div className="device__text">
                <strong>{p.name} <Badge tone="neutral">{p.backedUp ? t('dashboard.security.passkeys.synced') : t('dashboard.security.passkeys.deviceBound')}</Badge></strong>
                <small>{t('dashboard.security.passkeys.createdOn', { date: formatDate(p.createdAt) })} · {p.lastUsedAt ? t('dashboard.security.passkeys.usedOn', { date: formatDate(p.lastUsedAt) }) : t('dashboard.security.passkeys.neverUsed')}</small>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setRemoving(p)}>{t('dashboard.security.passkeys.remove')}</Button>
            </li>
          ))}
        </ul>
      )}
      {supported ? (
        <Button variant="secondary" size="sm" iconLeft="plus" onClick={() => setAdding(true)}>{t('dashboard.security.passkeys.add')}</Button>
      ) : (
        <Alert tone="warning">{t('dashboard.security.passkeys.unsupported')}</Alert>
      )}

      <ConfirmDialog open={adding} loading={busy} onCancel={closeAdd} onConfirm={() => void add()} confirmDisabled={!identity.ready} title={t('dashboard.security.passkeys.add')} description={t('dashboard.security.passkeys.text')} confirmLabel={t('dashboard.security.passkeys.confirmAdd')}>
        {error && <Alert tone="danger">{error}</Alert>}
        <Input label={t('dashboard.security.passkeys.nameLabel')} value={name} onChange={(e) => setName(e.target.value)} placeholder={t('dashboard.security.passkeys.namePlaceholder')} maxLength={60} />
        {identity.field}
      </ConfirmDialog>

      <ConfirmDialog open={removing !== null} loading={busy} onCancel={closeRemove} onConfirm={() => void remove()} confirmDisabled={!identity.ready} tone="danger" title={t('dashboard.security.passkeys.removeTitle')} description={t('dashboard.security.passkeys.removeText')} confirmLabel={t('dashboard.security.passkeys.remove')}>
        {error && <Alert tone="danger">{error}</Alert>}
        {identity.field}
      </ConfirmDialog>
    </Card>
  );
}
