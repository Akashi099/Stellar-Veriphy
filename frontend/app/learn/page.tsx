import Link from "next/link";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/landing/Header";
import { FiArrowRight, FiBook, FiAward, FiLayout, FiTool } from "react-icons/fi";

export const metadata = {
  title: "Learn",
  description: "Educational materials and resources for blockchain verification",
};

export default function LearnPage() {
  const sections = [
    {
      icon: FiBook,
      title: "Blockchain Basics",
      description: "Understand the fundamentals of blockchain technology and how it enables verification",
      href: "/learn/blockchain-basics",
      topics: ["What is Blockchain?", "How Verification Works", "Cryptographic Hashing", "Distributed Ledgers"],
    },
    {
      icon: FiLayout,
      title: "Platform Guide",
      description: "Complete documentation on how StellarVeriphy works and how to use it",
      href: "/learn/platform-guide",
      topics: ["Getting Started", "Core Concepts", "Verification Process", "API Overview"],
    },
    {
      icon: FiAward,
      title: "Case Studies",
      description: "Real-world examples of how organizations use StellarVeriphy",
      href: "/learn/case-studies",
      topics: ["Media Verification", "Healthcare", "Supply Chain", "Digital Assets"],
    },
    {
      icon: FiBook,
      title: "Best Practices",
      description: "Learn operational guidance and best practices for content verification",
      href: "/learn/best-practices",
      topics: ["Verification Strategy", "Integration Patterns", "Error Handling", "Performance Optimization"],
    },
    {
      icon: FiTool,
      title: "Interactive Tools",
      description: "Hands-on tools and playground for learning and experimentation",
      href: "/learn/interactive-tools",
      topics: ["Hash Generator", "Verification Simulator", "Code Playground", "Live Examples"],
    },
  ];

  return (
    <main id="main-content" className="min-h-screen bg-slate-900" aria-label="Learning content">
      <Header />
      <div className="pt-16">
        {/* Hero Section */}
        <section className="min-h-[60svh] flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900 px-4 py-12">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-white mb-4 sm:mb-6">Learn Blockchain Verification</h1>
            <p className="text-lg sm:text-xl text-gray-300 mb-8 sm:mb-12 max-w-2xl mx-auto">
              Master the concepts and techniques behind decentralized content verification on the Stellar blockchain.
            </p>
          </div>
        </section>

        {/* Learning Paths */}
        <section className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8" aria-label="Learning paths">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-bold text-white text-center mb-4 sm:mb-6">Choose Your Learning Path</h2>
            <p className="text-center text-gray-300 mb-12 sm:mb-16 max-w-2xl mx-auto">
              Select a learning path that matches your goals and experience level.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
              {sections.map((section, index) => {
                const Icon = section.icon;
                return (
                  <Link
                    key={index}
                    href={section.href}
                    className="group p-6 sm:p-8 bg-slate-800 rounded-lg border border-slate-700 hover:border-blue-600 hover:shadow-lg hover:shadow-blue-900/50 transition-all"
                  >
                    <div className="flex items-center gap-4 mb-4 sm:mb-6">
                      <Icon className="w-8 h-8 sm:w-10 sm:h-10 text-blue-400 group-hover:scale-110 transition-transform" aria-hidden="true" />
                      <h2 className="text-xl sm:text-2xl font-bold text-white group-hover:text-blue-400 transition-colors">{section.title}</h2>
                    </div>

                    <p className="text-gray-300 text-sm sm:text-base mb-6 group-hover:text-gray-200 transition-colors">{section.description}</p>

                    <div className="space-y-2 mb-6">
                      {section.topics.map((topic, topicIndex) => (
                        <div key={topicIndex} className="flex items-center gap-2 text-gray-400 text-sm">
                          <span className="text-blue-400">→</span>
                          <span>{topic}</span>
                        </div>
                      ))}
                    </div>

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

        {/* Learning Resources */}
        <section className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8 bg-slate-800" aria-label="Additional resources">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-bold text-white text-center mb-12 sm:mb-16">Additional Resources</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
              {[
                {
                  title: "Video Tutorials",
                  description: "Step-by-step video guides for getting started with StellarVeriphy",
                  count: "12 videos",
                  icon: "🎥",
                },
                {
                  title: "Documentation",
                  description: "Comprehensive API documentation and technical reference",
                  count: "50+ pages",
                  icon: "📚",
                },
                {
                  title: "Code Examples",
                  description: "Ready-to-use code examples in multiple programming languages",
                  count: "30+ examples",
                  icon: "💻",
                },
                {
                  title: "Community Forum",
                  description: "Connect with other developers and get answers to your questions",
                  count: "3000+ members",
                  icon: "👥",
                },
                {
                  title: "Webinars",
                  description: "Live webinars and Q&A sessions with our team",
                  count: "2 per month",
                  icon: "📹",
                },
                {
                  title: "Certifications",
                  description: "Earn verified credentials by completing courses",
                  count: "5 tracks",
                  icon: "🏆",
                },
              ].map((resource, index) => (
                <div key={index} className="p-6 sm:p-8 bg-slate-700 rounded-lg hover:bg-slate-600 transition-colors border border-slate-600">
                  <div className="text-3xl sm:text-4xl mb-3 sm:mb-4">{resource.icon}</div>
                  <h3 className="text-lg sm:text-xl font-semibold text-white mb-2 sm:mb-3">{resource.title}</h3>
                  <p className="text-gray-300 text-sm sm:text-base mb-4">{resource.description}</p>
                  <p className="text-blue-400 font-semibold text-sm">{resource.count}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-blue-900 to-slate-900" aria-label="Call to action">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4 sm:mb-6">Ready to Learn?</h2>
            <p className="text-lg text-gray-300 mb-8 sm:mb-12">
              Start with the blockchain basics or jump straight to the platform guide.
            </p>
            <Link
              href="/learn/blockchain-basics"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-white text-blue-900 font-semibold rounded-lg hover:bg-gray-100 transition-all focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-blue-900 active:scale-95"
              aria-label="Start learning blockchain basics"
            >
              Start Learning
              <FiArrowRight className="w-5 h-5" aria-hidden="true" />
            </Link>
          </div>
        </section>

        <Footer />
      </div>
    </main>
  );
}
