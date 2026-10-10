import { useRef } from 'react';
import { useDocumentTitle } from '@/hooks/dom';
import { useRevealOnScroll } from '@/hooks/dom';
import { useT } from '@/i18n/core';
import { AnalyticsPreview, FaqSection, FinalCta, PricingSection } from './commerce';
import { CustomizeSection, DemoSection, Hero } from './hero-demo';
import { AudiencesSection, FeaturesSection, HowSection, ProblemSection, SolutionSection } from './story';
import './marketing.css';

export default function HomePage() {
  const t = useT('common');
  useDocumentTitle(`1Link — ${t('common.slogan')}`);
  const root = useRef<HTMLDivElement>(null);
  useRevealOnScroll(root);
  return (
    <div ref={root}>
      <Hero />
      <DemoSection />
      <ProblemSection />
      <SolutionSection />
      <HowSection />
      <AudiencesSection />
      <CustomizeSection />
      <FeaturesSection />
      <AnalyticsPreview />
      <PricingSection />
      <FaqSection />
      <FinalCta />
    </div>
  );
}
