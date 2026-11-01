import { Icon, Modal, useToast } from '@/components/ui';
import { BLOCK_GROUPS, blockRegistry, blockTypesByGroup } from '@/features/page-engine/blocks/registry';
import { CATEGORY_CONFIG } from '@/features/categories/config';
import { useT } from '@/i18n/core';
import type { BlockType } from '@/models/blocks';
import { useEditor, useEditorBlocks } from '@/state/editor';
import { useIsDesktop } from '@/hooks/dom';
import { useAccess } from '@/hooks/useAccess';
import { addBlockProblem, allowsBlock, minimumPlanFor } from '@/models/access';
import { Drawer } from '@/components/ui';
import { nextPaidPlan, openUpgradePrompt } from '@/features/subscriptions/UpgradePrompt';

/** Sélecteur de type de bloc : recommandations de la catégorie en tête, puis tous les types par groupe. */
export function AddBlockDialog({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded?: (id: string) => void }) {
  const t = useT('editor', 'common');
  const { rights, plan: currentPlan } = useAccess();
  const toast = useToast();
  const category = useEditor((s) => s.doc?.category);
  const blocks = useEditorBlocks();
  const addBlock = useEditor((s) => s.addBlock);
  const desktop = useIsDesktop();
  const recommended = (category ? CATEGORY_CONFIG[category].starterBlocks : []).filter((tpe, i, a) => a.indexOf(tpe) === i);

  // Fonctionnalité réservée à une offre : le picker se referme et le modal propose de s'abonner (oui / non, plus tard).
  const offer = (type: BlockType, problem: 'plan_block' | 'plan_links' | 'plan_limit') => {
    const feature = t(`editor.blocks.${type}.label`);
    const plan = problem === 'plan_block' ? minimumPlanFor((r) => allowsBlock(r, type)) : nextPaidPlan(currentPlan);
    onClose();
    openUpgradePrompt({ plan, feature });
  };

  const add = (type: BlockType) => {
    const res = addBlock(type);
    if (!res.ok) {
      if (res.reason === 'plan_block' || res.reason === 'plan_links' || res.reason === 'plan_limit') {
        if (res.reason === 'plan_block' || currentPlan !== 'business') { offer(type, res.reason); return; }
      }
      toast.push({ tone: 'warning', title: res.reason === 'singleton' ? t('editor.picker.singletonExists') : res.reason === 'plan_links' ? t('editor.picker.planLinks', { max: rights.maxLinks ?? 0 }) : t('editor.picker.planLimit') });
      return;
    }
    onAdded?.(res.id);
    onClose();
  };

  const renderItem = (type: BlockType) => {
    const def = blockRegistry[type];
    // Un bloc déjà présent (ou réservé à une autre offre) reste visible mais grisé et non cliquable.
    const problem = addBlockProblem(rights, blocks, type);
    // Réservé à une autre offre : reste cliquable (cadenas) pour proposer l'abonnement ; seul un bloc déjà présent est inerte.
    const upsell = problem === 'plan_block' || ((problem === 'plan_links' || problem === 'plan_limit') && currentPlan !== 'business');
    const disabled = problem !== null && !upsell;
    const reason = problem === 'singleton' ? t('editor.picker.singletonExists')
      : problem === 'plan_block' ? t('editor.picker.planBlock', { plan: t(`common.plans.${minimumPlanFor((r) => allowsBlock(r, type))}`) })
        : problem === 'plan_links' ? t('editor.picker.planLinks', { max: rights.maxLinks ?? 0 })
          : problem === 'plan_limit' ? t('editor.picker.planLimit') : null;
    return (
      <li key={type}>
        <button type="button" className={`picker__item ${disabled || upsell ? 'is-disabled' : ''}`} onClick={() => add(type)} disabled={disabled} aria-disabled={disabled}>
          <span className="picker__icon"><Icon name={upsell ? 'lock' : def.icon} size={20} /></span>
          <span className="picker__text">
            <strong>{t(`editor.blocks.${type}.label`)}</strong>
            <small>{reason ?? t(`editor.blocks.${type}.description`)}</small>
          </span>
        </button>
      </li>
    );
  };

  const body = (
    <div className="picker">
      {recommended.length > 0 && (
        <section>
          <h3 className="picker__group">{t('editor.picker.recommended')}</h3>
          <ul role="list" className="picker__grid">{recommended.map(renderItem)}</ul>
        </section>
      )}
      {BLOCK_GROUPS.map((g) => {
        const types = blockTypesByGroup(g).filter((tp) => tp !== 'profile');
        if (!types.length) return null;
        return (
          <section key={g}>
            <h3 className="picker__group">{t(`editor.picker.groups.${g}`)}</h3>
            <ul role="list" className="picker__grid">{types.map(renderItem)}</ul>
          </section>
        );
      })}
    </div>
  );

  return desktop ? (
    <Modal open={open} onClose={onClose} size="lg" title={t('editor.picker.title')} description={t('editor.picker.description')}>{body}</Modal>
  ) : (
    <Drawer open={open} onClose={onClose} side="bottom" title={t('editor.picker.title')} description={t('editor.picker.description')}>{body}</Drawer>
  );
}
