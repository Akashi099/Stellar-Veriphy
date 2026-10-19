"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { trackCtaClick } from "@/lib/analytics";

export function HeroSection() {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2,
        delayChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.8,
        ease: "easeOut",
      },
    },
  };

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-gradient-to-b from-black via-slate-900 to-black">
      {/* Background gradient effect */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl opacity-30" />
        <div className="absolute top-1/3 right-0 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl opacity-30" />
      </div>

      {/* Content */}
      <motion.div
        className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Headline */}
        <motion.h1
          className="text-5xl sm:text-6xl lg:text-7xl font-bold mb-6 bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent"
          variants={itemVariants}
        >
          The Truth Engine for Stellar
        </motion.h1>

        {/* Subheading */}
        <motion.p
          className="text-xl sm:text-2xl text-gray-300 mb-8 max-w-2xl mx-auto leading-relaxed"
          variants={itemVariants}
        >
          Verify digital content authenticity and provenance on the Stellar blockchain.
          Cryptographic proof that your media is genuine and unaltered.
        </motion.p>

        {/* CTA Buttons */}
        <motion.div
          className="flex flex-col sm:flex-row gap-4 justify-center items-center"
          variants={itemVariants}
        >
          <Link
            href="/verify"
            onClick={() => {
              trackCtaClick({
                ctaId: "hero_start_verifying",
                ctaLabel: "Start Verifying",
                ctaLocation: "hero",
                targetUrl: "/verify",
              });
            }}
            className="px-8 py-4 rounded-lg bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-semibold transition-all transform hover:scale-105 active:scale-95"
          >
            Start Verifying
          </Link>
          <Link
            href="/docs"
            onClick={() => {
              trackCtaClick({
                ctaId: "hero_view_docs",
                ctaLabel: "View Docs",
                ctaLocation: "hero",
                targetUrl: "/docs",
              });
            }}
            className="px-8 py-4 rounded-lg border-2 border-gray-400 hover:border-white text-gray-300 hover:text-white font-semibold transition-all"
          >
            View Docs
          </Link>
        </motion.div>

        {/* Stats or Features */}
        <motion.div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-8" variants={itemVariants}>
          <div className="p-4">
            <div className="text-3xl font-bold text-blue-400">100%</div>
            <div className="text-gray-400">Immutable</div>
          </div>
          <div className="p-4">
            <div className="text-3xl font-bold text-purple-400">On-Chain</div>
            <div className="text-gray-400">Verified</div>
          </div>
          <div className="p-4">
            <div className="text-3xl font-bold text-pink-400">Instant</div>
            <div className="text-gray-400">Proof</div>
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
}
