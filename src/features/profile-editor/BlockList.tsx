import { useRef, useState, type DragEvent } from 'react';
import { Badge, Button, ConfirmDialog, Icon, IconButton } from '@/components/ui';
import { SchemaForm } from '@/components/forms/SchemaForm';
import { blockRegistry, blockSummary, validateBlock } from '@/features/page-engine/blocks/registry';
import { useT } from '@/i18n/core';
import type { AnyBlock } from '@/models/blocks';
import { useEditor, useEditorBlocks } from '@/state/editor';
import { cx } from '@/utilities/misc';
import { useAccess } from '@/hooks/useAccess';
import { MULTI_BLOCKS, type PlanRights } from '@/models/access';
import type { FieldDef } from '@/features/page-engine/blocks/schema';
import { useFlip } from './useFlip';
import { ScheduleFields } from './ScheduleFields';
import { scheduleState } from '@/features/page-engine/schedule';

interface BlockCardProps {
  block: AnyBlock;
  index: number;
  total: number;
  expanded: boolean;
  forceErrors: boolean;
  dragOver: boolean;
  onToggle: () => void;
  onRequestDelete: () => void;
  onDragStartIndex: (i: number) => void;
  onDropIndex: (i: number) => void;
  onDragOverIndex: (i: number | null) => void;
}

/** Nombre maximal de services / contacts selon l'offre : le serveur applique la même limite. */
function fieldsFor(type: string, fields: readonly FieldDef[], rights: PlanRights): readonly FieldDef[] {
  const cap = type === 'service' ? rights.maxServices : type === 'contact' ? rights.maxContacts : null;
  if (cap === null) return fields;
  return fields.map((f) => (f.kind === 'list' && f.name === 'items' ? { ...f, max: Math.min(f.max, cap) } : f));
}

function BlockCard({ block, index, total, expanded, forceErrors, dragOver, onToggle, onRequestDelete, onDragStartIndex, onDropIndex, onDragOverIndex }: BlockCardProps) {
  const t = useT('editor');
  const def = blockRegistry[block.type];
  const { rights } = useAccess();
  const { moveBlock, toggleVisible, duplicateBlock, replaceBlockData, setBlockSchedule } = useEditor.getState();
  const sched = scheduleState(block.schedule, Date.now());
  const errors = validateBlock(block);
  const incomplete = Object.keys(errors).length > 0;
  const [dragAllowed, setDragAllowed] = useState(false);
  const summary = blockSummary(block);
  const panelId = `panel-${block.id}`;

  const onDragStart = (e: DragEvent) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', block.id);
    onDragStartIndex(index);
  };

  return (
    <li
      data-flip-id={block.id}
      className={cx('bcard', expanded && 'is-open', !block.visible && 'is-hidden', dragOver && 'is-dragover')}
      draggable={dragAllowed}
      onDragStart={onDragStart}
      onDragEnd={() => { setDragAllowed(false); onDragOverIndex(null); }}
      onDragOver={(e) => { e.preventDefault(); onDragOverIndex(index); }}
      onDrop={(e) => { e.preventDefault(); onDropIndex(index); setDragAllowed(false); }}
    >
      <div className="bcard__head">
        <span className="bcard__grip" onPointerDown={() => setDragAllowed(true)} onPointerUp={() => setDragAllowed(false)} title={t('editor.list.drag')} aria-hidden="true">
          <Icon name="grip" size={18} />
        </span>
        <button type="button" className="bcard__main" aria-expanded={expanded} aria-controls={panelId} onClick={onToggle}>
          <span className="bcard__icon"><Icon name={def.icon} size={18} /></span>
          <span className="bcard__text">
            <span className="bcard__type">{t(`editor.blocks.${block.type}.label`)}</span>
            <span className="bcard__summary truncate">{summary || t('editor.list.noSummary')}</span>
          </span>
          {incomplete && <Badge tone="warning" icon="alert">{t('editor.list.incomplete')}</Badge>}
          {!block.visible && <Badge tone="neutral" icon="eye-off">{t('editor.list.hidden')}</Badge>}
          {sched !== 'none' && <Badge tone={sched === 'active' ? 'success' : 'info'} icon="calendar">{t(`editor.schedule.state.${sched}`)}</Badge>}
          <Icon name="chevron-down" size={18} className="bcard__chev" />
        </button>
        <div className="bcard__tools" role="toolbar" aria-label={t('editor.list.actionsFor', { name: t(`editor.blocks.${block.type}.label`) })}>
          <IconButton size="sm" icon="arrow-up" label={t('editor.list.moveUp')} disabled={index === 0} onClick={() => moveBlock(index, index - 1)} />
          <IconButton size="sm" icon="arrow-down" label={t('editor.list.moveDown')} disabled={index === total - 1} onClick={() => moveBlock(index, index + 1)} />
          <IconButton size="sm" icon={block.visible ? 'eye' : 'eye-off'} label={block.visible ? t('editor.list.hide') : t('editor.list.show')} onClick={() => toggleVisible(block.id)} />
          {MULTI_BLOCKS.includes(block.type) && <IconButton size="sm" icon="copy" label={t('common.duplicate')} onClick={() => duplicateBlock(block.id)} />}
          {!def.required && <IconButton size="sm" icon="trash" variant="danger" label={t('common.delete')} onClick={onRequestDelete} />}
        </div>
      </div>
      {expanded && (
        <div className="bcard__panel" id={panelId}>
          <SchemaForm
            idPrefix={block.id}
            labelPrefix={`editor.blocks.${block.type}`}
            fields={fieldsFor(block.type, def.fields, rights)}
            data={block.data as unknown as Record<string, unknown>}
            errors={errors}
            showAllErrors={forceErrors}
            onChange={(patch) => replaceBlockData(block.id, { ...(block.data as object), ...patch })}
          />
          <ScheduleFields schedule={block.schedule} onChange={(sch) => setBlockSchedule(block.id, sch)} />
        </div>
      )}
    </li>
  );
}

export function BlockList({ forceErrors, onAdd }: { forceErrors: boolean; onAdd: () => void }) {
  const t = useT('editor');
  const blocks = useEditorBlocks();
  const selectedId = useEditor((s) => s.selectedId);
  const select = useEditor((s) => s.select);
  const remove = useEditor((s) => s.removeBlock);
  const move = useEditor((s) => s.moveBlock);
  const listRef = useRef<HTMLOListElement>(null);
  const dragFrom = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [toDelete, setToDelete] = useState<AnyBlock | null>(null);
  useFlip(listRef, blocks.map((b) => b.id).join(','));

  return (
    <div className="blocklist">
      <ol role="list" ref={listRef} className="blocklist__items" aria-label={t('editor.list.title')}>
        {blocks.map((b, i) => (
          <BlockCard
            key={b.id} block={b} index={i} total={blocks.length} expanded={selectedId === b.id} forceErrors={forceErrors} dragOver={dragOver === i && dragFrom.current !== i}
            onToggle={() => select(selectedId === b.id ? null : b.id)} onRequestDelete={() => setToDelete(b)}
            onDragStartIndex={(n) => { dragFrom.current = n; }} onDragOverIndex={setDragOver}
            onDropIndex={(to) => { if (dragFrom.current !== null) move(dragFrom.current, to); dragFrom.current = null; setDragOver(null); }}
          />
        ))}
      </ol>
      <Button variant="secondary" iconLeft="plus" fullWidth className="blocklist__add" onClick={onAdd}>{t('editor.list.addBlock')}</Button>
      <ConfirmDialog
        open={toDelete !== null} tone="danger" onCancel={() => setToDelete(null)}
        title={t('editor.list.deleteTitle')} description={t('editor.list.deleteDesc')} confirmLabel={t('common.delete')}
        onConfirm={() => { if (toDelete) remove(toDelete.id); setToDelete(null); }}
      />
    </div>
  );
}
