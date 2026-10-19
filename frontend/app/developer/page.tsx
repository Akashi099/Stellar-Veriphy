import Link from "next/link";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/landing/Header";
import { FiArrowRight, FiCode, FiBook, FiGithub, FiUsers } from "react-icons/fi";

export const metadata = {
  title: "Developer Portal",
  description: "Complete developer resources for StellarVeriphy integration",
};

export default function DeveloperPortalPage() {
  const sections = [
    {
      icon: FiBook,
      title: "API Documentation",
      description: "Complete reference for all StellarVeriphy APIs and endpoints",
      href: "/developer/api-docs",
      features: [
        "RESTful API endpoints",
        "GraphQL queries and mutations",
        "Request/response examples",
        "Authentication methods",
      ],
    },
    {
      icon: FiCode,
      title: "SDK Documentation",
      description: "Detailed guides for all supported SDKs",
      href: "/developer/sdk-docs",
      features: [
        "JavaScript/TypeScript SDK",
        "Python SDK",
        "Go SDK",
        "Rust SDK",
      ],
    },
    {
      icon: FiGithub,
      title: "Code Examples",
      description: "Ready-to-use code examples for common tasks",
      href: "/developer/examples",
      features: [
        "Single file verification",
        "Batch processing",
        "Webhook integration",
        "Advanced workflows",
      ],
    },
    {
      icon: FiCode,
      title: "Interactive Playground",
      description: "Test APIs and code in a sandbox environment",
      href: "/developer/playground",
      features: [
        "API sandbox",
        "Code execution",
        "Request builder",
        "Response inspector",
      ],
    },
    {
      icon: FiBook,
      title: "Tutorials",
      description: "Step-by-step guides for building with StellarVeriphy",
      href: "/developer/tutorials",
      features: [
        "Getting started guide",
        "Build your first app",
        "Authentication flows",
        "Production deployment",
      ],
    },
    {
      icon: FiUsers,
      title: "Community",
      description: "Connect with developers and get support",
      href: "/developer/community",
      features: [
        "Developer forums",
        "Discord community",
        "GitHub discussions",
        "Stack Overflow tag",
      ],
    },
  ];

  return (
    <main id="main-content" className="min-h-screen bg-slate-900" aria-label="Developer portal">
      <Header />
      <div className="pt-16">
        {/* Hero Section */}
        <section className="min-h-[60svh] flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900 px-4 py-12">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-white mb-4 sm:mb-6">Developer Portal</h1>
            <p className="text-lg sm:text-xl text-gray-300 mb-8 sm:mb-12 max-w-2xl mx-auto">
              Everything you need to integrate StellarVeriphy into your applications. APIs, SDKs, examples, and more.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/developer/api-docs"
                className="inline-flex items-center justify-center gap-2 px-6 sm:px-8 py-3 sm:py-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-slate-900 active:scale-95 text-base sm:text-lg"
                aria-label="View API docs"
              >
                API Docs
                <FiArrowRight className="w-5 h-5" aria-hidden="true" />
              </Link>
              <Link
                href="/developer/playground"
                className="inline-flex items-center justify-center gap-2 px-6 sm:px-8 py-3 sm:py-4 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-slate-900 active:scale-95 text-base sm:text-lg"
                aria-label="Try playground"
              >
                Try Playground
              </Link>
            </div>
          </div>
        </section>

        {/* Resources Grid */}
        <section className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8" aria-label="Developer resources">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-bold text-white text-center mb-12 sm:mb-16">Essential Resources</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
              {sections.map((section, index) => {
                const Icon = section.icon;
                return (
                  <Link
                    key={index}
                    href={section.href}
                    className="group p-6 sm:p-8 bg-slate-800 rounded-lg border border-slate-700 hover:border-blue-600 hover:shadow-lg hover:shadow-blue-900/50 transition-all"
                  >
                    <Icon className="w-8 h-8 sm:w-10 sm:h-10 text-blue-400 mb-4 group-hover:scale-110 transition-transform" aria-hidden="true" />
                    <h2 className="text-xl sm:text-2xl font-bold text-white mb-2 group-hover:text-blue-400 transition-colors">{section.title}</h2>
                    <p className="text-gray-300 text-sm sm:text-base mb-6 group-hover:text-gray-200 transition-colors">{section.description}</p>

                    <ul className="space-y-2 mb-6">
                      {section.features.map((feature, featureIndex) => (
                        <li key={featureIndex} className="flex items-center gap-2 text-gray-400 text-sm">
                          <span className="text-blue-400">→</span>
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>

                    <div className="flex items-center gap-2 text-blue-400 font-semibold group-hover:gap-3 transition-all">
                      Explore
                      <FiArrowRight className="w-4 h-4" aria-hidden="true" />
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>

        {/* Quick Links */}
        <section className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8 bg-slate-800" aria-label="Quick links">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-bold text-white text-center mb-12 sm:mb-16">Quick Start</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
              {[
                {
                  title: "Get API Key",
                  description: "Create your first project and get API credentials",
                  button: "Create Account",
                  icon: "🔑",
                },
                {
                  title: "Read the Docs",
                  description: "Comprehensive documentation to get started",
                  button: "View Docs",
                  icon: "📖",
                },
                {
                  title: "Join Community",
                  description: "Connect with thousands of developers",
                  button: "Join Discord",
                  icon: "👥",
                },
              ].map((item, index) => (
                <div key={index} className="p-6 sm:p-8 bg-slate-700 rounded-lg border border-slate-600 hover:border-blue-600 transition-colors">
                  <div className="text-4xl mb-4">{item.icon}</div>
                  <h3 className="text-lg sm:text-xl font-bold text-white mb-2 sm:mb-3">{item.title}</h3>
                  <p className="text-gray-300 text-sm sm:text-base mb-4 sm:mb-6">{item.description}</p>
                  <button className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded transition-colors text-sm">
                    {item.button}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Status & Support */}
        <section className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8" aria-label="Status and support">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-bold text-white text-center mb-12 sm:mb-16">Status & Support</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
              <div className="p-6 sm:p-8 bg-slate-800 rounded-lg border border-slate-700">
                <h3 className="text-xl sm:text-2xl font-bold text-white mb-4">System Status</h3>
                <div className="space-y-3">
                  {[
                    { service: "API Service", status: "Operational", icon: "🟢" },
                    { service: "Developer Portal", status: "Operational", icon: "🟢" },
                    { service: "Sandbox Environment", status: "Operational", icon: "🟢" },
                    { service: "Dashboard", status: "Operational", icon: "🟢" },
                  ].map((item, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-slate-700 rounded">
                      <span className="text-gray-300 text-sm sm:text-base">{item.service}</span>
                      <div className="flex items-center gap-2">
                        <span>{item.icon}</span>
                        <span className="text-green-400 text-sm font-semibold">{item.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-6 sm:p-8 bg-slate-800 rounded-lg border border-slate-700">
                <h3 className="text-xl sm:text-2xl font-bold text-white mb-4">Get Help</h3>
                <div className="space-y-3">
                  {[
                    { title: "Documentation", href: "/developer/api-docs" },
                    { title: "Community Forum", href: "/developer/community" },
                    { title: "GitHub Issues", href: "https://github.com/Stellar-Veriphy" },
                    { title: "Discord Support", href: "/developer/community" },
                  ].map((item, index) => (
                    <Link
                      key={index}
                      href={item.href}
                      className="block p-3 bg-slate-700 rounded hover:bg-slate-600 transition-colors text-blue-400 hover:text-blue-300 text-sm sm:text-base"
                    >
                      {item.title} →
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <Footer />
      </div>
    </main>
  );
}
