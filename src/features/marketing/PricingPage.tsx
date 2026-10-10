import { useRef } from 'react';
import { useDocumentTitle, useRevealOnScroll } from '@/hooks/dom';
import { useT } from '@/i18n/core';
import { FaqSection, PricingSection } from './commerce';
import './marketing.css';

export default function PricingPage() {
  const t = useT('marketing');
  useDocumentTitle(`${t('marketing.pages.pricing.title')} · 1Link`);
  const root = useRef<HTMLDivElement>(null);
  useRevealOnScroll(root);
  return (
    <div ref={root} className="subpage">
      <PricingSection withComparison headingLevel={1} />
      <FaqSection />
    </div>
  );
}
