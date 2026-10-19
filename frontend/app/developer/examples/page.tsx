import Link from "next/link";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/landing/Header";
import { FiArrowLeft, FiArrowRight, FiGithub } from "react-icons/fi";

export const metadata = {
  title: "Code Examples",
  description: "Code examples for StellarVeriphy integration",
};

export default function ExamplesPage() {
  const examples = [
    {
      title: "Single File Verification",
      description: "Verify a single file and get its verification hash",
      languages: ["JavaScript", "Python", "Go"],
      github: "https://github.com/Stellar-Veriphy/examples/tree/main/single-file",
    },
    {
      title: "Batch Processing",
      description: "Verify multiple files in one batch operation",
      languages: ["JavaScript", "Python"],
      github: "https://github.com/Stellar-Veriphy/examples/tree/main/batch-processing",
    },
    {
      title: "Webhook Integration",
      description: "Set up webhooks for real-time verification events",
      languages: ["JavaScript", "Node.js"],
      github: "https://github.com/Stellar-Veriphy/examples/tree/main/webhooks",
    },
    {
      title: "Web App Integration",
      description: "Integrate verification into a React application",
      languages: ["React", "TypeScript"],
      github: "https://github.com/Stellar-Veriphy/examples/tree/main/react-app",
    },
    {
      title: "CLI Tool",
      description: "Build a command-line verification tool",
      languages: ["Python", "Go"],
      github: "https://github.com/Stellar-Veriphy/examples/tree/main/cli-tool",
    },
    {
      title: "REST API Server",
      description: "Create a verification API endpoint",
      languages: ["Node.js", "Go", "Rust"],
      github: "https://github.com/Stellar-Veriphy/examples/tree/main/rest-api",
    },
  ];

  return (
    <main id="main-content" className="min-h-screen bg-slate-900" aria-label="Code examples">
      <Header />
      <div className="pt-16">
        {/* Hero */}
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
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4 sm:mb-6">Code Examples</h1>
            <p className="text-lg sm:text-xl text-gray-300 max-w-3xl">
              Ready-to-use code examples for common integration patterns.
            </p>
          </div>
        </section>

        {/* Examples Grid */}
        <section className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8" aria-label="Code examples">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
              {examples.map((example, index) => (
                <div key={index} className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden hover:border-blue-600 transition-colors">
                  <div className="p-6 sm:p-8">
                    <h2 className="text-lg sm:text-xl font-bold text-white mb-2 sm:mb-3">{example.title}</h2>
                    <p className="text-gray-300 text-sm sm:text-base mb-4 sm:mb-6">{example.description}</p>

                    <div className="mb-6">
                      <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Languages:</p>
                      <div className="flex flex-wrap gap-2">
                        {example.languages.map((lang, langIndex) => (
                          <span key={langIndex} className="text-xs bg-blue-900 text-blue-200 px-2 py-1 rounded">
                            {lang}
                          </span>
                        ))}
                      </div>
                    </div>

                    <a
                      href={example.github}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 font-semibold text-sm"
                    >
                      <FiGithub className="w-4 h-4" aria-hidden="true" />
                      View on GitHub
                      <FiArrowRight className="w-4 h-4" aria-hidden="true" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Next Steps */}
        <section className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-blue-900 to-slate-900">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4 sm:mb-6">Ready to Try It Out?</h2>
            <p className="text-lg text-gray-300 mb-8 sm:mb-12">
              Start with the interactive playground or explore tutorials.
            </p>
            <Link
              href="/developer/playground"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-white text-blue-900 font-semibold rounded-lg hover:bg-gray-100 transition-all focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-blue-900 active:scale-95"
              aria-label="Try playground"
            >
              Try Playground
              <FiArrowRight className="w-5 h-5" aria-hidden="true" />
            </Link>
          </div>
        </section>

        <Footer />
      </div>
    </main>
  );
}
