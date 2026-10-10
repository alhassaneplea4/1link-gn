import { env } from '@/app/configuration/env';
import type { RealtimeEvent } from '@/models/admin';
import type { RealtimeAdapter } from '../types';

/**
 * Adaptateur SSE (EventSource). Messages attendus :
 *   event: activity  → data: RealtimeEvent
 *   event: visitors  → data: { count: number }
 * Un adaptateur WebSocket respectant la même interface pourra le remplacer sans toucher à l'UI.
 */
export const sseRealtime: RealtimeAdapter = {
  kind: env.realtimeUrl ? 'sse' : 'none',
  available: Boolean(env.realtimeUrl),
  connect({ onEvent, onState, onActiveVisitors }) {
    if (!env.realtimeUrl) {
      onState('disconnected');
      return () => undefined;
    }
    onState('connecting');
    const es = new EventSource(env.realtimeUrl, { withCredentials: true });
    es.onopen = () => onState('connected');
    es.onerror = () => onState(es.readyState === EventSource.CLOSED ? 'error' : 'connecting');
    es.addEventListener('activity', (e) => {
      try {
        onEvent(JSON.parse((e as MessageEvent<string>).data) as RealtimeEvent);
      } catch {
        /* message mal formé ignoré */
      }
    });
    es.addEventListener('visitors', (e) => {
      try {
        onActiveVisitors?.((JSON.parse((e as MessageEvent<string>).data) as { count: number }).count);
      } catch {
        /* ignoré */
      }
    });
    return () => {
      es.close();
      onState('disconnected');
    };
  },
};
