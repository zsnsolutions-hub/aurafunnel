import React from 'react';
import Hero from '../../components/marketing/Hero';
import Logos from '../../components/marketing/Logos';
import Problem from '../../components/marketing/Problem';
import HowItWorks from '../../components/marketing/HowItWorks';
import PlatformOverview from '../../components/marketing/PlatformOverview';
import AIAssistant from '../../components/marketing/AIAssistant';
import Testimonials from '../../components/marketing/Testimonials';
import PricingTeaser from '../../components/marketing/PricingTeaser';
import FAQ from '../../components/marketing/FAQ';
import FinalCTA from '../../components/marketing/FinalCTA';

const LandingPage: React.FC = () => (
  <div className="bg-[#0A1628] text-white">
    <Hero />
    <Logos />
    <Problem />
    <HowItWorks />
    <PlatformOverview />
    <AIAssistant />
    <Testimonials />
    <PricingTeaser />
    <FAQ />
    <FinalCTA />
  </div>
);

export default LandingPage;
