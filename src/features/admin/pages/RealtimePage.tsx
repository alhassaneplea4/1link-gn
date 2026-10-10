import { useEffect, useRef, useState } from 'react';
import { Alert, Badge, Button, Card, DemoBadge, EmptyState, Icon, PageHeader, type IconName } from '@/components/ui';
import { api } from '@/services/api';
import { useDocumentTitle } from '@/hooks/dom';
import { useT } from '@/i18n/core';
import type { RealtimeEvent, RealtimeState } from '@/models/admin';
import { formatDate } from '@/utilities/format';

const ICONS: Record<RealtimeEvent['kind'], IconName> = { signup: 'user-check', publish: 'rocket', click: 'click', report: 'flag', view: 'eye' };
const MAX = 40;

/**
 * Activité en temps réel. L'adaptateur (`api.realtime`) fournit la source : SSE/WebSocket en production,
 * générateur de DÉMONSTRATION sinon — qui ne démarre que sur action explicite et est toujours signalé.
 */
export default function RealtimePage() {
  const t = useT('admin', 'common');
  useDocumentTitle(`${t('admin.nav.realtime')} · Admin Center`);
  const adapter = api.realtime;
  const [state, setState] = useState<RealtimeState>('disconnected');
  const [events, setEvents] = useState<RealtimeEvent[]>([]);
  const [active, setActive] = useState<number | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const stop = useRef<(() => void) | null>(null);

  const start = () => {
    stop.current?.();
    stop.current = adapter.connect({
      onState: setState,
      onActiveVisitors: setActive,
      onEvent: (e) => {
        setEvents((l) => [e, ...l].slice(0, MAX));
        setCounts((c) => ({ ...c, [e.kind]: (c[e.kind] ?? 0) + 1 }));
      },
    });
  };
  const halt = () => { stop.current?.(); stop.current = null; setState('disconnected'); };
  useEffect(() => () => stop.current?.(), []);

  const connected = state === 'connected';
  return (
    <div className="adm-live">
      <PageHeader title={t('admin.nav.realtime')} description={t('admin.realtime.description')} badge={adapter.kind === 'demo' ? <DemoBadge /> : undefined} />
      <Card padding="lg" className="adm-conn">
        <div className="adm-conn__state">
          <span className={`adm-pulse ${connected ? 'is-on' : ''}`} aria-hidden="true" />
          <div>
            <strong>{t(`admin.realtime.state.${state}`)}</strong>
            <p className="subtle">{adapter.available ? t(`admin.realtime.source.${adapter.kind}`) : t('admin.realtime.noSource')}</p>
          </div>
        </div>
        {adapter.available ? (
          connected ? <Button variant="secondary" iconLeft="pause" onClick={halt}>{t('admin.realtime.stop')}</Button> : <Button variant="gradient" iconLeft="play" onClick={start} loading={state === 'connecting'}>{adapter.kind === 'demo' ? t('admin.realtime.startDemo') : t('admin.realtime.connect')}</Button>
        ) : <Badge tone="neutral" icon="wifi-off">{t('admin.realtime.notConnected')}</Badge>}
      </Card>
      {adapter.kind === 'demo' && <Alert tone="warning" title={t('admin.realtime.demoTitle')}>{t('admin.realtime.demoText')}</Alert>}
      {!adapter.available && <Alert tone="info" title={t('admin.realtime.setupTitle')}>{t('admin.realtime.setupText')}</Alert>}

      <div className="adm-grid adm-grid--2-1">
        <Card padding="md">
          <h2 className="adm-section-title">{t('admin.realtime.feed')}</h2>
          {events.length === 0 ? <EmptyState compact icon="radio" title={t('admin.realtime.empty')} description={t('admin.realtime.emptyText')} /> : (
            <ul role="list" className="adm-feed" aria-live="polite">
              {events.map((e) => (
                <li key={e.id}><Icon name={ICONS[e.kind]} size={16} /><span>{t(`admin.realtime.events.${e.kind}`)} · <strong>@{e.subject}</strong></span><time dateTime={e.at}>{formatDate(e.at, { timeStyle: 'medium' })}</time></li>
              ))}
            </ul>
          )}
        </Card>
        <div className="adm-stack">
          <Card padding="md">
            <p className="stat__label">{t('admin.realtime.activeVisitors')}</p>
            <p className="adm-big" aria-live="polite">{active ?? '—'}</p>
            {adapter.kind === 'demo' && connected && <DemoBadge />}
          </Card>
          <Card padding="md">
            <h2 className="adm-section-title">{t('admin.realtime.session')}</h2>
            <ul role="list" className="adm-feed">
              {(['view', 'click', 'signup', 'publish', 'report'] as const).map((k) => <li key={k}><Icon name={ICONS[k]} size={16} /><span>{t(`admin.realtime.events.${k}`)}</span><time>{counts[k] ?? 0}</time></li>)}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
