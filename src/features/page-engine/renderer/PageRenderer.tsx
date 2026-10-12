import { memo, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';
import { useT } from '@/i18n/core';
import type { AnyBlock } from '@/models/blocks';
import type { PageDocument } from '@/models/page';
import { appearanceDataAttrs, appearanceToStyle, loadFont } from '../appearance/css';
import { blockRegistry, isBlockComplete, isBlockRenderable } from '../blocks/registry';
import type { BlockDefinition, RenderContext } from '../blocks/types';
import type { BlockType } from '@/models/blocks';
import { isBlockLive, nextScheduleChange, scheduleState } from '../schedule';
import { ProfileHero, SectionCard, SectionNav, groupSections } from './ProfileLayout';
import './page.css';

export type RenderablePage = Pick<PageDocument, 'username' | 'blocks' | 'appearance'> & Partial<Pick<PageDocument, 'category' | 'publishedAt'>>;

interface PageRendererProps {
  page: RenderablePage;
  /** Domaine + chemin public complet (pour le QR code). */
  pageUrl: string;
  /** Aperçu interne : liens inertes, blocs incomplets matérialisés. */
  preview?: boolean;
  /** `profile` : couverture, avatar, actions rapides et sections (page publique) ; `stack` : liste de blocs (éditeur, landing). */
  layout?: 'stack' | 'profile';
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
  // Aperçu de l'éditeur : exigeant (le bloc à compléter est signalé). Page publique : un élément oublié ne masque pas le bloc.
  const complete = ctx.preview ? isBlockComplete(block) : isBlockRenderable(block);
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
export const PageRenderer = memo(function PageRenderer({ page, pageUrl, preview = false, layout = 'stack', fullscreen = false, branding = false, lite = false, footer, onTrack, highlightBlockId = null, className = '' }: PageRendererProps) {
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
  const profileLayout = layout === 'profile' && visible.some((b) => b.type === 'profile');
  if (profileLayout) {
    const profile = visible.find((b) => b.type === 'profile') as Extract<AnyBlock, { type: 'profile' }>;
    const okBlock = preview ? isBlockComplete : isBlockRenderable;
    const complete = visible.filter((b) => okBlock(b));
    // Les icônes de réseaux (affichées dans l'en-tête) ne sont pas répétées dans les sections.
    const inHero = (b: AnyBlock) => b.type === 'social' && b.data.display === 'icons';
    const sections = groupSections(visible.filter((b) => !inHero(b) || !okBlock(b)));
    const columns = sections.length > 1 && !lite;
    return (
      <div className={`pg pg--profile ${fullscreen ? 'pg--full' : ''} ${lite ? 'pg--lite' : ''} ${className}`} style={style} {...attrs}>
        <div className="pg__inner">
          <ProfileHero page={page} profile={profile} blocks={complete} ctx={ctx} category={page.category} publishedAt={page.publishedAt} pageUrl={pageUrl} highlighted={highlightBlockId === profile.id} />
          <SectionNav sections={sections} preview={preview} />
          <div className={`pgp-sections ${columns ? 'pgp-sections--cols' : ''}`}>
            {sections.map((s) => (
              <SectionCard key={s.id} section={s}>
                {toRuns(s.blocks).map((run) =>
                  run.kind === 'single' ? (
                    <BlockView key={run.block.id} block={run.block} ctx={ctx} index={n++} highlighted={highlightBlockId === run.block.id} now={now} />
                  ) : (
                    <div key={run.blocks[0]!.id} className="pg-linkrun">
                      {run.blocks.map((b) => <BlockView key={b.id} block={b} ctx={ctx} index={n++} highlighted={highlightBlockId === b.id} now={now} />)}
                    </div>
                  ),
                )}
              </SectionCard>
            ))}
          </div>
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
  }
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
