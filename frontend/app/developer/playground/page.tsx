import Link from "next/link";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/landing/Header";
import { FiArrowLeft, FiArrowRight } from "react-icons/fi";

export const metadata = {
  title: "Interactive Playground",
  description: "Test StellarVeriphy APIs in interactive playground",
};

export default function PlaygroundPage() {
  return (
    <main id="main-content" className="min-h-screen bg-slate-900" aria-label="Playground">
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
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4 sm:mb-6">Interactive Playground</h1>
            <p className="text-lg sm:text-xl text-gray-300 max-w-3xl">
              Test the StellarVeriphy API directly in your browser with our interactive sandbox environment.
            </p>
          </div>
        </section>

        <section className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto">
            <div className="bg-slate-800 rounded-lg border border-slate-700 p-8 text-center min-h-96 flex flex-col items-center justify-center">
              <div className="text-6xl mb-4">🚀</div>
              <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">Playground Coming Soon</h2>
              <p className="text-gray-300 mb-8 max-w-md">
                The interactive playground is being developed. Check back soon to test APIs directly in your browser!
              </p>
              <Link
                href="/developer/api-docs"
                className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded transition-colors"
              >
                View API Docs
                <FiArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>

        <Footer />
      </div>
    </main>
  );
}
