import Link from "next/link";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/landing/Header";
import { FiArrowLeft, FiArrowRight } from "react-icons/fi";

export const metadata = {
  title: "SDK Documentation",
  description: "SDKs for integrating StellarVeriphy",
};

const sdks = [
  {
    name: "JavaScript/TypeScript",
    description: "Official SDK for JavaScript and TypeScript applications",
    version: "2.1.0",
    install: "npm install @stellarveriphy/sdk",
    github: "https://github.com/Stellar-Veriphy/sdk-js",
    features: ["TypeScript support", "Promise-based API", "Webhook listeners", "Batch operations"],
  },
  {
    name: "Python",
    description: "Python SDK for StellarVeriphy integration",
    version: "1.8.2",
    install: "pip install stellarveriphy",
    github: "https://github.com/Stellar-Veriphy/sdk-python",
    features: ["Async support", "Type hints", "CLI tools", "Pytest fixtures"],
  },
  {
    name: "Go",
    description: "High-performance Go SDK for systems programming",
    version: "1.5.1",
    install: "go get github.com/Stellar-Veriphy/sdk-go",
    github: "https://github.com/Stellar-Veriphy/sdk-go",
    features: ["Goroutines support", "Connection pooling", "Metrics", "Context support"],
  },
  {
    name: "Rust",
    description: "Memory-safe Rust SDK with excellent performance",
    version: "1.2.0",
    install: "cargo add stellarveriphy",
    github: "https://github.com/Stellar-Veriphy/sdk-rust",
    features: ["No unsafe code", "Zero-copy operations", "Custom types", "Macros"],
  },
];

export default function SdkDocsPage() {
  return (
    <main id="main-content" className="min-h-screen bg-slate-900" aria-label="SDK documentation">
      <Header />
      <div className="pt-16">
        {/* Hero Section */}
        <section className="py-12 sm:py-16 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-slate-800 to-slate-900">
          <div className="max-w-6xl mx-auto">
            <Link
              href="/developer"
              className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 mb-6 sm:mb-8 transition-colors"
              aria-label="Back to developer portal"
            >
              <FiArrowLeft className="w-4 h-4" aria-hidden="true" />
              Back to Developer Portal
            </Link>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4 sm:mb-6">SDK Documentation</h1>
            <p className="text-lg sm:text-xl text-gray-300 max-w-3xl">
              Official SDKs in your favorite programming language to easily integrate StellarVeriphy.
            </p>
          </div>
        </section>

        {/* SDK Cards */}
        <section className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8" aria-label="Available SDKs">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
              {sdks.map((sdk, index) => (
                <div key={index} className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden hover:border-blue-600 transition-colors">
                  <div className="p-6 sm:p-8">
                    <div className="flex items-start justify-between mb-4">
                      <h2 className="text-xl sm:text-2xl font-bold text-white">{sdk.name}</h2>
                      <span className="text-xs font-bold text-blue-400 bg-blue-900/50 px-2 py-1 rounded">v{sdk.version}</span>
                    </div>

                    <p className="text-gray-300 text-sm sm:text-base mb-6">{sdk.description}</p>

                    <div className="bg-slate-900 rounded p-3 mb-6">
                      <p className="text-xs text-gray-400 mb-2">Installation:</p>
                      <code className="text-gray-300 text-xs sm:text-sm font-mono break-all">{sdk.install}</code>
                    </div>

                    <div className="space-y-2 mb-6">
                      <p className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Features:</p>
                      {sdk.features.map((feature, featureIndex) => (
                        <div key={featureIndex} className="flex items-center gap-2">
                          <span className="text-green-400">✓</span>
                          <span className="text-gray-300 text-sm">{feature}</span>
                        </div>
                      ))}
                    </div>

                    <a
                      href={sdk.github}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 font-semibold text-sm"
                    >
                      GitHub Repository
                      <FiArrowRight className="w-4 h-4" aria-hidden="true" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Installation Guide */}
        <section className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8 bg-slate-800" aria-label="Installation guides">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-bold text-white text-center mb-12 sm:mb-16">Quick Start with JavaScript</h2>

            <div className="space-y-8">
              <div>
                <h3 className="text-lg sm:text-xl font-bold text-blue-400 mb-3 sm:mb-4">1. Install the SDK</h3>
                <pre className="bg-slate-900 text-gray-300 p-4 rounded text-xs sm:text-sm font-mono overflow-x-auto">
                  <code>npm install @stellarveriphy/sdk</code>
                </pre>
              </div>

              <div>
                <h3 className="text-lg sm:text-xl font-bold text-blue-400 mb-3 sm:mb-4">2. Initialize Client</h3>
                <pre className="bg-slate-900 text-gray-300 p-4 rounded text-xs sm:text-sm font-mono overflow-x-auto">
                  <code>{`import { StellarVeriphy } from '@stellarveriphy/sdk';

const client = new StellarVeriphy({
  apiKey: 'your_api_key_here',
  network: 'stellar_testnet'
});`}</code>
                </pre>
              </div>

              <div>
                <h3 className="text-lg sm:text-xl font-bold text-blue-400 mb-3 sm:mb-4">3. Verify Content</h3>
                <pre className="bg-slate-900 text-gray-300 p-4 rounded text-xs sm:text-sm font-mono overflow-x-auto">
                  <code>{`const verification = await client.verify({
  content: fileBuffer,
  contentType: 'image/png',
  metadata: { source: 'original' }
});

console.log('Verification ID:', verification.id);
console.log('Hash:', verification.hash);`}</code>
                </pre>
              </div>
            </div>
          </div>
        </section>

        {/* SDK Comparison */}
        <section className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8" aria-label="SDK comparison">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-bold text-white text-center mb-12 sm:mb-16">SDK Feature Comparison</h2>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b-2 border-slate-700">
                    <th className="text-left py-4 px-4 sm:px-6 text-white font-semibold text-sm sm:text-base">Feature</th>
                    <th className="text-center py-4 px-4 sm:px-6 text-white font-semibold text-sm sm:text-base">JS/TS</th>
                    <th className="text-center py-4 px-4 sm:px-6 text-white font-semibold text-sm sm:text-base">Python</th>
                    <th className="text-center py-4 px-4 sm:px-6 text-white font-semibold text-sm sm:text-base">Go</th>
                    <th className="text-center py-4 px-4 sm:px-6 text-white font-semibold text-sm sm:text-base">Rust</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { feature: "Async/Await", js: "✓", py: "✓", go: "✓", rs: "✓" },
                    { feature: "Type Safety", js: "✓", py: "✓", go: "✓", rs: "✓" },
                    { feature: "Batch Ops", js: "✓", py: "✓", go: "✓", rs: "✓" },
                    { feature: "Webhooks", js: "✓", py: "✓", go: "✓", rs: "✓" },
                    { feature: "CLI Tools", js: "✓", py: "✓", go: "✓", rs: "⚪" },
                    { feature: "Streaming", js: "✓", py: "✓", go: "✓", rs: "✓" },
                  ].map((row, index) => (
                    <tr key={index} className="border-b border-slate-700 hover:bg-slate-800 transition-colors">
                      <td className="py-4 px-4 sm:px-6 text-gray-300 text-sm sm:text-base">{row.feature}</td>
                      <td className="py-4 px-4 sm:px-6 text-center text-gray-300 text-sm sm:text-base">{row.js}</td>
                      <td className="py-4 px-4 sm:px-6 text-center text-gray-300 text-sm sm:text-base">{row.py}</td>
                      <td className="py-4 px-4 sm:px-6 text-center text-gray-300 text-sm sm:text-base">{row.go}</td>
                      <td className="py-4 px-4 sm:px-6 text-center text-gray-300 text-sm sm:text-base">{row.rs}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Next Steps */}
        <section className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-blue-900 to-slate-900" aria-label="Next steps">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4 sm:mb-6">Ready to Code?</h2>
            <p className="text-lg text-gray-300 mb-8 sm:mb-12">
              Check out code examples for your language or explore the playground.
            </p>
            <Link
              href="/developer/examples"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-white text-blue-900 font-semibold rounded-lg hover:bg-gray-100 transition-all focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-blue-900 active:scale-95"
              aria-label="View code examples"
            >
              Code Examples
              <FiArrowRight className="w-5 h-5" aria-hidden="true" />
            </Link>
          </div>
        </section>

        <Footer />
      </div>
    </main>
  );
}
