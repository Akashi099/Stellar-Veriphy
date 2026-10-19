import Link from "next/link";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/landing/Header";
import { FiArrowLeft, FiArrowRight, FiCheck } from "react-icons/fi";

export const metadata = {
  title: "API Documentation",
  description: "StellarVeriphy API reference and documentation",
};

export default function ApiDocsPage() {
  const endpoints = [
    {
      title: "Authentication",
      description: "API key management and authentication methods",
      methods: [
        { method: "POST", path: "/auth/generate-key", description: "Generate a new API key" },
        { method: "POST", path: "/auth/validate", description: "Validate API key" },
        { method: "DELETE", path: "/auth/revoke-key/:id", description: "Revoke an API key" },
      ],
    },
    {
      title: "Verification",
      description: "Core verification endpoints",
      methods: [
        { method: "POST", path: "/verify", description: "Verify a single piece of content" },
        { method: "POST", path: "/verify/batch", description: "Verify multiple items" },
        { method: "GET", path: "/verify/:id", description: "Get verification details" },
        { method: "GET", path: "/verify/history", description: "Get verification history" },
      ],
    },
    {
      title: "Records",
      description: "Blockchain record management",
      methods: [
        { method: "GET", path: "/records/:hash", description: "Get blockchain record" },
        { method: "POST", path: "/records/batch", description: "Get multiple records" },
        { method: "GET", path: "/records/:hash/proof", description: "Get proof of record" },
      ],
    },
    {
      title: "Webhooks",
      description: "Webhook management and events",
      methods: [
        { method: "POST", path: "/webhooks", description: "Create webhook endpoint" },
        { method: "GET", path: "/webhooks", description: "List webhooks" },
        { method: "DELETE", path: "/webhooks/:id", description: "Delete webhook" },
        { method: "POST", path: "/webhooks/:id/test", description: "Test webhook" },
      ],
    },
  ];

  return (
    <main id="main-content" className="min-h-screen bg-slate-900" aria-label="API documentation">
      <Header />
      <div className="pt-16">
        {/* Hero Section */}
        <section className="py-12 sm:py-16 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-slate-800 to-slate-900">
          <div className="max-w-6xl mx-auto">
            <Link
              href="/developer"
              className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 mb-6 sm:mb-8 transition-colors"
              aria-label="Back to developer portal"
            >
              <FiArrowLeft className="w-4 h-4" aria-hidden="true" />
              Back to Developer Portal
            </Link>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4 sm:mb-6">API Documentation</h1>
            <p className="text-lg sm:text-xl text-gray-300 max-w-3xl">
              Complete reference for all StellarVeriphy API endpoints with examples and best practices.
            </p>
          </div>
        </section>

        {/* Quick Reference */}
        <section className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8" aria-label="API reference">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-bold text-white text-center mb-12 sm:mb-16">API Endpoints</h2>

            <div className="space-y-8 sm:space-y-12">
              {endpoints.map((section, index) => (
                <div key={index} className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
                  <div className="p-6 sm:p-8 bg-gradient-to-r from-slate-800 to-slate-750">
                    <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">{section.title}</h2>
                    <p className="text-gray-400 text-sm sm:text-base">{section.description}</p>
                  </div>

                  <div className="p-6 sm:p-8 space-y-4">
                    {section.methods.map((endpoint, endpointIndex) => (
                      <div key={endpointIndex} className="border-l-4 border-blue-600 p-4 bg-slate-700 rounded">
                        <div className="flex items-center gap-4 mb-2">
                          <span
                            className={`inline-block px-3 py-1 rounded font-mono font-bold text-sm ${
                              endpoint.method === "GET"
                                ? "bg-blue-900 text-blue-200"
                                : endpoint.method === "POST"
                                  ? "bg-green-900 text-green-200"
                                  : "bg-red-900 text-red-200"
                            }`}
                          >
                            {endpoint.method}
                          </span>
                          <code className="text-gray-300 font-mono text-sm sm:text-base flex-1 break-all">{endpoint.path}</code>
                        </div>
                        <p className="text-gray-400 text-sm ml-16">{endpoint.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Authentication */}
        <section className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8 bg-slate-800" aria-label="Authentication">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-8 sm:mb-12">Authentication</h2>

            <div className="bg-slate-700 rounded-lg p-6 sm:p-8 border border-slate-600">
              <h3 className="text-xl sm:text-2xl font-bold text-white mb-4">API Key Authentication</h3>

              <p className="text-gray-300 mb-6 text-sm sm:text-base">
                Include your API key in the Authorization header for all requests:
              </p>

              <pre className="bg-slate-900 text-gray-300 p-4 rounded-lg overflow-x-auto mb-6 text-xs sm:text-sm font-mono">
                <code>{`curl -H "Authorization: Bearer YOUR_API_KEY" \\
  https://api.stellarveriphy.dev/verify`}</code>
              </pre>

              <div className="space-y-4">
                <div>
                  <h4 className="text-lg font-semibold text-blue-400 mb-2">Request Example</h4>
                  <pre className="bg-slate-900 text-gray-300 p-4 rounded text-xs sm:text-sm font-mono overflow-x-auto">
                    <code>{`POST /verify HTTP/1.1
Authorization: Bearer your_api_key
Content-Type: application/json

{
  "content": "base64_encoded_content",
  "contentType": "image/png",
  "metadata": {
    "source": "original",
    "creator": "user@example.com"
  }
}`}</code>
                  </pre>
                </div>

                <div>
                  <h4 className="text-lg font-semibold text-blue-400 mb-2">Success Response</h4>
                  <pre className="bg-slate-900 text-gray-300 p-4 rounded text-xs sm:text-sm font-mono overflow-x-auto">
                    <code>{`HTTP/1.1 201 Created
Content-Type: application/json

{
  "id": "ver_123456",
  "hash": "sha256_hash_value",
  "timestamp": "2024-08-30T10:30:00Z",
  "status": "verified",
  "blockchainHash": "stellar_tx_hash",
  "metadata": {
    "source": "original",
    "creator": "user@example.com"
  }
}`}</code>
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Error Handling */}
        <section className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8" aria-label="Error handling">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-bold text-white text-center mb-12 sm:mb-16">Status Codes & Error Handling</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
              {[
                { code: "200", title: "OK", description: "Request successful" },
                { code: "201", title: "Created", description: "Resource created successfully" },
                { code: "400", title: "Bad Request", description: "Invalid request parameters" },
                { code: "401", title: "Unauthorized", description: "Invalid or missing API key" },
                { code: "429", title: "Rate Limited", description: "Too many requests" },
                { code: "500", title: "Server Error", description: "Internal server error" },
              ].map((item, index) => (
                <div key={index} className="p-6 sm:p-8 bg-slate-800 rounded-lg border border-slate-700">
                  <div className="flex items-start gap-4">
                    <span
                      className={`inline-block px-3 py-1 rounded font-bold text-sm ${
                        parseInt(item.code) < 300
                          ? "bg-green-900 text-green-200"
                          : parseInt(item.code) < 400
                            ? "bg-blue-900 text-blue-200"
                            : "bg-red-900 text-red-200"
                      }`}
                    >
                      {item.code}
                    </span>
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-white mb-1">{item.title}</h3>
                      <p className="text-gray-400 text-sm">{item.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Next Steps */}
        <section className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-blue-900 to-slate-900" aria-label="Next steps">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4 sm:mb-6">Ready to Build?</h2>
            <p className="text-lg text-gray-300 mb-8 sm:mb-12">
              Check out code examples or try the interactive playground.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/developer/examples"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-white text-blue-900 font-semibold rounded-lg hover:bg-gray-100 transition-all focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-blue-900 active:scale-95"
                aria-label="View code examples"
              >
                Code Examples
                <FiArrowRight className="w-5 h-5" aria-hidden="true" />
              </Link>
              <Link
                href="/developer/playground"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-blue-900 active:scale-95"
                aria-label="Try the playground"
              >
                Try Playground
              </Link>
            </div>
          </div>
        </section>

        <Footer />
      </div>
    </main>
  );
}
