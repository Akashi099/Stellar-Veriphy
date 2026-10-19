"use client";

import { FiArrowRight } from "react-icons/fi";

import { useWallet } from "@/context/WalletContext";
import { trackCtaClick } from "@/lib/analytics";

export function CallToActionSection() {
  const { connect, connected } = useWallet();

  const handleCtaClick = () => {
    trackCtaClick({
      ctaId: "cta_section_connect_wallet",
      ctaLabel: connected ? "Get Started" : "Connect Wallet",
      ctaLocation: "cta_section",
      isWalletConnected: connected,
      customEventName: "wallet_connect_cta_click",
    });
    connect("freighter");
  };

  return (
    <section className="py-20 px-4 bg-gradient-to-r from-blue-600 to-blue-800">
      <div className="max-w-4xl mx-auto text-center">
        <h2 className="text-4xl font-bold text-white mb-6">Ready to Verify Your Content?</h2>
        <p className="text-xl text-blue-100 mb-8">
          Join the decentralized verification revolution on Stellar
        </p>
        <button
          onClick={handleCtaClick}
          disabled={connected}
          className="inline-flex items-center gap-2 px-8 py-4 bg-white hover:bg-gray-100 disabled:bg-green-400 disabled:hover:bg-green-400 text-blue-600 font-semibold rounded-lg transition-colors"
        >
          {connected ? "Get Started" : "Connect Wallet"}
          <FiArrowRight className="w-5 h-5" />
        </button>
      </div>
    </section>
  );
}
