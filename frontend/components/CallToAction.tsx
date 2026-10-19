"use client";

import Link from "next/link";
import { trackCtaClick } from "@/lib/analytics";
// import { motion } from 'framer-motion';

export default function CallToAction() {
  return (
    <section className="py-20 px-4 md:px-8 bg-gradient-to-r from-blue-600 to-blue-800 dark:from-blue-900 dark:to-blue-950">
      <div className="max-w-4xl mx-auto text-center">
        <div
        // initial={{ opacity: 0, y: 20 }}
        // whileInView={{ opacity: 1, y: 0 }}
        // transition={{ duration: 0.6 }}
        // viewport={{ once: true }}
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-4 text-white">
            Ready to Verify Your Content?
          </h2>
          <p className="text-lg text-blue-100 mb-8 max-w-2xl mx-auto">
            Start verifying your digital content today and receive immutable proof of authenticity
            on the Stellar blockchain.
          </p>
          <Link
            href="/verify"
            onClick={() => {
              trackCtaClick({
                ctaId: "cta_start_verifying",
                ctaLabel: "Start Verifying",
                ctaLocation: "cta_section",
                targetUrl: "/verify",
              });
            }}
            className="inline-block px-8 py-4 bg-white text-blue-600 font-semibold rounded-lg hover:bg-blue-50 transition-colors shadow-lg"
          >
            Start Verifying →
          </Link>
        </div>
      </div>
    </section>
  );
}
