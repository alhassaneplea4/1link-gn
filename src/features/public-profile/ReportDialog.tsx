import { useState } from 'react';
import { Alert, Button, Modal, Select, Textarea } from '@/components/ui';
import { api } from '@/services/api';
import { useT } from '@/i18n/core';
import { isApiError } from '@/models/api';
import type { ReportReason } from '@/models/admin';

const REASONS: ReportReason[] = ['spam', 'impersonation', 'inappropriate', 'scam', 'copyright', 'other'];

/** Signalement d'une page par un visiteur. Aucune donnée personnelle n'est demandée. */
export function ReportDialog({ open, onClose, username }: { open: boolean; onClose: () => void; username: string }) {
  const t = useT('pub', 'common');
  const [reason, setReason] = useState<ReportReason>('spam');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const close = () => {
    onClose();
    // Réinitialise après la fermeture pour ne pas conserver un état « envoyé » obsolète.
    setTimeout(() => { setSent(false); setError(null); setDetails(''); setReason('spam'); }, 200);
  };

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.page.reportPage(username, { reason, details: details.trim() });
      setSent(true);
    } catch (e) {
      setError(isApiError(e) && (e.code === 'rate_limited' || e.code === 'network') ? e.code : 'generic');
    } finally {
      setBusy(false);
    }
  };

  const errorText = error === 'rate_limited' ? t('pub.report.errors.rate_limited') : error === 'network' ? t('pub.report.errors.network') : t('pub.report.errors.generic');

  return (
    <Modal
      open={open} onClose={close} size="sm" title={sent ? t('pub.report.sentTitle') : t('pub.report.title')} description={sent ? undefined : t('pub.report.description')}
      footer={sent ? <Button onClick={close}>{t('common.close')}</Button> : (
        <>
          <Button variant="secondary" onClick={close} disabled={busy}>{t('common.cancel')}</Button>
          <Button variant="danger" iconLeft="flag" loading={busy} onClick={() => void submit()}>{t('pub.report.submit')}</Button>
        </>
      )}
    >
      {sent ? (
        <div className="report-done">
          <p>{t('pub.report.sentText')}</p>
        </div>
      ) : (
        <div className="report-form">
          {error && <Alert tone="danger">{errorText}</Alert>}
          <Select label={t('pub.report.reason')} value={reason} onChange={(e) => setReason(e.target.value as ReportReason)}>
            {REASONS.map((r) => <option key={r} value={r}>{t(`pub.report.reasons.${r}`)}</option>)}
          </Select>
          <Textarea label={t('pub.report.details')} hint={t('pub.report.detailsHint')} value={details} onChange={(e) => setDetails(e.target.value)} maxLength={500} showCount rows={4} />
        </div>
      )}
    </Modal>
  );
}
