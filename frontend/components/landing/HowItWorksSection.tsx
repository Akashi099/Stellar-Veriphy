"use client";

import { useState } from "react";

export function HowItWorksSection() {
  const [openAccordion, setOpenAccordion] = useState<number>(0);

  const steps = [
    {
      number: "1",
      title: "Upload Content",
      description: "Submit your digital asset and metadata to the platform",
      details: [
        "Creators upload their digital media (images, videos, documents, etc.) to the StellarVeriphy platform",
        "Provide metadata such as creation date, device used, location, and any AI tools involved",
        "The platform calculates a cryptographic SHA-256 hash of your content for unique identification",
        "Your manifest is created with all content and metadata information",
      ],
    },
    {
      number: "2",
      title: "Verification",
      description: "TEE-backed oracle verifies the content and metadata",
      details: [
        "Your content is processed in a Trusted Execution Environment (TEE) for secure verification",
        "The TEE verifies the content hash matches the original file without modification",
        "Metadata integrity is confirmed using cryptographic signatures",
        "An attestation is generated proving the verification occurred in a trusted hardware environment",
      ],
    },
    {
      number: "3",
      title: "On-Chain Record",
      description: "Provenance certificate is minted on Stellar blockchain",
      details: [
        "A digital certificate containing the content hash and metadata is created",
        "The certificate is recorded immutably on the Stellar blockchain",
        "A unique transaction ID and certificate ID are generated for your record",
        "The blockchain creates a permanent, timestamped record of your content's authenticity",
      ],
    },
    {
      number: "4",
      title: "Audit & Verify",
      description: "Anyone can verify the certificate without central authority",
      details: [
        "Certificate holders receive a shareable certificate link for others to verify",
        "Anyone can query the blockchain to independently verify the certificate's authenticity",
        "The verification process requires no central authority or special permissions",
        "Full chain of custody is transparent and verifiable by anyone in the world",
      ],
    },
  ];

  return (
    <section id="how-it-works" className="py-20 px-4 bg-slate-900 scroll-mt-20">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-4xl font-bold text-white mb-4 text-center">How It Works</h2>
        <p className="text-gray-400 text-center mb-12 text-lg">
          A structured journey from content upload to independent verification
        </p>

        {/* Accordion Container */}
        <div className="space-y-4">
          {steps.map((step, index) => (
            <div
              key={step.number}
              className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden hover:border-blue-500 transition-colors duration-200"
            >
              {/* Accordion Header */}
              <button
                onClick={() => setOpenAccordion(openAccordion === index ? -1 : index)}
                aria-expanded={openAccordion === index}
                className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-700/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset transition-colors duration-150"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold flex-shrink-0">
                    {step.number}
                  </div>
                  <div className="text-left">
                    <h3 className="text-xl font-semibold text-white">{step.title}</h3>
                    <p className="text-gray-400 text-sm mt-1">{step.description}</p>
                  </div>
                </div>
                <svg
                  className={`w-6 h-6 text-blue-400 flex-shrink-0 transition-transform duration-200 ${
                    openAccordion === index ? "rotate-180" : ""
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 14l-7 7m0 0l-7-7m7 7V3"
                  />
                </svg>
              </button>

              {/* Accordion Content */}
              {openAccordion === index && (
                <div
                  className="px-6 py-4 bg-slate-700/30 border-t border-slate-700 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200"
                  role="region"
                  aria-labelledby={`accordion-header-${index}`}
                >
                  <ul className="space-y-2">
                    {step.details.map((detail, detailIndex) => (
                      <li key={detailIndex} className="flex gap-3 text-gray-300">
                        <span className="text-blue-400 font-semibold flex-shrink-0">•</span>
                        <span>{detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Educational Note */}
        <div className="mt-12 p-6 bg-blue-500/10 border border-blue-500/30 rounded-lg">
          <p className="text-gray-300 text-center">
            <span className="font-semibold text-blue-400">Key Insight:</span> Each step is designed
            to be transparent, decentralized, and verifiable. Your content's authenticity is
            protected by cryptography and blockchain technology, not by a central authority.
          </p>
        </div>
      </div>
    </section>
  );
}
