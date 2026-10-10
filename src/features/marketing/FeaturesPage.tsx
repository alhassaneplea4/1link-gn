import { useRef } from 'react';
import { useDocumentTitle, useRevealOnScroll } from '@/hooks/dom';
import { useT } from '@/i18n/core';
import { AnalyticsPreview, FinalCta } from './commerce';
import { DemoSection } from './hero-demo';
import { FeaturesSection } from './story';
import './marketing.css';

export default function FeaturesPage() {
  const t = useT('marketing');
  useDocumentTitle(`${t('marketing.pages.features.title')} · 1Link`);
  const root = useRef<HTMLDivElement>(null);
  useRevealOnScroll(root);
  return (
    <div ref={root} className="subpage">
      <FeaturesSection headingLevel={1} />
      <DemoSection />
      <AnalyticsPreview />
      <FinalCta />
    </div>
  );
}
