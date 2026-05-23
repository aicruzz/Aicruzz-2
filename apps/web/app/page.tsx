'use client';

  import {
  Navbar,
  Hero,
  LogoMarquee,
  Features,
  BentoShowcase,
  HowItWorks,
  ModelsShowcase,
  Pricing,
  Testimonials,
  FAQ,
  FinalCTA,
  Footer,
  AmbientBackground,
} from '@/components/landing';

// Root: cinematic marketing landing page.
// Authenticated users are redirected straight to the dashboard.
export default function RootPage() {

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-surface-900 text-slate-200">
      <AmbientBackground />
      <Navbar />
      <Hero />
      <LogoMarquee />
      <Features />
      <BentoShowcase />
      <HowItWorks />
      <ModelsShowcase />
      <Pricing />
      <Testimonials />
      <FAQ />
      <FinalCTA />
      <Footer />
    </main>
  );
}
