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

/** Sélecteur de type de bloc : recommandations de la catégorie en tête, puis tous les types par groupe. */
export function AddBlockDialog({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded?: (id: string) => void }) {
  const t = useT('editor', 'common');
  const { rights } = useAccess();
  const toast = useToast();
  const category = useEditor((s) => s.doc?.category);
  const blocks = useEditorBlocks();
  const addBlock = useEditor((s) => s.addBlock);
  const desktop = useIsDesktop();
  const recommended = (category ? CATEGORY_CONFIG[category].starterBlocks : []).filter((tpe, i, a) => a.indexOf(tpe) === i);

  const add = (type: BlockType) => {
    const res = addBlock(type);
    if (!res.ok) {
      toast.push({ tone: 'warning', title: res.reason === 'singleton' ? t('editor.picker.singletonExists') : res.reason === 'plan_block' ? t('editor.picker.planBlock', { plan: t(`common.plans.${minimumPlanFor((r) => allowsBlock(r, type))}`) }) : t('editor.picker.planLimit') });
      return;
    }
    onAdded?.(res.id);
    onClose();
  };

  const renderItem = (type: BlockType) => {
    const def = blockRegistry[type];
    // Un bloc déjà présent (ou réservé à une autre offre) reste visible mais grisé et non cliquable.
    const problem = addBlockProblem(rights, blocks, type);
    const disabled = problem !== null;
    const reason = problem === 'singleton' ? t('editor.picker.singletonExists')
      : problem === 'plan_block' ? t('editor.picker.planBlock', { plan: t(`common.plans.${minimumPlanFor((r) => allowsBlock(r, type))}`) })
        : problem === 'plan_links' ? t('editor.picker.planLinks', { max: rights.maxLinks ?? 0 })
          : problem === 'plan_limit' ? t('editor.picker.planLimit') : null;
    return (
      <li key={type}>
        <button type="button" className={`picker__item ${disabled ? 'is-disabled' : ''}`} onClick={() => add(type)} disabled={disabled} aria-disabled={disabled}>
          <span className="picker__icon"><Icon name={def.icon} size={20} /></span>
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
