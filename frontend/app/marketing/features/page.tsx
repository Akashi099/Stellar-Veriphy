import Link from "next/link";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/landing/Header";
import { FiArrowLeft, FiCheck } from "react-icons/fi";

export const metadata = {
  title: "Features",
  description: "Explore StellarVeriphy's powerful verification features",
};

export default function FeaturesPage() {
  const features = [
    {
      category: "Verification Engine",
      items: [
        "Multi-format content verification (images, videos, documents, metadata)",
        "Cryptographic hash validation with SHA-256 and advanced algorithms",
        "Real-time verification with millisecond response times",
        "Batch verification for processing multiple assets simultaneously",
        "Custom verification rules and templates",
      ],
    },
    {
      category: "Provenance Tracking",
      items: [
        "Complete content origin tracking and chain of custody",
        "Timestamp verification on the Stellar blockchain",
        "Immutable audit logs for compliance and regulatory requirements",
        "Geographic verification data and metadata preservation",
        "Multi-signature support for collaborative verification",
      ],
    },
    {
      category: "Integration & API",
      items: [
        "RESTful API with comprehensive documentation",
        "Webhook support for real-time verification notifications",
        "SDKs for popular programming languages (JavaScript, Python, Go, Rust)",
        "GraphQL endpoint for flexible data queries",
        "Rate limiting and quota management per tier",
      ],
    },
    {
      category: "Analytics & Reporting",
      items: [
        "Real-time verification analytics dashboard",
        "Custom report generation and export",
        "Verification trends and insights",
        "Usage metrics and performance monitoring",
        "Export data in multiple formats (JSON, CSV, PDF)",
      ],
    },
    {
      category: "Security & Compliance",
      items: [
        "Enterprise-grade encryption (TLS 1.3, AES-256)",
        "GDPR and CCPA compliance",
        "SOC 2 Type II certification",
        "Role-based access control (RBAC)",
        "Two-factor authentication (2FA)",
      ],
    },
    {
      category: "Developer Experience",
      items: [
        "Interactive API playground and sandbox environment",
        "Comprehensive code examples and tutorials",
        "Developer community and support forums",
        "Automated testing tools and SDKs",
        "CI/CD pipeline integration templates",
      ],
    },
  ];

  return (
    <main id="main-content" className="min-h-screen bg-slate-900" aria-label="Features content">
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
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4 sm:mb-6">Powerful Features for Every Use Case</h1>
            <p className="text-lg sm:text-xl text-gray-300 max-w-3xl">
              Comprehensive verification capabilities built for enterprises, from content authentication to provenance tracking and compliance reporting.
            </p>
          </div>
        </section>

        {/* Features Grid */}
        <section className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8" aria-label="Features details">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 sm:gap-12">
              {features.map((feature, index) => (
                <div key={index} className="p-6 sm:p-8 bg-slate-800 rounded-lg border border-slate-700 hover:border-slate-600 transition-colors">
                  <h2 className="text-xl sm:text-2xl font-bold text-white mb-4 sm:mb-6">{feature.category}</h2>
                  <ul className="space-y-3 sm:space-y-4">
                    {feature.items.map((item, itemIndex) => (
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

        {/* Comparison Table Section */}
        <section className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8 bg-slate-800" aria-label="Plan comparison">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-bold text-white text-center mb-12 sm:mb-16">Choose Your Plan</h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b-2 border-slate-700">
                    <th className="text-left py-4 px-4 sm:px-6 text-white font-semibold text-sm sm:text-base">Feature</th>
                    <th className="text-center py-4 px-4 sm:px-6 text-white font-semibold text-sm sm:text-base">Starter</th>
                    <th className="text-center py-4 px-4 sm:px-6 text-white font-semibold text-sm sm:text-base">Professional</th>
                    <th className="text-center py-4 px-4 sm:px-6 text-white font-semibold text-sm sm:text-base">Enterprise</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { feature: "API Calls/Month", starter: "10K", professional: "1M", enterprise: "Unlimited" },
                    { feature: "Batch Verification", starter: "Up to 100", professional: "Up to 10K", enterprise: "Unlimited" },
                    { feature: "Custom Rules", starter: "No", professional: "Yes", enterprise: "Yes" },
                    { feature: "Priority Support", starter: "No", professional: "Business hours", enterprise: "24/7" },
                    { feature: "SLA Guarantee", starter: "99.5%", professional: "99.9%", enterprise: "99.99%" },
                    { feature: "Analytics Dashboard", starter: "Basic", professional: "Advanced", enterprise: "Custom" },
                  ].map((row, index) => (
                    <tr key={index} className="border-b border-slate-700 hover:bg-slate-700/50 transition-colors">
                      <td className="py-4 px-4 sm:px-6 text-gray-300 text-sm sm:text-base">{row.feature}</td>
                      <td className="py-4 px-4 sm:px-6 text-center text-gray-300 text-sm sm:text-base">{row.starter}</td>
                      <td className="py-4 px-4 sm:px-6 text-center text-gray-300 text-sm sm:text-base">{row.professional}</td>
                      <td className="py-4 px-4 sm:px-6 text-center text-green-400 font-semibold text-sm sm:text-base">{row.enterprise}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <Footer />
      </div>
    </main>
  );
}
