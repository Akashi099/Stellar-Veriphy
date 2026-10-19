import Link from "next/link";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/landing/Header";
import { FiArrowLeft, FiArrowRight, FiCheck } from "react-icons/fi";

export const metadata = {
  title: "Platform Guide",
  description: "Complete guide to using StellarVeriphy platform",
};

export default function PlatformGuidePage() {
  const sections = [
    {
      title: "Getting Started",
      description: "Set up your account and make your first verification",
      subsections: [
        "Account creation and configuration",
        "Generating API keys and authentication tokens",
        "Setting up your first project",
        "Making your first API call",
      ],
    },
    {
      title: "Core Concepts",
      description: "Understand the fundamental building blocks of StellarVeriphy",
      subsections: [
        "What are verifications?",
        "Understanding content hashes",
        "Verification records and metadata",
        "Batch operations and bulk verification",
      ],
    },
    {
      title: "Verification Process",
      description: "Step-by-step walkthrough of how verification works",
      subsections: [
        "Uploading content for verification",
        "Real-time verification results",
        "Accessing verification history",
        "Exporting verification reports",
      ],
    },
    {
      title: "API Overview",
      description: "Essential API endpoints and operations",
      subsections: [
        "RESTful API structure",
        "Authentication methods",
        "Request/response formats",
        "Error handling and status codes",
      ],
    },
  ];

  return (
    <main id="main-content" className="min-h-screen bg-slate-900" aria-label="Platform guide content">
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
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4 sm:mb-6">StellarVeriphy Platform Guide</h1>
            <p className="text-lg sm:text-xl text-gray-300 max-w-3xl">
              Complete documentation covering everything you need to know about using the StellarVeriphy platform.
            </p>
          </div>
        </section>

        {/* Guide Sections */}
        <section className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8" aria-label="Platform guide sections">
          <div className="max-w-4xl mx-auto">
            <div className="space-y-8 sm:space-y-12">
              {sections.map((section, index) => (
                <div key={index} className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden hover:border-blue-600 transition-colors">
                  <div className="p-6 sm:p-8">
                    <div className="flex items-start gap-4 mb-4">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm">
                        {index + 1}
                      </div>
                      <div className="flex-1">
                        <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">{section.title}</h2>
                        <p className="text-gray-300 text-sm sm:text-base">{section.description}</p>
                      </div>
                    </div>

                    <div className="mt-6 space-y-3">
                      <p className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Subsections:</p>
                      {section.subsections.map((subsection, subIndex) => (
                        <div key={subIndex} className="flex items-start gap-3">
                          <FiCheck className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
                          <span className="text-gray-300 text-sm sm:text-base">{subsection}</span>
                        </div>
                      ))}
                    </div>

                    <button className="mt-6 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded transition-colors">
                      Read Guide
                      <FiArrowRight className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Code Example */}
        <section className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8 bg-slate-800" aria-label="Code example">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-bold text-white text-center mb-8 sm:mb-12">Quick Start Example</h2>

            <div className="bg-slate-900 rounded-lg border border-slate-700 p-6 sm:p-8 overflow-x-auto">
              <pre className="text-gray-300 text-xs sm:text-sm font-mono">
                <code>{`// Initialize the StellarVeriphy SDK
import { StellarVeriphy } from '@stellarveriphy/sdk';

const client = new StellarVeriphy({
  apiKey: 'your_api_key_here',
  network: 'stellar_testnet'
});

// Verify a file
async function verifyContent() {
  const verification = await client.verify({
    content: fileBuffer,
    contentType: 'image/png',
    metadata: {
      source: 'original',
      creator: 'john@example.com'
    }
  });

  console.log('Verification Hash:', verification.hash);
  console.log('Timestamp:', verification.timestamp);
  console.log('Status:', verification.status);
}

// Later, retrieve verification
async function checkVerification() {
  const result = await client.getVerification(
    'verification_hash_here'
  );

  console.log('Is Valid:', result.isValid);
  console.log('Chain:', result.blockchainRecord);
}`}</code>
              </pre>
            </div>

            <p className="text-gray-300 text-sm sm:text-base mt-6 text-center">
              Ready to dive in? Check out the complete API documentation for more examples.
            </p>
          </div>
        </section>

        {/* Common Tasks */}
        <section className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8" aria-label="Common tasks">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-bold text-white text-center mb-12 sm:mb-16">Common Tasks</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
              {[
                {
                  task: "Verify a Single File",
                  description: "Complete walkthrough of verifying a single content item",
                  icon: "📄",
                },
                {
                  task: "Batch Verification",
                  description: "Learn how to verify multiple items in one operation",
                  icon: "📦",
                },
                {
                  task: "Set Up Webhooks",
                  description: "Configure real-time notifications for verification events",
                  icon: "🔔",
                },
                {
                  task: "Retrieve History",
                  description: "Query and analyze your verification history",
                  icon: "📊",
                },
                {
                  task: "Integrate with Applications",
                  description: "Add verification to your existing applications",
                  icon: "🔌",
                },
                {
                  task: "Troubleshooting",
                  description: "Solutions to common issues and error messages",
                  icon: "🛠️",
                },
              ].map((item, index) => (
                <div key={index} className="p-6 sm:p-8 bg-slate-800 rounded-lg border border-slate-700 hover:border-blue-600 transition-colors">
                  <div className="text-3xl sm:text-4xl mb-3 sm:mb-4">{item.icon}</div>
                  <h3 className="text-lg sm:text-xl font-bold text-white mb-2 sm:mb-3">{item.task}</h3>
                  <p className="text-gray-300 text-sm sm:text-base">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Next Steps */}
        <section className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-blue-900 to-slate-900" aria-label="Next steps">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4 sm:mb-6">What's Next?</h2>
            <p className="text-lg text-gray-300 mb-8 sm:mb-12">
              Explore case studies to see how others use StellarVeriphy or jump to best practices.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/learn/case-studies"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-white text-blue-900 font-semibold rounded-lg hover:bg-gray-100 transition-all focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-blue-900 active:scale-95"
                aria-label="View case studies"
              >
                View Case Studies
                <FiArrowRight className="w-5 h-5" aria-hidden="true" />
              </Link>
              <Link
                href="/learn/best-practices"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-blue-900 active:scale-95"
                aria-label="View best practices"
              >
                Best Practices
              </Link>
            </div>
          </div>
        </section>

        <Footer />
      </div>
    </main>
  );
}
