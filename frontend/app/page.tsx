import { Footer } from "@/components/Footer";
import { AboutSection } from "@/components/landing/AboutSection";
import { CallToActionSection } from "@/components/landing/CallToActionSection";
import { EcosystemSection } from "@/components/landing/EcosystemSection";
import { ExplorePreviewSection } from "@/components/landing/ExplorePreviewSection";
import { Header } from "@/components/landing/Header";
import { HeroSection } from "@/components/landing/HeroSection";
import { HowItWorksSection } from "@/components/landing/HowItWorksSection";

export default function Home() {
  return (
    <main
      id="main-content"
      className="min-h-screen bg-slate-900 scroll-smooth"
      aria-label="Main content"
    >
      <Header />
      <div className="pt-16">
        <HeroSection />
        <AboutSection />
        <HowItWorksSection />
        <ExplorePreviewSection />
        <EcosystemSection />
        <CallToActionSection />
        <Footer />
      </div>
    </main>
  );
}
