import { useT } from '@/i18n/core';
import type { BlockRenderProps } from '../types';
import { buildVCard, vcardFileName } from '../vcard';
import { PgLink } from './links';

/** Télécharge un fichier .vcf généré localement dans le navigateur du visiteur. */
export function VcardRender({ block, ctx }: BlockRenderProps<'vcard'>) {
  const t = useT('pub');
  const d = block.data;
  const download = () => {
    const url = URL.createObjectURL(new Blob([buildVCard(d)], { type: 'text/vcard;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = vcardFileName(d);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div onClickCapture={(e) => {
      const link = (e.target as HTMLElement).closest('a');
      if (!link || ctx.preview) return;
      e.preventDefault();
      ctx.onTrack?.(block.id);
      download();
    }}>
      <PgLink href="#vcard" blockId={block.id} ctx={{ ...ctx, onTrack: undefined }} icon="user-check" title={d.label || t('pub.saveContact')} description={d.fullName} external={false} className="pg-btn--vcard" />
    </div>
  );
}
