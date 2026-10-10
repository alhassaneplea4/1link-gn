import { useState } from 'react';
import { Alert, Badge, Button, Card, ConfirmDialog, Input, PageHeader, Segmented, Select, Skeleton, Toggle, useToast } from '@/components/ui';
import { LOCALES, useLocale, useT } from '@/i18n/core';
import { CATEGORY_IDS, type CategoryId } from '@/models/category';
import { useDocumentTitle } from '@/hooks/dom';
import { env, publicUrl } from '@/app/configuration/env';
import { useEditor } from '@/state/editor';
import { useSession } from '@/state/session';
import { useUi, type ThemePreference } from '@/state/ui';
import { VerificationCard } from './VerificationCard';
import { formatInternational } from '@/utilities/phone';
import './settings.css';

export default function SettingsPage() {
  const t = useT('dashboard', 'common');
  useDocumentTitle(`${t('dashboard.nav.settings')} · 1Link`);
  const toast = useToast();
  const user = useSession((s) => s.session?.user);
  const doc = useEditor((s) => s.doc);
  const { locale, setLocale } = useLocale();
  const theme = useUi((s) => s.theme);
  const setTheme = useUi((s) => s.setTheme);
  const [unpublishOpen, setUnpublishOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pendingCategory, setPendingCategory] = useState<CategoryId | null>(null);

  if (!user) return <Skeleton height={300} radius={16} />;

  const unpublish = async () => {
    setBusy(true);
    const ok = await useEditor.getState().unpublish();
    setBusy(false);
    setUnpublishOpen(false);
    toast.push({ tone: ok ? 'success' : 'error', title: ok ? t('dashboard.settings.unpublished') : t('dashboard.settings.unpublishFailed') });
  };

  const changeCategory = async () => {
    if (!pendingCategory || !doc) return;
    setBusy(true);
    useEditor.setState({ doc: { ...doc, category: pendingCategory }, dirty: true });
    const ok = await useEditor.getState().saveDraft();
    setBusy(false);
    setPendingCategory(null);
    toast.push({ tone: ok ? 'success' : 'error', title: ok ? t('dashboard.settings.categorySaved') : t('dashboard.settings.categoryFailed') });
  };

  return (
    <div className="settings">
      <PageHeader title={t('dashboard.nav.settings')} description={t('dashboard.settings.description')} />
      <div className="settings__grid">
        <Card padding="lg" className="settings__card">
          <h2>{t('dashboard.settings.account')}</h2>
          <Input label={t('auth.fields.name')} value={user.name} readOnly hint={env.isDemo ? t('dashboard.settings.notConnected') : undefined} />
          {user.email && <Input label={t('auth.fields.email')} value={user.email} readOnly suffix={<Badge tone={user.emailVerified ? 'success' : 'warning'} dot>{user.emailVerified ? t('dashboard.settings.verified') : t('dashboard.settings.unverified')}</Badge>} />}
          {user.phone && <Input label={t('auth.fields.phone')} value={formatInternational(user.phone)} readOnly suffix={<Badge tone={user.phoneVerified ? 'success' : 'warning'} dot>{user.phoneVerified ? t('dashboard.settings.verified') : t('dashboard.settings.unverified')}</Badge>} />}
          <Select label={t('dashboard.settings.category')} hint={t('dashboard.settings.categoryHint')} value={doc?.category ?? user.category ?? 'individual'} onChange={(e) => setPendingCategory(e.target.value as CategoryId)} disabled={!doc}>
            {CATEGORY_IDS.map((c) => <option key={c} value={c}>{t(`common.categories.${c}.label`)}</option>)}
          </Select>
          {doc?.username && <Input label={t('dashboard.settings.address')} value={publicUrl(doc.username)} readOnly hint={t('dashboard.settings.addressHint')} />}
        </Card>

        <Card padding="lg" className="settings__card">
          <h2>{t('dashboard.settings.preferences')}</h2>
          <div className="settings__row">
            <span className="field__label" id="pref-theme">{t('common.theme.label')}</span>
            <Segmented label={t('common.theme.label')} value={theme} onChange={(v) => setTheme(v as ThemePreference)} options={[{ value: 'light', label: t('common.theme.light'), icon: 'sun' }, { value: 'dark', label: t('common.theme.dark'), icon: 'moon' }, { value: 'system', label: t('common.theme.system'), icon: 'monitor' }]} />
          </div>
          <Select label={t('common.language')} value={locale} onChange={(e) => void setLocale(e.target.value as typeof locale)} hint={t('dashboard.settings.languageHint')}>
            {LOCALES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </Select>
          <Toggle label={t('dashboard.settings.emailNotifs')} hint={t('dashboard.settings.soonHint')} checked={false} onChange={() => undefined} disabled />
        </Card>

        <VerificationCard />

        <Card padding="lg" className="settings__card settings__card--danger">
          <h2>{t('dashboard.settings.dangerZone')}</h2>
          <div className="settings__danger">
            <div><strong>{t('dashboard.settings.unpublishTitle')}</strong><p className="muted">{t('dashboard.settings.unpublishText')}</p></div>
            <Button variant="secondary" disabled={doc?.status !== 'published'} onClick={() => setUnpublishOpen(true)}>{t('dashboard.settings.unpublish')}</Button>
          </div>
          <div className="settings__danger">
            <div><strong>{t('dashboard.settings.deleteTitle')}</strong><p className="muted">{t('dashboard.settings.deleteText')}</p></div>
            <Button variant="danger" disabled>{t('dashboard.settings.delete')}</Button>
          </div>
          <Alert tone="info">{t('dashboard.settings.deleteNote')}</Alert>
        </Card>
      </div>

      <ConfirmDialog open={unpublishOpen} tone="danger" loading={busy} onCancel={() => setUnpublishOpen(false)} onConfirm={() => void unpublish()} title={t('dashboard.settings.unpublishTitle')} description={t('dashboard.settings.unpublishConfirm')} confirmLabel={t('dashboard.settings.unpublish')} />
      <ConfirmDialog open={pendingCategory !== null} loading={busy} onCancel={() => setPendingCategory(null)} onConfirm={() => void changeCategory()} title={t('dashboard.settings.categoryConfirmTitle')} description={t('dashboard.settings.categoryConfirmText')} confirmLabel={t('common.confirm')} />
    </div>
  );
}
