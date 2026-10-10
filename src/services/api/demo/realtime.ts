import type { RealtimeEvent } from '@/models/admin';
import type { RealtimeAdapter } from '../types';
import { rng } from './prng';

const SUBJECTS = ['mariama', 'kalou', 'ibrahima12', 'aissatou7', 'fouta-solidaire', 'mamadou'];
const KINDS: RealtimeEvent['kind'][] = ['view', 'view', 'view', 'click', 'click', 'signup', 'publish', 'report'];

/**
 * Générateur de flux de DÉMONSTRATION : n'émet rien tant que l'opérateur ne le lance pas explicitement
 * et signale toujours `kind: 'demo'`. Il n'est jamais présenté comme un flux réel.
 */
export const demoRealtime: RealtimeAdapter = {
  kind: 'demo',
  available: true,
  connect({ onEvent, onState, onActiveVisitors }) {
    const r = rng(Date.now() % 100000);
    onState('connected');
    let active = r.int(12, 40);
    onActiveVisitors?.(active);
    const id = setInterval(() => {
      active = Math.max(3, active + r.int(-3, 4));
      onActiveVisitors?.(active);
      const kind = r.pick(KINDS);
      onEvent({ id: `ev_${Date.now()}_${r.int(0, 999)}`, at: new Date().toISOString(), kind, subject: r.pick(SUBJECTS) });
    }, 1400);
    return () => {
      clearInterval(id);
      onState('disconnected');
    };
  },
};
