"use client";

/**
 * Tools index page — links to all standalone tools:
 * - Issue #216: Advanced Manifest Editor
 * - Issue #217: Content Hash Calculator
 * - Issue #218: Certificate Embedding Widget
 * - Issue #219: API Key Management
 * - Issue #265: Signature Verification UI
 * - Issue #266: Audit Logging UI
 */

import Link from "next/link";

import { Header } from "@/components/Header";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";

interface ToolCard {
  title: string;
  description: string;
  href: string;
  icon: string;
  badge: string;
  badgeColor: string;
}

const tools: ToolCard[] = [
  {
    title: "Advanced Manifest Editor",
    description:
      "Rich manifest editor with real-time JSON schema validation, field-type enforcement, required-field indicators, auto-complete, and schema version selection.",
    href: "/tools/manifest-editor",
    icon: "📝",
    badge: "#216",
    badgeColor: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  },
  {
    title: "Content Hash Calculator",
    description:
      "Calculate SHA-256 and SHA-512 hashes for your files locally in the browser. Supports large files with chunking and progress tracking, plus hash comparison.",
    href: "/tools/hash-calculator",
    icon: "🔐",
    badge: "#217",
    badgeColor: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  },
  {
    title: "Certificate Embedding Widget",
    description:
      "Embeddable JavaScript widget to display verification badges on external websites. Multiple styles, customizable colors, and responsive design.",
    href: "/widget-demo.html",
    icon: "🏅",
    badge: "#218",
    badgeColor: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  },
  {
    title: "API Key Management",
    description:
      "Generate and manage API keys for programmatic access to verification services. Includes scope management, rate limiting, usage analytics, and expiration dates.",
    href: "/tools/api-keys",
    icon: "🔑",
    badge: "#219",
    badgeColor: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  },
  {
    title: "Signature Verifier",
    description:
      "Validate attestation and payload signatures independently using a browser-based verifier that supports common public-key formats.",
    href: "/tools/signature-verifier",
    icon: "🛡️",
    badge: "#265",
    badgeColor: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  },
  {
    title: "Audit Logs",
    description:
      "Review tamper-evident security events, retention policy, and exportable compliance summaries for operational oversight.",
    href: "/tools/audit-logs",
    icon: "🧾",
    badge: "#266",
    badgeColor: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  },
  {
    title: "Compliance Audit Trail",
    description:
      "Structured, tamper-evident record of legal and compliance actions tied to provenance events — GDPR/CCPA requests, retention milestones, content disputes, and policy changes.",
    href: "/tools/compliance-audit",
    icon: "⚖️",
    badge: "#688",
    badgeColor: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
  },
  {
    title: "Verification History",
    description:
      "A local, browser-only timeline of certificates you've looked up or verified, with date filtering, export, and a privacy control to disable or clear tracking.",
    href: "/verification-history",
    icon: "🕘",
    badge: "#465",
    badgeColor: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  },
  {
    title: "App Settings & Backup",
    description:
      "Install StellarVeriphy as an app, manage push notifications and offline cache, and export/import an encrypted backup of your locally stored data.",
    href: "/settings",
    icon: "⚙️",
    badge: "#466 / #467",
    badgeColor: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
  },
  {
    title: "Metadata Redaction",
    description:
      "Controlled redaction for sensitive manifest fields. Hide location, device, or file details from public view while keeping the on-chain proof fully intact.",
    href: "/tools/manifest-redaction",
    icon: "🕶️",
    badge: "Privacy",
    badgeColor: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  },
];

export default function ToolsPage() {
  return (
    <main className="min-h-screen bg-white dark:bg-gray-950">
      <Header />
      <div className="max-w-6xl mx-auto px-6">
        <Breadcrumbs />
      </div>
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="mb-10">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-3">Developer Tools</h1>
          <p className="text-lg text-gray-600 dark:text-gray-400">
            Standalone utilities to help you build, verify, and integrate with StellarVeriphy.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {tools.map((tool) => (
            <Link
              key={tool.href}
              href={tool.href}
              className="group p-6 bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-800 rounded-xl hover:border-blue-500 dark:hover:border-blue-500 transition-all shadow-sm hover:shadow-md"
            >
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 text-4xl">{tool.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      {tool.title}
                    </h2>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-semibold ${tool.badgeColor}`}
                    >
                      {tool.badge}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                    {tool.description}
                  </p>
                  <span className="mt-3 inline-flex items-center text-sm text-blue-600 dark:text-blue-400 font-medium group-hover:gap-2 transition-all">
                    Open tool →
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
