"use client";

import Link from "next/link";
import { FEATURED_SAMPLE_ID } from "@/lib/sample-records";
import { trackCtaClick } from "@/lib/analytics";

export function ExplorePreviewSection() {
  const handleExploreClick = () => {
    trackCtaClick({
      ctaId: "home_explore_verified_content",
      ctaLabel: "Explore verified content",
      ctaLocation: "featured_sample",
      targetUrl: "/explore",
    });
  };

  const handleSampleClick = () => {
    trackCtaClick({
      ctaId: "home_view_sample_certificate",
      ctaLabel: "View a sample certificate",
      ctaLocation: "featured_sample",
      targetUrl: `/certificates/${FEATURED_SAMPLE_ID}`,
    });
  };

  return (
    <section aria-labelledby="cta-heading" className="py-16 px-4 bg-slate-800/50">
      <div className="max-w-4xl mx-auto rounded-2xl border border-indigo-500/20 bg-slate-900/80 p-6 shadow-xl sm:p-8 backdrop-blur-sm">
        <h2 id="cta-heading" className="text-2xl font-bold text-slate-100">
          See verification in action
        </h2>
        <p className="mt-2 text-slate-300">
          Browse photos, videos and documents that have been checked and certified on-chain. Open any item to see
          who created it, how it was verified, and every step in its history.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            href="/explore"
            onClick={handleExploreClick}
            className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-5 py-3 text-base font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 transition-colors"
          >
            Explore verified content
            <span aria-hidden="true" className="ml-2">
              →
            </span>
          </Link>
          <Link
            href={`/certificates/${FEATURED_SAMPLE_ID}`}
            onClick={handleSampleClick}
            className="inline-flex items-center justify-center rounded-lg px-5 py-3 text-base font-medium text-indigo-300 ring-1 ring-inset ring-indigo-500/30 hover:bg-indigo-950/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 transition-colors"
          >
            View a sample certificate
          </Link>
        </div>
        <p className="mt-3 text-sm text-slate-400">No account or wallet needed to browse.</p>
      </div>
    </section>
  );
}
