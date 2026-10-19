import Link from "next/link";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/landing/Header";
import { FiArrowLeft, FiArrowRight, FiCheck } from "react-icons/fi";

export const metadata = {
  title: "Best Practices",
  description: "Best practices for effective content verification",
};

export default function BestPracticesPage() {
  const practices = [
    {
      category: "Verification Strategy",
      icon: "📋",
      items: [
        "Define clear verification workflows for your use case",
        "Establish verification policies and standards",
        "Document verification procedures for consistency",
        "Plan for scale: start small and grow gradually",
        "Monitor and adjust your verification process regularly",
      ],
    },
    {
      category: "Integration Patterns",
      icon: "🔌",
      items: [
        "Use async operations for batch verifications",
        "Implement caching to reduce redundant verifications",
        "Design retry logic with exponential backoff",
        "Monitor API usage and quotas proactively",
        "Use webhooks for event-driven workflows",
      ],
    },
    {
      category: "Error Handling",
      icon: "🛡️",
      items: [
        "Implement comprehensive error handling in your code",
        "Log all verification failures for debugging",
        "Provide clear error messages to users",
        "Use status codes properly (4xx vs 5xx)",
        "Implement graceful degradation when service is unavailable",
      ],
    },
    {
      category: "Performance Optimization",
      icon: "⚡",
      items: [
        "Use batch operations for multiple verifications",
        "Optimize content hashing with appropriate algorithms",
        "Cache frequently accessed verification results",
        "Monitor response times and optimize hot paths",
        "Use connection pooling for API requests",
      ],
    },
    {
      category: "Security Best Practices",
      icon: "🔒",
      items: [
        "Store API keys securely (use environment variables)",
        "Use HTTPS for all API communications",
        "Rotate API keys regularly (every 90 days)",
        "Implement rate limiting on your side",
        "Validate all user inputs before verification",
      ],
    },
    {
      category: "Compliance & Governance",
      icon: "⚖️",
      items: [
        "Maintain audit trails of all verifications",
        "Implement data retention policies",
        "Document verification procedures",
        "Regular security and compliance audits",
        "Train team members on verification procedures",
      ],
    },
  ];

  return (
    <main id="main-content" className="min-h-screen bg-slate-900" aria-label="Best practices content">
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
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4 sm:mb-6">Best Practices for Verification</h1>
            <p className="text-lg sm:text-xl text-gray-300 max-w-3xl">
              Proven strategies and practices for implementing effective verification systems with StellarVeriphy.
            </p>
          </div>
        </section>

        {/* Best Practices Grid */}
        <section className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8" aria-label="Best practices">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
              {practices.map((practice, index) => (
                <div key={index} className="p-6 sm:p-8 bg-slate-800 rounded-lg border border-slate-700 hover:border-blue-600 transition-colors">
                  <div className="flex items-center gap-4 mb-4 sm:mb-6">
                    <span className="text-3xl sm:text-4xl">{practice.icon}</span>
                    <h2 className="text-xl sm:text-2xl font-bold text-white">{practice.category}</h2>
                  </div>

                  <ul className="space-y-3 sm:space-y-4">
                    {practice.items.map((item, itemIndex) => (
                      <li key={itemIndex} className="flex items-start gap-3">
                        <FiCheck className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
                        <span className="text-gray-300 text-sm sm:text-base">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Common Pitfalls */}
        <section className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8 bg-slate-800" aria-label="Common pitfalls">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-bold text-white text-center mb-12 sm:mb-16">Avoid These Common Pitfalls</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
              {[
                {
                  pitfall: "Inadequate Error Handling",
                  problem: "Not catching and logging all errors leads to silent failures",
                  solution: "Implement comprehensive error handling and logging at every step",
                },
                {
                  pitfall: "Hardcoded API Keys",
                  problem: "Storing credentials in code exposes security vulnerabilities",
                  solution: "Use environment variables and secure configuration management",
                },
                {
                  pitfall: "Missing Timeout Handling",
                  problem: "Requests hanging indefinitely consume resources",
                  solution: "Set appropriate timeouts on all API requests",
                },
                {
                  pitfall: "No Rate Limiting",
                  problem: "Exceeding API quotas causes service disruptions",
                  solution: "Implement client-side rate limiting and quota monitoring",
                },
                {
                  pitfall: "Poor Monitoring",
                  problem: "Issues go undetected until they impact users",
                  solution: "Set up comprehensive monitoring and alerting",
                },
                {
                  pitfall: "Insufficient Caching",
                  problem: "Repeated verifications waste time and resources",
                  solution: "Cache results appropriately based on content freshness",
                },
              ].map((item, index) => (
                <div key={index} className="p-6 sm:p-8 bg-slate-700 rounded-lg border border-red-900/50 hover:border-red-700 transition-colors">
                  <h3 className="text-lg sm:text-xl font-bold text-red-400 mb-2 sm:mb-3">❌ {item.pitfall}</h3>
                  <p className="text-gray-300 text-sm sm:text-base mb-4">
                    <span className="font-semibold text-gray-400">Problem:</span> {item.problem}
                  </p>
                  <p className="text-gray-300 text-sm sm:text-base">
                    <span className="font-semibold text-green-400">Solution:</span> {item.solution}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Implementation Checklist */}
        <section className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8" aria-label="Implementation checklist">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-bold text-white text-center mb-8 sm:mb-12">Implementation Checklist</h2>

            <div className="space-y-4 sm:space-y-6">
              {[
                "Set up API keys and authentication",
                "Implement error handling and logging",
                "Configure rate limiting and monitoring",
                "Set up webhook receivers for events",
                "Test verification workflow end-to-end",
                "Document your verification procedures",
                "Set up automated tests for your integration",
                "Configure backup/failover strategies",
                "Train team members on the system",
                "Monitor production usage and performance",
              ].map((item, index) => (
                <div key={index} className="flex items-start gap-4 p-4 sm:p-6 bg-slate-800 rounded-lg border border-slate-700">
                  <input type="checkbox" id={`item-${index}`} className="w-5 h-5 mt-0.5 cursor-pointer rounded" />
                  <label htmlFor={`item-${index}`} className="flex-1 text-gray-300 text-sm sm:text-base cursor-pointer">
                    {item}
                  </label>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Next Steps */}
        <section className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-blue-900 to-slate-900" aria-label="Next steps">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4 sm:mb-6">Ready to Get Started?</h2>
            <p className="text-lg text-gray-300 mb-8 sm:mb-12">
              Try our interactive tools to explore StellarVeriphy in action.
            </p>
            <Link
              href="/learn/interactive-tools"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-white text-blue-900 font-semibold rounded-lg hover:bg-gray-100 transition-all focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-blue-900 active:scale-95"
              aria-label="Explore interactive tools"
            >
              Explore Interactive Tools
              <FiArrowRight className="w-5 h-5" aria-hidden="true" />
            </Link>
          </div>
        </section>

        <Footer />
      </div>
    </main>
  );
}
