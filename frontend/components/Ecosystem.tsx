"use client";

// import { motion } from 'framer-motion';

const integrations = [
  {
    name: "Stellar",
    description: "Blockchain network for decentralized transactions",
    icon: "⭐",
  },
  {
    name: "Soroban",
    description: "Smart contracts platform on Stellar",
    icon: "🔧",
  },
  {
    name: "IPFS",
    description: "Distributed file storage and retrieval",
    icon: "📦",
  },
  {
    name: "Freighter",
    description: "Stellar wallet for secure key management",
    icon: "🔐",
  },
  {
    name: "AWS Nitro",
    description: "Trusted Execution Environment for attestation",
    icon: "☁️",
  },
];

export default function Ecosystem() {
  return (
    <section className="py-16 px-4 md:px-8 bg-gray-50 dark:bg-gray-900">
      <div className="max-w-6xl mx-auto">
        <div
          // initial={{ opacity: 0, y: 20 }}
          // whileInView={{ opacity: 1, y: 0 }}
          // transition={{ duration: 0.6 }}
          // viewport={{ once: true }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-4 text-gray-900 dark:text-white">
            Ecosystem & Integrations
          </h2>
          <p className="text-lg text-gray-600 dark:text-gray-300">
            Built on trusted technologies and platforms
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
          {integrations.map((integration, index) => (
            <div
              key={integration.name}
              // initial={{ opacity: 0, y: 20 }}
              // whileInView={{ opacity: 1, y: 0 }}
              // transition={{ duration: 0.5, delay: index * 0.1 }}
              // viewport={{ once: true }}
              // whileHover={{ y: -8, boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}
              className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-md transition-[transform,box-shadow] duration-200 ease-out will-change-transform hover:-translate-y-1 hover:shadow-lg motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            >
              <div className="text-4xl mb-4" aria-hidden="true">{integration.icon}</div>
              <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">
                {integration.name}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-300">{integration.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
