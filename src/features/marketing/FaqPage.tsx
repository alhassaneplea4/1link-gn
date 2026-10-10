import { useRef } from 'react';
import { useDocumentTitle, useRevealOnScroll } from '@/hooks/dom';
import { useT } from '@/i18n/core';
import { FaqSection, FinalCta } from './commerce';
import './marketing.css';

export default function FaqPage() {
  const t = useT('marketing');
  useDocumentTitle(`${t('marketing.pages.faq.title')} · 1Link`);
  const root = useRef<HTMLDivElement>(null);
  useRevealOnScroll(root);
  return (
    <div ref={root} className="subpage">
      <FaqSection headingLevel={1} />
      <FinalCta />
    </div>
  );
}
