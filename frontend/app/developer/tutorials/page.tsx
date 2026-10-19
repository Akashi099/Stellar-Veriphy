import Link from "next/link";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/landing/Header";
import { FiArrowLeft, FiArrowRight, FiPlayCircle } from "react-icons/fi";

export const metadata = {
  title: "Tutorials",
  description: "Step-by-step tutorials for StellarVeriphy",
};

const tutorials = [
  {
    title: "Getting Started with StellarVeriphy",
    description: "Complete beginner's guide to set up and make your first verification",
    duration: "15 minutes",
    level: "Beginner",
    topics: ["API Key Setup", "First Verification", "Understanding Results"],
  },
  {
    title: "Building Your First Verification App",
    description: "Create a simple web app that verifies files using StellarVeriphy",
    duration: "45 minutes",
    level: "Intermediate",
    topics: ["Frontend Setup", "API Integration", "Error Handling"],
  },
  {
    title: "Advanced Batch Operations",
    description: "Learn how to efficiently process thousands of verifications",
    duration: "60 minutes",
    level: "Advanced",
    topics: ["Batch API", "Performance Optimization", "Monitoring"],
  },
  {
    title: "Webhook Integration",
    description: "Set up real-time event notifications for verification updates",
    duration: "30 minutes",
    level: "Intermediate",
    topics: ["Webhook Setup", "Event Types", "Error Handling"],
  },
  {
    title: "Production Deployment",
    description: "Deploy your verification system to production with best practices",
    duration: "90 minutes",
    level: "Advanced",
    topics: ["Environment Setup", "Monitoring", "Security", "Scaling"],
  },
  {
    title: "Custom Integration Patterns",
    description: "Explore advanced patterns for specific use cases",
    duration: "120 minutes",
    level: "Advanced",
    topics: ["Architecture Patterns", "Database Integration", "Multi-tenant Setup"],
  },
];

export default function TutorialsPage() {
  return (
    <main id="main-content" className="min-h-screen bg-slate-900" aria-label="Tutorials">
      <Header />
      <div className="pt-16">
        <section className="py-12 sm:py-16 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-slate-800 to-slate-900">
          <div className="max-w-6xl mx-auto">
            <Link
              href="/developer"
              className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 mb-6 sm:mb-8 transition-colors"
            >
              <FiArrowLeft className="w-4 h-4" />
              Back to Developer Portal
            </Link>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4 sm:mb-6">Tutorials & Guides</h1>
            <p className="text-lg sm:text-xl text-gray-300 max-w-3xl">
              Step-by-step tutorials from beginner to advanced topics.
            </p>
          </div>
        </section>

        <section className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8" aria-label="Tutorial list">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
              {tutorials.map((tutorial, index) => (
                <div key={index} className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden hover:border-blue-600 transition-colors">
                  <div className="p-6 sm:p-8">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h2 className="text-lg sm:text-xl font-bold text-white mb-2">{tutorial.title}</h2>
                        <p className="text-gray-400 text-xs font-semibold uppercase tracking-wide">
                          {tutorial.level} • {tutorial.duration}
                        </p>
                      </div>
                      <FiPlayCircle className="w-6 h-6 text-blue-400 flex-shrink-0" />
                    </div>

                    <p className="text-gray-300 text-sm sm:text-base mb-4 sm:mb-6">{tutorial.description}</p>

                    <div className="mb-6">
                      <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Topics:</p>
                      <div className="flex flex-wrap gap-2">
                        {tutorial.topics.map((topic, topicIndex) => (
                          <span key={topicIndex} className="text-xs bg-slate-700 text-gray-300 px-2 py-1 rounded">
                            {topic}
                          </span>
                        ))}
                      </div>
                    </div>

                    <button className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded transition-colors text-sm">
                      Start Tutorial
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <Footer />
      </div>
    </main>
  );
}
