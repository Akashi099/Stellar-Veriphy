import Link from "next/link";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/landing/Header";
import { FiArrowLeft, FiArrowRight } from "react-icons/fi";

export const metadata = {
  title: "Interactive Tools",
  description: "Interactive tools and playground for learning verification",
};

export default function InteractiveToolsPage() {
  const tools = [
    {
      icon: "🔐",
      title: "Hash Generator",
      description: "Generate cryptographic hashes for any content to understand how verification works",
      features: [
        "Support for multiple hash algorithms (SHA-256, SHA-512, MD5)",
        "Paste text or upload files",
        "Real-time hash calculation",
        "Copy results with one click",
      ],
    },
    {
      icon: "✅",
      title: "Verification Simulator",
      description: "Simulate the verification process and see how StellarVeriphy validates content",
      features: [
        "Step-by-step verification walkthrough",
        "Visual representation of verification flow",
        "Test with sample content",
        "Understand timestamp and blockchain records",
      ],
    },
    {
      icon: "💻",
      title: "Code Playground",
      description: "Write and test code against StellarVeriphy API in your browser",
      features: [
        "Support for JavaScript, Python, and Go",
        "Pre-written examples and templates",
        "Real API sandbox environment",
        "See results in real-time",
      ],
    },
    {
      icon: "📊",
      title: "Live Examples",
      description: "Browse and learn from real-world verification scenarios",
      features: [
        "Media verification examples",
        "Document authentication samples",
        "Supply chain tracking demos",
        "Digital asset verification cases",
      ],
    },
  ];

  return (
    <main id="main-content" className="min-h-screen bg-slate-900" aria-label="Interactive tools content">
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
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4 sm:mb-6">Interactive Tools</h1>
            <p className="text-lg sm:text-xl text-gray-300 max-w-3xl">
              Hands-on tools and playground to explore StellarVeriphy and learn verification concepts interactively.
            </p>
          </div>
        </section>

        {/* Interactive Tools */}
        <section className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8" aria-label="Available tools">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
              {tools.map((tool, index) => (
                <div key={index} className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden hover:border-blue-600 transition-colors">
                  <div className="p-6 sm:p-8">
                    <div className="text-3xl sm:text-4xl mb-4">{tool.icon}</div>
                    <h2 className="text-xl sm:text-2xl font-bold text-white mb-2 sm:mb-3">{tool.title}</h2>
                    <p className="text-gray-300 text-sm sm:text-base mb-6">{tool.description}</p>

                    <div className="space-y-2 mb-6">
                      {tool.features.map((feature, featureIndex) => (
                        <div key={featureIndex} className="flex items-start gap-2">
                          <span className="text-green-400 font-bold flex-shrink-0">✓</span>
                          <span className="text-gray-300 text-sm">{feature}</span>
                        </div>
                      ))}
                    </div>

                    <button className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded transition-colors text-sm sm:text-base">
                      Launch Tool
                      <FiArrowRight className="w-4 h-4 inline ml-2" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Sample Scenarios */}
        <section className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8 bg-slate-800" aria-label="Sample scenarios">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-bold text-white text-center mb-12 sm:mb-16">Try These Scenarios</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
              {[
                {
                  title: "Verify a Photo",
                  description: "Upload a photo and verify it hasn't been tampered with",
                  steps: ["1. Upload a JPG or PNG image", "2. Generate verification hash", "3. Store on blockchain", "4. Compare future copies"],
                  difficulty: "Beginner",
                },
                {
                  title: "Batch Verification",
                  description: "Verify multiple documents at once using batch processing",
                  steps: ["1. Prepare CSV file with content", "2. Upload batch", "3. Monitor progress", "4. Export results"],
                  difficulty: "Intermediate",
                },
                {
                  title: "API Integration",
                  description: "Build a verification workflow using the API",
                  steps: ["1. Get API credentials", "2. Write verification code", "3. Test in sandbox", "4. Deploy to production"],
                  difficulty: "Advanced",
                },
              ].map((scenario, index) => (
                <div key={index} className="p-6 sm:p-8 bg-slate-700 rounded-lg border border-slate-600 hover:border-blue-600 transition-colors">
                  <div className="flex items-start justify-between mb-4">
                    <h3 className="text-lg sm:text-xl font-bold text-white">{scenario.title}</h3>
                    <span
                      className={`text-xs font-semibold px-3 py-1 rounded-full ${
                        scenario.difficulty === "Beginner"
                          ? "bg-green-900 text-green-200"
                          : scenario.difficulty === "Intermediate"
                            ? "bg-yellow-900 text-yellow-200"
                            : "bg-red-900 text-red-200"
                      }`}
                    >
                      {scenario.difficulty}
                    </span>
                  </div>

                  <p className="text-gray-300 text-sm sm:text-base mb-4 sm:mb-6">{scenario.description}</p>

                  <div className="space-y-2 mb-6">
                    {scenario.steps.map((step, stepIndex) => (
                      <div key={stepIndex} className="flex items-start gap-3">
                        <span className="text-blue-400 font-bold flex-shrink-0">{stepIndex + 1}</span>
                        <span className="text-gray-300 text-sm">{step}</span>
                      </div>
                    ))}
                  </div>

                  <button className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded transition-colors text-sm">
                    Try Scenario
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Learning Resources */}
        <section className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8" aria-label="Learning resources">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-bold text-white text-center mb-12 sm:mb-16">Learning Resources</h2>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 sm:gap-8">
              {[
                {
                  title: "Video Tutorials",
                  icon: "🎥",
                  description: "Step-by-step video guides",
                  count: "12 videos",
                },
                {
                  title: "Code Samples",
                  icon: "💻",
                  description: "Ready-to-use code examples",
                  count: "30+ samples",
                },
                {
                  title: "Documentation",
                  icon: "📚",
                  description: "Complete API documentation",
                  count: "50+ pages",
                },
                {
                  title: "Community Q&A",
                  icon: "💬",
                  description: "Get answers from experts",
                  count: "3000+ topics",
                },
              ].map((resource, index) => (
                <div key={index} className="p-6 sm:p-8 bg-slate-800 rounded-lg border border-slate-700 hover:border-blue-600 transition-colors text-center">
                  <div className="text-3xl sm:text-4xl mb-3 sm:mb-4">{resource.icon}</div>
                  <h3 className="text-lg sm:text-xl font-bold text-white mb-2">{resource.title}</h3>
                  <p className="text-gray-300 text-sm sm:text-base mb-3">{resource.description}</p>
                  <p className="text-blue-400 font-semibold text-sm">{resource.count}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-blue-900 to-slate-900" aria-label="Call to action">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4 sm:mb-6">Ready to Build Something Amazing?</h2>
            <p className="text-lg text-gray-300 mb-8 sm:mb-12">
              Use what you've learned to build your own verification system.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-white text-blue-900 font-semibold rounded-lg hover:bg-gray-100 transition-all focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-blue-900 active:scale-95"
                aria-label="Start building"
              >
                Start Building
                <FiArrowRight className="w-5 h-5" aria-hidden="true" />
              </Link>
              <Link
                href="/learn"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-blue-900 active:scale-95"
                aria-label="Back to learning"
              >
                Back to Learning
              </Link>
            </div>
          </div>
        </section>

        <Footer />
      </div>
    </main>
  );
}
