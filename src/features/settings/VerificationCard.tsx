import { useState } from 'react';
import { Alert, Badge, Button, Card, Checkbox, ErrorState, Icon, Input, Modal, Select, Skeleton, Textarea, useToast } from '@/components/ui';
import { api } from '@/services/api';
import { useResource } from '@/hooks/useResource';
import { useT } from '@/i18n/core';
import { isApiError } from '@/models/api';
import type { CategoryId } from '@/models/category';
import { VERIFICATION_KINDS, type VerificationInput, type VerificationKind } from '@/models/verification';
import { useEditor } from '@/state/editor';
import { formatDate } from '@/utilities/format';
import { isUrl } from '@/utilities/validation';

const defaultKind = (c: CategoryId | undefined): VerificationKind => (c === 'business' ? 'business' : c === 'organization' ? 'organization' : 'person');

type Errors = Partial<Record<'legalName' | 'proofUrl' | 'attest', string>>;

/** Demande du badge « Profil vérifié ». Le badge est décerné par la modération : cette carte ne fait que demander et suivre l'état. */
export function VerificationCard() {
  const t = useT('dashboard', 'common');
  const toast = useToast();
  const doc = useEditor((s) => s.doc);
  const state = useResource(() => api.page.getVerification(), []);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [form, setForm] = useState<VerificationInput>({ kind: defaultKind(doc?.category), legalName: '', registryNumber: '', proofUrl: '', note: '', attest: false });
  const set = <K extends keyof VerificationInput>(k: K, v: VerificationInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const published = doc?.status === 'published';
  const status = state.data?.status ?? 'none';
  const request = state.data?.request;

  const submit = async () => {
    if (busy) return;
    const found: Errors = {};
    if (form.legalName.trim().length < 2) found.legalName = t('common.validation.required');
    if (!isUrl(form.proofUrl)) found.proofUrl = form.proofUrl ? t('common.validation.url') : t('common.validation.required');
    if (!form.attest) found.attest = t('dashboard.verification.errors.attest');
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      await api.page.requestVerification(form);
      toast.push({ tone: 'success', title: t('dashboard.verification.sent') });
      setOpen(false);
      state.reload();
    } catch (e) {
      setFormError(isApiError(e) && e.code === 'conflict' ? t('dashboard.verification.errors.conflict') : t('dashboard.verification.errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card padding="lg" className="settings__card" id="verification">
      <h2><Icon name="shield-check" size={18} /> {t('dashboard.verification.title')}</h2>
      {state.status === 'loading' ? <Skeleton height={60} radius={12} /> : state.status === 'error' ? <ErrorState compact code={state.error} onRetry={state.reload} /> : (
        <>
          <p className="settings__status">
            <Badge tone={status === 'approved' ? 'success' : status === 'pending' ? 'info' : status === 'rejected' ? 'danger' : 'neutral'} icon={status === 'approved' ? 'check' : status === 'pending' ? 'clock' : undefined}>
              {t(`dashboard.verification.status.${status}`)}
            </Badge>
          </p>
          {status === 'none' && <p className="muted">{t('dashboard.verification.intro')}</p>}
          {status === 'approved' && <p className="muted">{t('dashboard.verification.approvedText')}</p>}
          {status === 'pending' && request && <p className="muted">{t('dashboard.verification.pendingText', { date: formatDate(request.createdAt) })}</p>}
          {status === 'rejected' && (
            <Alert tone="danger" title={t('dashboard.verification.rejectedTitle')}>{request?.decisionNote ?? t('dashboard.verification.rejectedText')}</Alert>
          )}
          {(status === 'none' || status === 'rejected') && (
            published ? <Button variant="gradient" iconLeft="shield-check" onClick={() => setOpen(true)}>{status === 'rejected' ? t('dashboard.verification.redo') : t('dashboard.verification.request')}</Button>
              : <Alert tone="info">{t('dashboard.verification.needPublish')}</Alert>
          )}
        </>
      )}

      <Modal
        open={open} onClose={() => !busy && setOpen(false)} title={t('dashboard.verification.form.title')} description={t('dashboard.verification.form.description')}
        footer={<><Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>{t('common.cancel')}</Button><Button variant="gradient" loading={busy} onClick={() => void submit()}>{t('dashboard.verification.form.submit')}</Button></>}
      >
        <div className="verif-form">
          {formError && <Alert tone="danger">{formError}</Alert>}
          <Select label={t('dashboard.verification.form.kind')} value={form.kind} onChange={(e) => set('kind', e.target.value as VerificationKind)}>
            {VERIFICATION_KINDS.map((k) => <option key={k} value={k}>{t(`dashboard.verification.form.kinds.${k}`)}</option>)}
          </Select>
          <Input label={t('dashboard.verification.form.legalName')} hint={t('dashboard.verification.form.legalNameHint')} value={form.legalName} onChange={(e) => set('legalName', e.target.value)} error={errors.legalName} required />
          {form.kind !== 'person' && <Input label={t('dashboard.verification.form.registryNumber')} hint={t('dashboard.verification.form.registryHint')} value={form.registryNumber} onChange={(e) => set('registryNumber', e.target.value)} optionalLabel={t('common.optional')} />}
          <Input label={t('dashboard.verification.form.proofUrl')} hint={t('dashboard.verification.form.proofHint')} placeholder="https://" inputMode="url" value={form.proofUrl} onChange={(e) => set('proofUrl', e.target.value)} error={errors.proofUrl} required />
          <Textarea label={t('dashboard.verification.form.note')} value={form.note} onChange={(e) => set('note', e.target.value)} rows={3} maxLength={400} showCount optionalLabel={t('common.optional')} />
          <Checkbox label={t('dashboard.verification.form.attest')} checked={form.attest} onChange={(e) => set('attest', e.target.checked)} error={errors.attest} />
          <p className="subtle verif-form__note"><Icon name="info" size={13} /> {t('dashboard.verification.form.privacy')}</p>
        </div>
      </Modal>
    </Card>
  );
}
