"use client";

// import { motion } from 'framer-motion';

const features = [
  {
    title: "Ingest",
    description: "Upload your digital content and metadata to begin the verification process.",
    icon: "📤",
  },
  {
    title: "Store",
    description:
      "Content is securely stored with cryptographic hashing for integrity verification.",
    icon: "💾",
  },
  {
    title: "Certify",
    description: "Receive an immutable on-chain certificate proving authenticity and provenance.",
    icon: "✅",
  },
];

export default function About() {
  return (
    <section className="py-16 px-4 md:px-8 bg-gray-50 dark:bg-gray-900">
      <div className="max-w-6xl mx-auto">
        <div
          // initial={{ opacity: 0, y: 20 }}
          // whileInView={{ opacity: 1, y: -0 }}
          // transition={{ duration: 0.6 }}
          // viewport={{ once: true }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-4 text-gray-900 dark:text-white">
            About StellarVeriphy
          </h2>
          <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
            A decentralized platform for digital content verification and provenance on the Stellar
            blockchain.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <div
              key={feature.title}
              // initial={{ opacity: 0, y: 20 }}
              // whileInView={{ opacity: 1, y: 0 }}
              // transition={{ duration: 0.6, delay: index * 0.2 }}
              // viewport={{ once: true }}
              className="bg-white dark:bg-gray-800 rounded-lg p-8 shadow-md hover:shadow-lg transition-shadow duration-200 ease-out motion-reduce:transition-none"
            >
              <div className="text-5xl mb-4" aria-hidden="true">{feature.icon}</div>
              <h3 className="text-xl font-semibold mb-3 text-gray-900 dark:text-white">
                {feature.title}
              </h3>
              <p className="text-gray-600 dark:text-gray-300">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
