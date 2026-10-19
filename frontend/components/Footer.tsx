"use client";

import Link from "next/link";

export function Footer() {
  const currentYear = new Date().getFullYear();

  const productLinks = [
    { href: "/verify", label: "Verify Content" },
    { href: "/builder", label: "Manifest Builder" },
    { href: "/batch-verification", label: "Batch Verification" },
    { href: "/comparison", label: "Certificate Comparison" },
    { href: "/timeline-view", label: "Timeline & History" },
  ];

  const toolLinks = [
    { href: "/tools/hash-calculator", label: "Hash Calculator" },
    { href: "/tools/manifest-editor", label: "Manifest Editor" },
    { href: "/tools/signature-verifier", label: "Signature Verifier" },
    { href: "/tools/api-keys", label: "API Key Management" },
    { href: "/tools/audit-logs", label: "Audit Logs" },
  ];

  const resourceLinks = [
    { href: "/docs", label: "Documentation" },
    { href: "/features-showcase", label: "Features Showcase" },
    { href: "/report-issue", label: "Report an Issue" },
    {
      href: "https://github.com/Stellar-Veriphy/Stellar-Veriphy",
      label: "GitHub Repository",
      external: true,
    },
  ];

  const legalLinks = [
    { href: "/privacy", label: "Privacy Policy" },
    {
      href: "https://github.com/Stellar-Veriphy/Stellar-Veriphy/blob/main/LICENSE",
      label: "License (MIT)",
      external: true,
    },
    { href: "/offline", label: "Offline Status" },
  ];

  return (
    <footer
      role="contentinfo"
      aria-label="Site footer"
      className="w-full bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 border-t border-slate-200 dark:border-slate-800 transition-colors duration-200"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
        {/* Main Footer Content */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8 lg:gap-12 mb-12">
          {/* Brand Column */}
          <div className="lg:col-span-2 space-y-4">
            <Link
              href="/"
              className="inline-flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
              aria-label="StellarVeriphy Home"
            >
              <span className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent">
                ⭐ StellarVeriphy
              </span>
            </Link>
            <p className="text-sm text-slate-600 dark:text-slate-400 max-w-sm leading-relaxed">
              Decentralized, trustless content verification and cryptographic provenance tracking
              powered by the Stellar blockchain and Soroban smart contracts.
            </p>

            {/* Documentation Quick Link */}
            <div className="pt-4 mt-4 border-t border-slate-200 dark:border-slate-800">
              <Link
                href="/docs"
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium"
                aria-label="Read project documentation for getting started"
              >
                <span>📖</span>
                <span>Read the Docs</span>
              </Link>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                Get started with guides and API reference
              </p>
            </div>

            {/* Network / Status Badge */}
            <div className="flex items-center gap-2 pt-2 text-xs font-medium text-slate-500 dark:text-slate-400">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span>Network: Stellar Testnet &amp; Mainnet Ready</span>
            </div>

            {/* Social Media Links */}
            <div className="pt-3">
              <span className="block text-xs font-semibold uppercase tracking-wider text-slate-900 dark:text-slate-200 mb-3">
                Connect With Us
              </span>
              <div className="flex items-center gap-3">
                {/* GitHub */}
                <a
                  href="https://github.com/Stellar-Veriphy/Stellar-Veriphy"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="GitHub Repository"
                  className="p-2 rounded-lg bg-slate-200/70 dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <svg
                    className="w-5 h-5"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                      clipRule="evenodd"
                    />
                  </svg>
                </a>

                {/* Twitter / X */}
                <a
                  href="https://twitter.com/StellarOrg"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Twitter (X)"
                  className="p-2 rounded-lg bg-slate-200/70 dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <svg
                    className="w-5 h-5"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                </a>

                {/* Discord */}
                <a
                  href="https://discord.gg/stellar"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Discord Community"
                  className="p-2 rounded-lg bg-slate-200/70 dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <svg
                    className="w-5 h-5"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.893.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                  </svg>
                </a>

                {/* Stellar Community */}
                <a
                  href="https://stellar.org/community"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Stellar Community"
                  className="p-2 rounded-lg bg-slate-200/70 dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <svg
                    className="w-5 h-5"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                  </svg>
                </a>
              </div>
            </div>
          </div>

          {/* Product Links */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-900 dark:text-slate-200 mb-4">
              Product
            </h3>
            <ul className="space-y-2.5 text-sm">
              {productLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors focus:outline-none focus:underline"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Tools Links */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-900 dark:text-slate-200 mb-4">
              Tools &amp; Utilities
            </h3>
            <ul className="space-y-2.5 text-sm">
              {toolLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors focus:outline-none focus:underline"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Resources & Legal */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-900 dark:text-slate-200 mb-4">
              Resources &amp; Legal
            </h3>
            <ul className="space-y-2.5 text-sm">
              {resourceLinks.map((link) => (
                <li key={link.href}>
                  {link.external ? (
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`transition-colors focus:outline-none focus:underline inline-flex items-center gap-1 ${
                        link.label === "Documentation"
                          ? "font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                          : "hover:text-blue-600 dark:hover:text-blue-400"
                      }`}
                    >
                      {link.label}
                      <span aria-hidden="true" className="text-xs">
                        ↗
                      </span>
                    </a>
                  ) : (
                    <Link
                      href={link.href}
                      className={`transition-colors focus:outline-none focus:underline ${
                        link.label === "Documentation"
                          ? "font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                          : "hover:text-blue-600 dark:hover:text-blue-400"
                      }`}
                    >
                      {link.label}
                    </Link>
                  )}
                </li>
              ))}
              {legalLinks.map((link) => (
                <li key={link.href}>
                  {link.external ? (
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors focus:outline-none focus:underline inline-flex items-center gap-1"
                    >
                      {link.label}
                      <span aria-hidden="true" className="text-xs">
                        ↗
                      </span>
                    </a>
                  ) : (
                    <Link
                      href={link.href}
                      className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors focus:outline-none focus:underline"
                    >
                      {link.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom Bar: Copyright & Compliance */}
        <div className="pt-8 mt-8 border-t border-slate-200 dark:border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
          <p>&copy; {currentYear} StellarVeriphy. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <Link
              href="/privacy"
              className="hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
            >
              Privacy
            </Link>
            <a
              href="https://github.com/Stellar-Veriphy/Stellar-Veriphy/blob/main/LICENSE"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
            >
              Terms &amp; License
            </a>
            <span>Built on Stellar &amp; Soroban</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
