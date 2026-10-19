import Link from "next/link";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/landing/Header";
import { FiArrowLeft, FiArrowRight } from "react-icons/fi";

export const metadata = {
  title: "Use Cases",
  description: "Real-world applications of StellarVeriphy verification",
};

export default function UseCasesPage() {
  const useCases = [
    {
      icon: "📸",
      title: "Media & Journalism",
      description: "Verify the authenticity of photos and videos to combat deepfakes and misinformation",
      benefits: [
        "Cryptographic proof of original source",
        "Timestamp verification for breaking news",
        "Chain of custody for multimedia assets",
        "Compliance with news media standards",
      ],
      industry: "Media",
    },
    {
      icon: "🏥",
      title: "Healthcare & Medical Records",
      description: "Ensure integrity of medical documents, test results, and patient records",
      benefits: [
        "HIPAA-compliant verification",
        "Immutable medical record audit trails",
        "Prevent document tampering",
        "Secure cross-institutional data sharing",
      ],
      industry: "Healthcare",
    },
    {
      icon: "🎓",
      title: "Education & Credentials",
      description: "Verify educational certificates, diplomas, and professional credentials",
      benefits: [
        "Prevent credential fraud",
        "Instant credential verification for employers",
        "Portable digital diplomas",
        "Lifelong learning records",
      ],
      industry: "Education",
    },
    {
      icon: "⚖️",
      title: "Legal & Compliance",
      description: "Maintain tamper-proof records and evidence for legal proceedings",
      benefits: [
        "Admissible digital evidence",
        "Chain of custody documentation",
        "Regulatory compliance proof",
        "Dispute resolution support",
      ],
      industry: "Legal",
    },
    {
      icon: "🏭",
      title: "Supply Chain & Manufacturing",
      description: "Track product origin, authenticity, and manufacturing compliance",
      benefits: [
        "Combat counterfeit products",
        "Track product journey through supply chain",
        "Verify compliance certifications",
        "Enable transparent sourcing",
      ],
      industry: "Manufacturing",
    },
    {
      icon: "🖼️",
      title: "Digital Art & NFTs",
      description: "Prove ownership and authenticity of digital assets and art",
      benefits: [
        "Establish digital ownership",
        "Prevent art forgery",
        "Support emerging NFT markets",
        "Enable digital provenance",
      ],
      industry: "Arts & Culture",
    },
    {
      icon: "🏠",
      title: "Real Estate & Contracts",
      description: "Secure and verify property documents and digital contracts",
      benefits: [
        "Verify property ownership",
        "Prevent document fraud",
        "Streamline contract verification",
        "Compliance with land registry standards",
      ],
      industry: "Real Estate",
    },
    {
      icon: "💎",
      title: "Luxury Goods & Certification",
      description: "Authenticate luxury items, gemstones, and high-value goods",
      benefits: [
        "Combat counterfeit luxury goods",
        "Verify gemstone certifications",
        "Maintain product history",
        "Build consumer trust",
      ],
      industry: "Luxury",
    },
  ];

  return (
    <main id="main-content" className="min-h-screen bg-slate-900" aria-label="Use cases content">
      <Header />
      <div className="pt-16">
        {/* Hero Section */}
        <section className="py-12 sm:py-16 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-slate-800 to-slate-900">
          <div className="max-w-6xl mx-auto">
            <Link
              href="/marketing"
              className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 mb-6 sm:mb-8 transition-colors"
              aria-label="Back to marketing"
            >
              <FiArrowLeft className="w-4 h-4" aria-hidden="true" />
              Back to Marketing
            </Link>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4 sm:mb-6">Real-World Use Cases</h1>
            <p className="text-lg sm:text-xl text-gray-300 max-w-3xl">
              StellarVeriphy serves diverse industries. Discover how organizations use our platform to verify content and ensure authenticity.
            </p>
          </div>
        </section>

        {/* Use Cases Grid */}
        <section className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8" aria-label="Use cases">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
              {useCases.map((useCase, index) => (
                <div key={index} className="p-6 sm:p-8 bg-slate-800 rounded-lg border border-slate-700 hover:border-blue-600 transition-all hover:shadow-lg hover:shadow-blue-900/50">
                  <div className="flex items-start gap-4 mb-4">
                    <div className="text-3xl sm:text-4xl">{useCase.icon}</div>
                    <div className="flex-1">
                      <h2 className="text-lg sm:text-xl font-bold text-white mb-1">{useCase.title}</h2>
                      <span className="inline-block text-xs sm:text-sm bg-blue-900 text-blue-200 px-2 py-1 rounded">
                        {useCase.industry}
                      </span>
                    </div>
                  </div>

                  <p className="text-gray-300 text-sm sm:text-base mb-4 sm:mb-6">{useCase.description}</p>

                  <div className="space-y-2">
                    <p className="text-xs sm:text-sm font-semibold text-gray-400 uppercase tracking-wide">Key Benefits:</p>
                    <ul className="space-y-2">
                      {useCase.benefits.map((benefit, benefitIndex) => (
                        <li key={benefitIndex} className="text-gray-300 text-sm flex items-start gap-2">
                          <span className="text-green-400 font-bold">✓</span>
                          <span>{benefit}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Case Study Section */}
        <section className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8 bg-slate-800" aria-label="Case study example">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-bold text-white text-center mb-8 sm:mb-12">Featured Case Study</h2>

            <div className="bg-slate-700 rounded-lg p-8 sm:p-12 border-l-4 border-blue-600">
              <div className="mb-6 sm:mb-8">
                <h3 className="text-2xl sm:text-3xl font-bold text-white mb-2">Global Media Network Reduces Misinformation</h3>
                <p className="text-sm text-gray-400">Publishing Industry | 5000+ Articles Verified Daily</p>
              </div>

              <div className="space-y-6 mb-8">
                <div>
                  <h4 className="text-lg font-semibold text-blue-400 mb-2">Challenge</h4>
                  <p className="text-gray-300">
                    A major media network was struggling to verify the authenticity of user-submitted photos and detect deepfakes across their global news platform, losing reader trust.
                  </p>
                </div>

                <div>
                  <h4 className="text-lg font-semibold text-blue-400 mb-2">Solution</h4>
                  <p className="text-gray-300">
                    Implemented StellarVeriphy's verification API to automatically verify image authenticity, create immutable verification records on Stellar, and provide verification badges to readers.
                  </p>
                </div>

                <div>
                  <h4 className="text-lg font-semibold text-blue-400 mb-2">Results</h4>
                  <ul className="space-y-2 text-gray-300">
                    <li>• 99.2% accuracy in detecting manipulated images</li>
                    <li>• 78% increase in reader trust scores</li>
                    <li>• 5000+ articles verified daily with response time under 500ms</li>
                    <li>• $2M annual savings on manual verification costs</li>
                  </ul>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {["Media Verification", "Deepfake Detection", "Reader Trust", "Scale"].map((tag, index) => (
                  <span key={index} className="bg-blue-900 text-blue-200 text-xs sm:text-sm px-3 py-1 rounded-full">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-blue-900 to-slate-900" aria-label="Call to action">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4 sm:mb-6">Ready to Solve Your Use Case?</h2>
            <p className="text-lg text-gray-300 mb-8 sm:mb-12">
              Talk to our experts about how StellarVeriphy can verify content in your industry.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-white text-blue-900 font-semibold rounded-lg hover:bg-gray-100 transition-all focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-blue-900 active:scale-95"
                aria-label="Start free trial"
              >
                Start Free Trial
                <FiArrowRight className="w-5 h-5" aria-hidden="true" />
              </Link>
              <Link
                href="/marketing"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-blue-900 active:scale-95"
                aria-label="Contact sales team"
              >
                Contact Sales
              </Link>
            </div>
          </div>
        </section>

        <Footer />
      </div>
    </main>
  );
}
