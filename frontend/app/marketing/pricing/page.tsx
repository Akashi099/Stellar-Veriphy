import Link from "next/link";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/landing/Header";
import { FiArrowLeft, FiArrowRight, FiCheck } from "react-icons/fi";

export const metadata = {
  title: "Pricing",
  description: "Transparent pricing for every verification need",
};

export default function PricingPage() {
  const tiers = [
    {
      name: "Starter",
      price: "Free",
      description: "Perfect for exploring StellarVeriphy",
      apiCalls: "10,000/month",
      features: [
        "Up to 10,000 API calls per month",
        "Basic verification features",
        "Email support",
        "Community access",
        "Standard verification speed (< 2 seconds)",
      ],
      highlighted: false,
      cta: "Get Started",
    },
    {
      name: "Professional",
      price: "$99",
      period: "/month",
      description: "For growing teams and businesses",
      apiCalls: "1,000,000/month",
      features: [
        "Up to 1,000,000 API calls per month",
        "Advanced verification with custom rules",
        "Priority email and chat support (business hours)",
        "Advanced analytics dashboard",
        "Fast verification speed (< 500ms)",
        "Batch processing (up to 10,000 items)",
        "Webhook notifications",
        "99.9% SLA guarantee",
      ],
      highlighted: true,
      cta: "Start Free Trial",
    },
    {
      name: "Enterprise",
      price: "Custom",
      description: "For large-scale operations",
      apiCalls: "Unlimited",
      features: [
        "Unlimited API calls and batch processing",
        "Custom verification workflows",
        "24/7 dedicated support team",
        "Custom integrations and solutions",
        "Ultra-fast verification (< 100ms)",
        "Advanced compliance and audit logs",
        "Custom analytics and reporting",
        "99.99% SLA guarantee",
        "On-premise deployment option",
      ],
      highlighted: false,
      cta: "Contact Sales",
    },
  ];

  return (
    <main id="main-content" className="min-h-screen bg-slate-900" aria-label="Pricing content">
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
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4 sm:mb-6">Simple, Transparent Pricing</h1>
            <p className="text-lg sm:text-xl text-gray-300 max-w-3xl">
              Scale from startup to enterprise with pricing that grows with your needs. No hidden fees, cancel anytime.
            </p>
          </div>
        </section>

        {/* Pricing Cards */}
        <section className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8" aria-label="Pricing tiers">
          <div className="max-w-7xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {tiers.map((tier, index) => (
                <div
                  key={index}
                  className={`relative rounded-lg transition-all ${
                    tier.highlighted
                      ? "md:scale-105 bg-gradient-to-br from-blue-900 to-slate-900 border-2 border-blue-600 shadow-2xl"
                      : "bg-slate-800 border border-slate-700 hover:border-slate-600"
                  } p-8`}
                >
                  {tier.highlighted && (
                    <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-4 py-1 rounded-full text-sm font-semibold">
                      Most Popular
                    </div>
                  )}

                  <div className="mb-8">
                    <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">{tier.name}</h2>
                    <p className="text-gray-400 text-sm sm:text-base mb-4">{tier.description}</p>
                    <div className="flex items-baseline gap-2 mb-2">
                      <span className="text-3xl sm:text-4xl font-bold text-white">{tier.price}</span>
                      {tier.period && <span className="text-gray-400">{tier.period}</span>}
                    </div>
                    <p className="text-sm text-gray-400">{tier.apiCalls}</p>
                  </div>

                  <button
                    className={`w-full py-3 px-4 rounded-lg font-semibold transition-all mb-8 flex items-center justify-center gap-2 ${
                      tier.highlighted
                        ? "bg-white text-blue-900 hover:bg-gray-100"
                        : "bg-blue-600 text-white hover:bg-blue-700"
                    }`}
                    aria-label={`${tier.cta} - ${tier.name} plan`}
                  >
                    {tier.cta}
                    <FiArrowRight className="w-4 h-4" aria-hidden="true" />
                  </button>

                  <div className="space-y-4">
                    <p className="text-sm font-semibold text-gray-300 mb-4">What's included:</p>
                    {tier.features.map((feature, featureIndex) => (
                      <div key={featureIndex} className="flex items-start gap-3">
                        <FiCheck className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
                        <span className="text-gray-300 text-sm">{feature}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8 bg-slate-800" aria-label="FAQ">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-bold text-white text-center mb-12 sm:mb-16">Frequently Asked Questions</h2>

            <div className="space-y-6 sm:space-y-8">
              {[
                {
                  q: "Can I upgrade or downgrade my plan?",
                  a: "Yes! You can change your plan at any time. Changes take effect at the start of your next billing cycle.",
                },
                {
                  q: "What payment methods do you accept?",
                  a: "We accept all major credit cards, bank transfers, and cryptocurrency payments (including XLM and USDC on Stellar).",
                },
                {
                  q: "Is there a contract or long-term commitment?",
                  a: "No. All plans are month-to-month with no long-term commitments. You can cancel anytime, but we hope you'll stick with us!",
                },
                {
                  q: "What happens if I exceed my API quota?",
                  a: "We'll notify you when you're approaching your limit. You can upgrade instantly or purchase overage credits at discounted rates.",
                },
                {
                  q: "Do you offer discounts for annual billing?",
                  a: "Yes! Annual plans receive a 20% discount. For enterprise customers, we offer custom pricing and payment terms.",
                },
                {
                  q: "Is there a free trial?",
                  a: "Yes, the Starter plan is free forever with 10,000 API calls per month. Professional plans include a 14-day free trial.",
                },
              ].map((faq, index) => (
                <details key={index} className="group cursor-pointer">
                  <summary className="flex items-center justify-between py-4 px-6 bg-slate-700 rounded-lg hover:bg-slate-600 transition-colors list-none">
                    <h3 className="font-semibold text-white text-base sm:text-lg">{faq.q}</h3>
                    <span className="text-gray-400 group-open:rotate-180 transition-transform" aria-hidden="true">
                      ▼
                    </span>
                  </summary>
                  <p className="mt-4 px-6 pb-4 text-gray-300 text-sm sm:text-base">{faq.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-blue-900 to-slate-900" aria-label="Call to action">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4 sm:mb-6">Ready to get started?</h2>
            <p className="text-lg text-gray-300 mb-8 sm:mb-12">
              Join hundreds of organizations using StellarVeriphy for content verification and provenance tracking.
            </p>
            <Link
              href="/"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-white text-blue-900 font-semibold rounded-lg hover:bg-gray-100 transition-all focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-blue-900 active:scale-95"
              aria-label="Start your free trial"
            >
              Start Your Free Trial
              <FiArrowRight className="w-5 h-5" aria-hidden="true" />
            </Link>
          </div>
        </section>

        <Footer />
      </div>
    </main>
  );
}
