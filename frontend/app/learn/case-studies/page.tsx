import Link from "next/link";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/landing/Header";
import { FiArrowLeft, FiArrowRight } from "react-icons/fi";

export const metadata = {
  title: "Case Studies",
  description: "Real-world examples of StellarVeriphy implementation",
};

export default function CaseStudiesPage() {
  const caseStudies = [
    {
      industry: "Media & Publishing",
      title: "Global News Network Combats Deepfakes",
      company: "Premier Media Corp",
      challenge:
        "Major media organization faced increasing deepfake content and reader trust erosion. Manual verification was slow and expensive.",
      solution: "Implemented StellarVeriphy to automatically verify image authenticity and provide verification badges to readers.",
      results: [
        "99.2% accuracy in detecting manipulated images",
        "78% increase in reader trust scores",
        "5000+ articles verified daily",
        "$2M annual cost savings",
      ],
      metrics: {
        "Verification Accuracy": "99.2%",
        "Daily Verifications": "5000+",
        "Cost Reduction": "78%",
        "Response Time": "< 500ms",
      },
    },
    {
      industry: "Healthcare",
      title: "Medical Records Verification System",
      company: "HealthCare Systems International",
      challenge:
        "Healthcare provider needed to ensure integrity of digital medical records across multiple facilities while maintaining HIPAA compliance.",
      solution: "Deployed StellarVeriphy to create immutable audit trails for patient records and verification certificates.",
      results: [
        "100% audit trail coverage",
        "HIPAA compliant digital signatures",
        "Instant record verification capability",
        "Zero document tampering incidents",
      ],
      metrics: {
        "Audit Coverage": "100%",
        "Compliance Score": "100%",
        "Verification Time": "< 100ms",
        "Facilities Covered": "47",
      },
    },
    {
      industry: "Education",
      title: "Digital Credential Verification",
      company: "Global University Network",
      challenge:
        "Universities struggled with credential fraud and employers had difficulty verifying degrees instantly.",
      solution: "Integrated StellarVeriphy to issue tamper-proof digital diplomas with instant verification capability.",
      results: [
        "Reduced credential fraud by 95%",
        "Instant credential verification for employers",
        "Eliminated credential processing delays",
        "Graduates issue their own verified credentials",
      ],
      metrics: {
        "Fraud Reduction": "95%",
        "Verification Speed": "Instant",
        "Universities": "150+",
        "Credentials Verified": "2.5M+",
      },
    },
    {
      industry: "Supply Chain",
      title: "Product Authenticity Verification",
      company: "Luxury Goods Manufacturer",
      challenge:
        "Luxury product manufacturer lost millions annually to counterfeiters. Need transparent supply chain tracking.",
      solution: "Implemented blockchain-based verification to track product journey and prove authenticity at every step.",
      results: [
        "Counterfeit products reduced by 87%",
        "Complete supply chain transparency",
        "Consumer confidence increased",
        "Digital certificates of authenticity",
      ],
      metrics: {
        "Counterfeit Reduction": "87%",
        "Products Tracked": "15M+",
        "Supply Chain Nodes": "5000+",
        "Verification Rate": "99.8%",
      },
    },
  ];

  return (
    <main id="main-content" className="min-h-screen bg-slate-900" aria-label="Case studies content">
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
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4 sm:mb-6">Case Studies</h1>
            <p className="text-lg sm:text-xl text-gray-300 max-w-3xl">
              Real-world examples of how organizations across industries use StellarVeriphy to solve verification challenges.
            </p>
          </div>
        </section>

        {/* Case Studies */}
        <section className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8" aria-label="Featured case studies">
          <div className="max-w-6xl mx-auto space-y-8 sm:space-y-12">
            {caseStudies.map((study, index) => (
              <div key={index} className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden hover:border-blue-600 transition-colors">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8 p-6 sm:p-8">
                  {/* Left Column - Company Info */}
                  <div className="lg:col-span-1">
                    <div className="mb-6">
                      <span className="inline-block text-xs sm:text-sm bg-blue-900 text-blue-200 px-3 py-1 rounded-full mb-4">
                        {study.industry}
                      </span>
                      <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">{study.title}</h2>
                      <p className="text-gray-400 font-semibold">{study.company}</p>
                    </div>

                    <div className="bg-slate-700 rounded p-4 mb-6">
                      <p className="text-xs sm:text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">Key Metrics</p>
                      <div className="space-y-3">
                        {Object.entries(study.metrics).map(([label, value], i) => (
                          <div key={i} className="border-b border-slate-600 pb-3 last:border-b-0 last:pb-0">
                            <p className="text-xs text-gray-400">{label}</p>
                            <p className="text-lg font-bold text-blue-400">{value}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Right Column - Details */}
                  <div className="lg:col-span-2">
                    {/* Challenge */}
                    <div className="mb-6 sm:mb-8">
                      <h3 className="text-lg sm:text-xl font-bold text-blue-400 mb-2 sm:mb-3">Challenge</h3>
                      <p className="text-gray-300 text-sm sm:text-base leading-relaxed">{study.challenge}</p>
                    </div>

                    {/* Solution */}
                    <div className="mb-6 sm:mb-8">
                      <h3 className="text-lg sm:text-xl font-bold text-blue-400 mb-2 sm:mb-3">Solution</h3>
                      <p className="text-gray-300 text-sm sm:text-base leading-relaxed">{study.solution}</p>
                    </div>

                    {/* Results */}
                    <div>
                      <h3 className="text-lg sm:text-xl font-bold text-blue-400 mb-3 sm:mb-4">Results</h3>
                      <ul className="space-y-2">
                        {study.results.map((result, resultIndex) => (
                          <li key={resultIndex} className="flex items-start gap-3">
                            <span className="text-green-400 font-bold flex-shrink-0">✓</span>
                            <span className="text-gray-300 text-sm sm:text-base">{result}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Industry Breakdown */}
        <section className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8 bg-slate-800" aria-label="Industry breakdown">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-bold text-white text-center mb-12 sm:mb-16">Industries We Serve</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8">
              {[
                { icon: "📺", name: "Media & Publishing", companies: "500+" },
                { icon: "🏥", name: "Healthcare", companies: "200+" },
                { icon: "🎓", name: "Education", companies: "150+" },
                { icon: "🏭", name: "Manufacturing", companies: "300+" },
                { icon: "⚖️", name: "Legal & Compliance", companies: "180+" },
                { icon: "🏠", name: "Real Estate", companies: "220+" },
                { icon: "💎", name: "Luxury Goods", companies: "120+" },
                { icon: "🎨", name: "Digital Arts", companies: "400+" },
              ].map((industry, index) => (
                <div key={index} className="p-6 sm:p-8 bg-slate-700 rounded-lg hover:bg-slate-600 transition-colors border border-slate-600">
                  <div className="text-4xl mb-3 sm:mb-4">{industry.icon}</div>
                  <h3 className="text-lg sm:text-xl font-bold text-white mb-2">{industry.name}</h3>
                  <p className="text-blue-400 font-semibold text-sm sm:text-base">{industry.companies} organizations</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-blue-900 to-slate-900" aria-label="Call to action">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4 sm:mb-6">Want Your Success Story?</h2>
            <p className="text-lg text-gray-300 mb-8 sm:mb-12">
              Join thousands of organizations using StellarVeriphy to solve their verification challenges.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-white text-blue-900 font-semibold rounded-lg hover:bg-gray-100 transition-all focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-blue-900 active:scale-95"
                aria-label="Start free trial"
              >
                Start Free Trial
                <FiArrowRight className="w-5 h-5" aria-hidden="true" />
              </Link>
              <Link
                href="/learn/best-practices"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-blue-900 active:scale-95"
                aria-label="Learn best practices"
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
