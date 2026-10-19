import Link from "next/link";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/landing/Header";
import { FiArrowRight, FiCheck, FiStar } from "react-icons/fi";

export const metadata = {
  title: "Marketing",
  description: "Discover StellarVeriphy - The Truth Engine for the Stellar Ecosystem",
};

export default function MarketingPage() {
  return (
    <main id="main-content" className="min-h-screen bg-slate-900 scroll-smooth" aria-label="Marketing content">
      <Header />
      <div className="pt-16">
        {/* Hero Section */}
        <section
          className="min-h-[100svh] flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-4 py-12"
          aria-label="Marketing hero section"
        >
          <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-white mb-4 sm:mb-6 leading-tight">
              Transform Digital Trust
            </h1>
            <p className="text-lg sm:text-xl md:text-2xl text-gray-300 mb-6 sm:mb-8 leading-relaxed">
              Enterprise-Grade Content Verification on Stellar
            </p>
            <p className="text-base sm:text-lg text-gray-400 mb-8 sm:mb-12 max-w-2xl mx-auto px-2 sm:px-0 leading-relaxed">
              Cryptographically prove the authenticity and origin of any digital asset with decentralized verification powered by Stellar blockchain.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/"
                className="inline-flex items-center justify-center gap-2 px-6 sm:px-8 py-3 sm:py-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-slate-900 focus:scale-105 active:scale-95 min-h-[44px] sm:min-h-[48px] text-base sm:text-lg"
                aria-label="Try the application"
              >
                Try Now
                <FiArrowRight className="w-4 h-4 sm:w-5 sm:h-5" aria-hidden="true" />
              </Link>
              <Link
                href="/marketing/features"
                className="inline-flex items-center justify-center gap-2 px-6 sm:px-8 py-3 sm:py-4 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-slate-900 focus:scale-105 active:scale-95 min-h-[44px] sm:min-h-[48px] text-base sm:text-lg"
                aria-label="Explore features"
              >
                Explore Features
              </Link>
            </div>

            <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
              <div className="absolute top-1/4 left-1/4 w-64 h-64 sm:w-80 sm:h-80 bg-blue-500/10 rounded-full blur-3xl"></div>
              <div className="absolute bottom-1/4 right-1/4 w-48 h-48 sm:w-64 sm:h-64 bg-purple-500/10 rounded-full blur-3xl"></div>
            </div>
          </div>
        </section>

        {/* Value Proposition Section */}
        <section className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8 bg-slate-800" aria-label="Value proposition">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white text-center mb-4 sm:mb-6">Why Choose StellarVeriphy?</h2>
            <p className="text-center text-gray-300 mb-12 sm:mb-16 max-w-2xl mx-auto text-base sm:text-lg">
              Enterprise security meets decentralized trust. Verify content at scale with cryptographic certainty.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
              {[
                {
                  icon: "🔐",
                  title: "Cryptographically Secure",
                  description: "Leveraging Stellar blockchain for immutable verification",
                },
                {
                  icon: "⚡",
                  title: "Lightning Fast",
                  description: "Verify content in seconds with Stellar's high-performance network",
                },
                {
                  icon: "🌍",
                  title: "Globally Accessible",
                  description: "Decentralized architecture means no single point of failure",
                },
                {
                  icon: "📊",
                  title: "Detailed Analytics",
                  description: "Track verification history and content provenance",
                },
                {
                  icon: "🔗",
                  title: "Easy Integration",
                  description: "Simple APIs for seamless integration into existing workflows",
                },
                {
                  icon: "💰",
                  title: "Cost Effective",
                  description: "Minimal fees with transparent, predictable pricing",
                },
              ].map((feature, index) => (
                <div key={index} className="p-6 sm:p-8 bg-slate-700 rounded-lg hover:bg-slate-600 transition-colors border border-slate-600">
                  <div className="text-3xl sm:text-4xl mb-3 sm:mb-4">{feature.icon}</div>
                  <h3 className="text-lg sm:text-xl font-semibold text-white mb-2 sm:mb-3">{feature.title}</h3>
                  <p className="text-gray-300 text-sm sm:text-base">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-blue-900 to-slate-900" aria-label="Call to action">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4 sm:mb-6">Ready to Verify at Scale?</h2>
            <p className="text-lg sm:text-xl text-gray-300 mb-8 sm:mb-12">
              Join enterprises that trust StellarVeriphy for content verification and provenance.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/"
                className="inline-flex items-center justify-center gap-2 px-6 sm:px-8 py-3 sm:py-4 bg-white text-blue-900 font-semibold rounded-lg hover:bg-gray-100 transition-all focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-blue-900 focus:scale-105 active:scale-95 min-h-[44px] sm:min-h-[48px] text-base sm:text-lg"
                aria-label="Start free trial"
              >
                Start Free Trial
                <FiArrowRight className="w-4 h-4 sm:w-5 sm:h-5" aria-hidden="true" />
              </Link>
              <Link
                href="/marketing/features"
                className="inline-flex items-center justify-center gap-2 px-6 sm:px-8 py-3 sm:py-4 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-blue-900 focus:scale-105 active:scale-95 min-h-[44px] sm:min-h-[48px] text-base sm:text-lg"
                aria-label="Schedule a demo"
              >
                Schedule Demo
              </Link>
            </div>
          </div>
        </section>

        <Footer />
      </div>
    </main>
  );
}
