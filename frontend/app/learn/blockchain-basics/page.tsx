import Link from "next/link";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/landing/Header";
import { FiArrowLeft, FiArrowRight, FiCheckCircle } from "react-icons/fi";

export const metadata = {
  title: "Blockchain Basics",
  description: "Learn the fundamentals of blockchain technology and verification",
};

export default function BlockchainBasicsPage() {
  const modules = [
    {
      title: "What is Blockchain?",
      description: "Understanding the distributed ledger technology that powers verification",
      topics: [
        "Definition and core concepts",
        "Decentralization and consensus mechanisms",
        "Why blockchain matters for verification",
        "Key advantages and limitations",
      ],
    },
    {
      title: "How Verification Works",
      description: "The technical process of verifying content authenticity on blockchain",
      topics: [
        "Content hashing and fingerprinting",
        "Timestamp verification",
        "Chain of custody documentation",
        "Immutable record creation",
      ],
    },
    {
      title: "Cryptographic Hashing",
      description: "Understanding the cryptographic algorithms that secure verification",
      topics: [
        "What is a cryptographic hash?",
        "SHA-256 algorithm explanation",
        "Hash properties and collision resistance",
        "Creating and comparing hashes",
      ],
    },
    {
      title: "Distributed Ledgers",
      description: "How distributed ledgers enable trust without central authorities",
      topics: [
        "Ledger structure and transactions",
        "Network consensus mechanisms",
        "Stellar's role in verification",
        "Data persistence and retrieval",
      ],
    },
  ];

  return (
    <main id="main-content" className="min-h-screen bg-slate-900" aria-label="Blockchain basics content">
      <Header />
      <div className="pt-16">
        {/* Hero Section */}
        <section className="py-12 sm:py-16 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-slate-800 to-slate-900">
          <div className="max-w-6xl mx-auto">
            <Link
              href="/learn"
              className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 mb-6 sm:mb-8 transition-colors"
              aria-label="Back to learning paths"
            >
              <FiArrowLeft className="w-4 h-4" aria-hidden="true" />
              Back to Learning
            </Link>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4 sm:mb-6">Blockchain Basics</h1>
            <p className="text-lg sm:text-xl text-gray-300 max-w-3xl">
              Master the fundamentals of blockchain technology and understand how it enables secure, decentralized content verification.
            </p>
          </div>
        </section>

        {/* Learning Path */}
        <section className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8" aria-label="Learning modules">
          <div className="max-w-4xl mx-auto">
            <div className="space-y-8 sm:space-y-12">
              {modules.map((module, index) => (
                <div key={index} className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden hover:border-blue-600 transition-colors">
                  <div className="p-6 sm:p-8">
                    <div className="flex items-start gap-4 mb-4">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm">
                        {index + 1}
                      </div>
                      <div className="flex-1">
                        <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">{module.title}</h2>
                        <p className="text-gray-300 text-sm sm:text-base">{module.description}</p>
                      </div>
                    </div>

                    <div className="mt-6 space-y-3">
                      <p className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Topics Covered:</p>
                      {module.topics.map((topic, topicIndex) => (
                        <div key={topicIndex} className="flex items-start gap-3">
                          <FiCheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
                          <span className="text-gray-300 text-sm sm:text-base">{topic}</span>
                        </div>
                      ))}
                    </div>

                    <button className="mt-6 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded transition-colors">
                      View Module
                      <FiArrowRight className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Key Concepts */}
        <section className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8 bg-slate-800" aria-label="Key concepts">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-bold text-white text-center mb-12 sm:mb-16">Key Concepts You'll Learn</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8">
              {[
                {
                  title: "Immutability",
                  description: "Once data is recorded on blockchain, it cannot be changed or deleted",
                  icon: "🔒",
                },
                {
                  title: "Transparency",
                  description: "All transactions and verifications are visible to network participants",
                  icon: "👁️",
                },
                {
                  title: "Decentralization",
                  description: "No single entity controls the network, ensuring fairness and security",
                  icon: "🌐",
                },
                {
                  title: "Consensus",
                  description: "Network participants agree on the validity of transactions",
                  icon: "🤝",
                },
              ].map((concept, index) => (
                <div key={index} className="p-6 sm:p-8 bg-slate-700 rounded-lg hover:bg-slate-600 transition-colors border border-slate-600">
                  <div className="text-3xl sm:text-4xl mb-3 sm:mb-4">{concept.icon}</div>
                  <h3 className="text-lg sm:text-xl font-bold text-white mb-2 sm:mb-3">{concept.title}</h3>
                  <p className="text-gray-300 text-sm sm:text-base">{concept.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Interactive Example */}
        <section className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8" aria-label="Interactive example">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-bold text-white text-center mb-8 sm:mb-12">How Blockchain Verification Works</h2>

            <div className="space-y-6 sm:space-y-8">
              {[
                {
                  step: "1",
                  title: "Content Created",
                  description: "A digital asset (photo, document, etc.) is created and you want to verify it later.",
                },
                {
                  step: "2",
                  title: "Hash Generated",
                  description: "A unique cryptographic hash (fingerprint) is calculated for the content.",
                },
                {
                  step: "3",
                  title: "Blockchain Record",
                  description: "The hash is recorded on the Stellar blockchain with a timestamp.",
                },
                {
                  step: "4",
                  title: "Verification",
                  description: "Later, recalculate the hash and compare it with the blockchain record to confirm authenticity.",
                },
              ].map((item, index) => (
                <div key={index} className="flex gap-4 sm:gap-6">
                  <div className="flex-shrink-0">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold">
                      {item.step}
                    </div>
                  </div>
                  <div className="flex-1 pt-1 sm:pt-2">
                    <h3 className="text-lg sm:text-xl font-semibold text-white mb-2">{item.title}</h3>
                    <p className="text-gray-300 text-sm sm:text-base">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Next Steps */}
        <section className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-blue-900 to-slate-900" aria-label="Next steps">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4 sm:mb-6">Ready for the Next Level?</h2>
            <p className="text-lg text-gray-300 mb-8 sm:mb-12">
              Continue with the platform guide to learn how to use StellarVeriphy.
            </p>
            <Link
              href="/learn/platform-guide"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-white text-blue-900 font-semibold rounded-lg hover:bg-gray-100 transition-all focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-blue-900 active:scale-95"
              aria-label="Go to platform guide"
            >
              Platform Guide
              <FiArrowRight className="w-5 h-5" aria-hidden="true" />
            </Link>
          </div>
        </section>

        <Footer />
      </div>
    </main>
  );
}
