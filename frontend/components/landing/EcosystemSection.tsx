"use client";

export function EcosystemSection() {
  const components = [
    {
      title: "Frontend",
      description: "Next.js application for user interaction",
    },
    {
      title: "Soroban Contracts",
      description: "Smart contracts for on-chain verification records",
    },
    {
      title: "Horizon API",
      description: "Stellar blockchain interaction and transaction tracking",
    },
    {
      title: "TEE Oracle",
      description: "Trusted Execution Environment for secure verification",
    },
  ];

  return (
    <section id="ecosystem" className="py-20 px-4 bg-slate-800 scroll-mt-20">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-4xl font-bold text-white mb-12 text-center">Ecosystem</h2>
        <div className="grid md:grid-cols-2 gap-6">
          {components.map((component) => (
            <div
              key={component.title}
              className="bg-slate-700 p-6 rounded-lg border border-slate-600 hover:border-blue-500 transition-colors duration-200 ease-out motion-reduce:transition-none"
            >
              <h3 className="text-lg font-semibold text-white mb-2">{component.title}</h3>
              <p className="text-gray-400">{component.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
