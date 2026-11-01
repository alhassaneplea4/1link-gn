/**
 * Boutons de contact direct du profil, juste avant « Partager » et « QR code » :
 *  - un bouton de message qui bascule entre WhatsApp (numéro WhatsApp) et SMS (numéro mobile) ;
 *  - un bouton d'appel direct (numéro mobile, ou professionnel ; les deux sont proposés s'ils existent).
 * Seuls les numéros renseignés produisent un bouton : rien n'est inventé.
 */
import { useState } from 'react';
import { Icon, type IconName } from '@/components/ui/Icon';
import { useT } from '@/i18n/core';
import type { ProfileData } from '@/models/blocks';
import { isPhone } from '@/utilities/validation';
import { smsHref, telHref, whatsappHref } from '../blocks/urls';
import type { RenderContext } from '../blocks/types';

type Channel = { key: string; icon: IconName; label: string; switchLabel: string; href: string; external?: boolean };

const clean = (v: string | undefined) => (v && isPhone(v) ? v.trim() : '');

/** Canaux disponibles d'après les numéros du profil. */
export function contactChannels(d: Pick<ProfileData, 'mobilePhone' | 'proPhone' | 'whatsappPhone'>) {
  const mobile = clean(d.mobilePhone);
  const pro = clean(d.proPhone);
  const wa = clean(d.whatsappPhone);
  return { mobile, pro, wa, hasMessage: Boolean(wa || mobile), hasCall: Boolean(mobile || pro) };
}

function Split({ channels, blockId, ctx, primary }: { channels: Channel[]; blockId: string; ctx: RenderContext; primary: boolean }) {
  const t = useT('pub');
  const [index, setIndex] = useState(0);
  const current = channels[index] ?? channels[0]!;
  return (
    <div className="pgp-duo">
      <a
        className={`pgp-act ${primary ? 'is-primary' : ''}`}
        href={ctx.preview ? undefined : current.href}
        role={ctx.preview ? 'link' : undefined}
        tabIndex={ctx.preview ? -1 : undefined}
        aria-disabled={ctx.preview || undefined}
        {...(current.external && !ctx.preview ? { target: '_blank', rel: 'noopener noreferrer nofollow' } : {})}
        onClick={(e) => (ctx.preview ? e.preventDefault() : ctx.onTrack?.(blockId))}
      >
        <Icon name={current.icon} size={17} /> <span>{current.label}</span>
      </a>
      {channels.length > 1 && (
        <div className="pgp-switch" role="group" aria-label={t('pub.actions.switch')}>
          {channels.map((c, i) => (
            <button key={c.key} type="button" aria-pressed={i === index} tabIndex={ctx.preview ? -1 : undefined} onClick={() => setIndex(i)}>
              {c.switchLabel}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ContactActions({ profile, ctx }: { profile: { id: string; data: ProfileData }; ctx: RenderContext }) {
  const t = useT('pub');
  const { mobile, pro, wa, hasMessage, hasCall } = contactChannels(profile.data);
  if (!hasMessage && !hasCall) return null;

  const message: Channel[] = [];
  if (wa) message.push({ key: 'wa', icon: 'whatsapp', label: t('pub.actions.messageWhatsapp'), switchLabel: 'WhatsApp', href: whatsappHref(wa), external: true });
  if (mobile) message.push({ key: 'sms', icon: 'message', label: t('pub.actions.messageSms'), switchLabel: 'SMS', href: smsHref(mobile) });

  const call: Channel[] = [];
  if (mobile) call.push({ key: 'mobile', icon: 'phone', label: t('pub.actions.callMobile'), switchLabel: t('pub.actions.mobile'), href: telHref(mobile) });
  if (pro) call.push({ key: 'pro', icon: 'phone', label: t('pub.actions.callPro'), switchLabel: t('pub.actions.pro'), href: telHref(pro) });
  // Un seul numéro : le bouton s'appelle simplement « Appeler ».
  if (call.length === 1) call[0] = { ...call[0]!, label: t('pub.actions.call') };

  return (
    <>
      {message.length > 0 && <Split channels={message} blockId={profile.id} ctx={ctx} primary />}
      {call.length > 0 && <Split channels={call} blockId={profile.id} ctx={ctx} primary={message.length === 0} />}
    </>
  );
}
