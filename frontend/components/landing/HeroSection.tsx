"use client";

import { FiArrowRight } from "react-icons/fi";

import { useWallet } from "@/context/WalletContext";
import { trackCtaClick } from "@/lib/analytics";

export function HeroSection() {
  const { connect, connected } = useWallet();

  const handleCtaClick = () => {
    trackCtaClick({
      ctaId: "hero_connect_wallet",
      ctaLabel: connected ? "Wallet Connected" : "Connect Wallet",
      ctaLocation: "hero",
      isWalletConnected: connected,
      customEventName: "wallet_connect_cta_click",
    });
    connect("freighter");
  };

  return (
    <section
      className="min-h-[100svh] flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-4 py-12 relative overflow-hidden"
      aria-label="Hero section"
    >
      <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8 relative z-10">
        <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-slate-50 mb-4 sm:mb-6 leading-tight drop-shadow-lg">
          <span className="sr-only">StellarVeriphy</span>
          <span aria-hidden="true">⭐ StellarVeriphy</span>
        </h1>
        <p className="text-lg sm:text-xl md:text-2xl text-slate-200 mb-6 sm:mb-8 leading-relaxed font-semibold">
          The Truth Engine for the Stellar Ecosystem
        </p>
        <p className="text-base sm:text-lg text-slate-300 mb-8 sm:mb-12 max-w-2xl mx-auto px-2 sm:px-0 leading-relaxed">
          Decentralized digital content verification and provenance on the Stellar blockchain.
          Cryptographically prove the authenticity and origin of any digital asset.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <button
            onClick={handleCtaClick}
            disabled={connected}
            className="inline-flex items-center justify-center gap-2 px-6 sm:px-8 py-3 sm:py-4 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 disabled:from-emerald-600 disabled:to-emerald-700 disabled:hover:from-emerald-600 disabled:hover:to-emerald-700 text-white font-semibold rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-slate-950 focus:scale-105 active:scale-95 min-h-[44px] sm:min-h-[48px] min-w-[44px] text-base sm:text-lg shadow-lg shadow-blue-500/50 hover:shadow-blue-500/75"
            aria-label={connected ? "Wallet is connected" : "Connect wallet to start"}
            aria-disabled={connected}
          >
            {connected ? "Wallet Connected" : "Connect Wallet"}
            <FiArrowRight className="w-4 h-4 sm:w-5 sm:h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Decorative background elements with enhanced visibility */}
        <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-64 h-64 sm:w-96 sm:h-96 bg-blue-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '4s' }}></div>
          <div className="absolute bottom-1/4 right-1/4 w-48 h-48 sm:w-80 sm:h-80 bg-purple-500/15 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '5s', animationDelay: '0.5s' }}></div>
          <div className="absolute top-1/2 right-1/4 w-72 h-72 bg-indigo-500/10 rounded-full blur-3xl" style={{ animationDuration: '6s' }}></div>
        </div>
      </div>
    </section>
  );
}
