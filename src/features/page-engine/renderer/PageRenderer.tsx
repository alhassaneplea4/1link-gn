import { memo, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';
import { useT } from '@/i18n/core';
import type { AnyBlock } from '@/models/blocks';
import type { PageDocument } from '@/models/page';
import { appearanceDataAttrs, appearanceToStyle, loadFont } from '../appearance/css';
import { blockRegistry, isBlockComplete } from '../blocks/registry';
import type { BlockDefinition, RenderContext } from '../blocks/types';
import type { BlockType } from '@/models/blocks';
import { isBlockLive, nextScheduleChange, scheduleState } from '../schedule';
import './page.css';

export type RenderablePage = Pick<PageDocument, 'username' | 'blocks' | 'appearance'>;

interface PageRendererProps {
  page: RenderablePage;
  /** Domaine + chemin public complet (pour le QR code). */
  pageUrl: string;
  /** Aperçu interne : liens inertes, blocs incomplets matérialisés. */
  preview?: boolean;
  /** Occupe toute la hauteur de la fenêtre (page publique). */
  fullscreen?: boolean;
  /** Affiche « Créé avec 1Link » (offre Free). */
  branding?: boolean;
  /** Mode économe en données. */
  lite?: boolean;
  /** Contenu additionnel en pied de page (mode économe, signalement…). */
  footer?: ReactNode;
  onTrack?: (blockId: string) => void;
  highlightBlockId?: string | null;
  className?: string;
}

type Run = { kind: 'links'; blocks: AnyBlock[] } | { kind: 'single'; block: AnyBlock };

/** Regroupe les blocs « lien » consécutifs pour permettre une grille multi-colonnes. */
function toRuns(blocks: AnyBlock[]): Run[] {
  const runs: Run[] = [];
  for (const b of blocks) {
    const last = runs[runs.length - 1];
    if (b.type === 'link' && last?.kind === 'links') last.blocks.push(b);
    else if (b.type === 'link') runs.push({ kind: 'links', blocks: [b] });
    else runs.push({ kind: 'single', block: b });
  }
  return runs;
}

/** Horloge qui ne se rafraîchit qu'aux instants où la programmation d'un bloc change. */
function useScheduleClock(blocks: readonly AnyBlock[]): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const next = nextScheduleChange(blocks, Date.now());
    if (next === null) return;
    const id = setTimeout(() => setNow(Date.now()), Math.min(next - Date.now() + 50, 2 ** 31 - 1));
    return () => clearTimeout(id);
  }, [blocks, now]);
  return now;
}

function BlockView({ block, ctx, index, highlighted, now }: { block: AnyBlock; ctx: RenderContext; index: number; highlighted: boolean; now: number }) {
  const t = useT('pub');
  const def = blockRegistry[block.type] as unknown as BlockDefinition<BlockType>;
  const complete = isBlockComplete(block);
  const sched = scheduleState(block.schedule, now);
  if (!complete && !ctx.preview) return null;
  const Cmp = def.Render;
  return (
    <div className={`pg-block pg-block--${block.type} ${highlighted ? 'is-highlighted' : ''}`} style={{ '--i': index } as CSSProperties} data-block-id={block.id}>
      {ctx.preview && sched !== 'none' && <span className="pg-sched" data-state={sched}><Icon name="calendar" size={12} /> {t(`pub.scheduled.${sched}`)}</span>}
      {complete ? (
        <Cmp block={block as never} ctx={ctx} />
      ) : (
        <div className="pg-placeholder">
          <Icon name={def.icon} size={18} /> {t('pub.incomplete')}
        </div>
      )}
    </div>
  );
}

/**
 * Rendu unique d'une page 1Link : utilisé par la page publique, l'aperçu de l'éditeur,
 * l'éditeur d'apparence, l'onboarding et la page d'accueil. Une seule source de vérité visuelle.
 */
export const PageRenderer = memo(function PageRenderer({ page, pageUrl, preview = false, fullscreen = false, branding = false, lite = false, footer, onTrack, highlightBlockId = null, className = '' }: PageRendererProps) {
  const t = useT('pub');
  const { appearance } = page;
  const style = useMemo(() => appearanceToStyle(appearance), [appearance]);
  const attrs = appearanceDataAttrs(appearance);
  useEffect(() => loadFont(appearance.font.family), [appearance.font.family]);
  const ctx = useMemo<RenderContext>(() => ({ username: page.username, pageUrl, preview, lite, onTrack }), [page.username, pageUrl, preview, lite, onTrack]);
  const now = useScheduleClock(page.blocks);
  const visible = page.blocks.filter((b) => (preview ? b.visible : isBlockLive(b, now)));
  const runs = useMemo(() => toRuns(visible), [visible]);
  let n = 0;
  return (
    <div className={`pg ${fullscreen ? 'pg--full' : ''} ${lite ? 'pg--lite' : ''} ${className}`} style={style} {...attrs}>
      <div className="pg__inner">
        {runs.map((run) =>
          run.kind === 'single' ? (
            <BlockView key={run.block.id} block={run.block} ctx={ctx} index={n++} highlighted={highlightBlockId === run.block.id} now={now} />
          ) : (
            <div key={run.blocks[0]!.id} className="pg-linkrun">
              {run.blocks.map((b) => (
                <BlockView key={b.id} block={b} ctx={ctx} index={n++} highlighted={highlightBlockId === b.id} now={now} />
              ))}
            </div>
          ),
        )}
        {footer && <div className="pg-footer">{footer}</div>}
        {branding && (
          <footer className="pg-brand">
            <a href={preview ? undefined : '/'} onClick={(e) => preview && e.preventDefault()} tabIndex={preview ? -1 : undefined}>
              {t('pub.madeWith')} <strong>1Link</strong>
            </a>
          </footer>
        )}
      </div>
    </div>
  );
});
