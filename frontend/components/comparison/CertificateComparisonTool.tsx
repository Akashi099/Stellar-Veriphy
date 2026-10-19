"use client";

import { AlertCircle, CheckCircle, Download, GitCompare, Search, Share2, X } from "lucide-react";
import { useCallback, useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Certificate {
  id: string;
  contentHash: string;
  creator: string;
  timestamp: number;
  storageRef: string;
  manifestHash: string;
  attestationHash: string;
  metadata?: Record<string, string | number | boolean>;
  provenance?: Record<string, string | number | boolean>;
  status: string;
}

interface CertificateComparisonToolProps {
  onSearch?: (query: string) => Promise<Certificate[]>;
  certificates?: Certificate[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CertificateComparisonTool({
  onSearch,
  certificates: initialCertificates = [],
}: CertificateComparisonToolProps) {
  const [selectedCertificates, setSelectedCertificates] = useState<Certificate[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Certificate[]>(initialCertificates);
  const [isSearching, setIsSearching] = useState(false);
  const [comparisonMode, setComparisonMode] = useState<"side-by-side" | "diff">("side-by-side");

  // Search certificates
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    try {
      if (onSearch) {
        const results = await onSearch(searchQuery);
        setSearchResults(results);
      } else {
        // Mock search for demo
        const mockResults: Certificate[] = [
          {
            id: `CERT-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
            contentHash: "0x" + "a".repeat(64),
            creator: "GABC...XYZ",
            timestamp: Date.now() / 1000,
            storageRef: "ipfs://QmExample1",
            manifestHash: "0x" + "b".repeat(64),
            attestationHash: "0x" + "c".repeat(64),
            status: "verified",
            metadata: { device: "iPhone 13", location: "New York", license: "Editorial" },
            provenance: { source: "creator-upload", chain: "testnet", policy: "standard" },
          },
          {
            id: `CERT-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
            contentHash: "0x" + "d".repeat(64),
            creator: "GDEF...ABC",
            timestamp: Date.now() / 1000 - 86400,
            storageRef: "ipfs://QmExample2",
            manifestHash: "0x" + "e".repeat(64),
            attestationHash: "0x" + "f".repeat(64),
            status: "verified",
            metadata: { device: "Canon EOS R5", location: "Los Angeles", license: "Commercial" },
            provenance: { source: "dispute-update", chain: "testnet", policy: "enhanced-review" },
          },
        ];
        setSearchResults(mockResults);
      }
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, onSearch]);

  // Add certificate to comparison
  const addCertificate = useCallback(
    (cert: Certificate) => {
      if (selectedCertificates.length >= 3) {
        alert("You can compare up to 3 certificates at a time");
        return;
      }
      if (selectedCertificates.find((c) => c.id === cert.id)) {
        return;
      }
      setSelectedCertificates((prev) => [...prev, cert]);
    },
    [selectedCertificates]
  );

  // Remove certificate from comparison
  const removeCertificate = useCallback((id: string) => {
    setSelectedCertificates((prev) => prev.filter((c) => c.id !== id));
  }, []);

  // Export comparison report
  const exportReport = useCallback(() => {
    const report = {
      timestamp: new Date().toISOString(),
      certificates: selectedCertificates.map((cert) => ({
        id: cert.id,
        contentHash: cert.contentHash,
        creator: cert.creator,
        timestamp: cert.timestamp,
        storageRef: cert.storageRef,
        manifestHash: cert.manifestHash,
        attestationHash: cert.attestationHash,
        metadata: cert.metadata,
        status: cert.status,
      })),
      differences: findDifferences(),
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `certificate-comparison-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [selectedCertificates]);

  // Share comparison link
  const shareComparison = useCallback(() => {
    const ids = selectedCertificates.map((c) => c.id).join(",");
    const url = `${window.location.origin}/compare?certificates=${encodeURIComponent(ids)}`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(url);
      alert("Comparison link copied to clipboard!");
    } else {
      alert(`Share this link: ${url}`);
    }
  }, [selectedCertificates]);

  // Find differences between certificates
  const findDifferences = useCallback(() => {
    if (selectedCertificates.length < 2) return [];

    const differences: Array<{ field: string; values: Array<string | number | boolean> }> = [];
    const fields: Array<keyof Pick<Certificate, "creator" | "status" | "storageRef" | "manifestHash" | "attestationHash">> = [
      "creator",
      "status",
      "storageRef",
      "manifestHash",
      "attestationHash",
    ];

    for (const field of fields) {
      const values = selectedCertificates.map((c) => c[field]);
      const unique = new Set(values);
      if (unique.size > 1) {
        differences.push({ field, values });
      }
    }

    const compareNested = (label: "metadata" | "provenance") => {
      const allKeys = new Set<string>();
      selectedCertificates.forEach((c) => {
        Object.keys(c[label] || {}).forEach((k) => allKeys.add(k));
      });

      allKeys.forEach((key) => {
        const values = selectedCertificates.map((c) => c[label]?.[key] || "N/A");
        const unique = new Set(values);
        if (unique.size > 1) {
          differences.push({ field: `${label}.${key}`, values });
        }
      });
    };

    compareNested("metadata");
    compareNested("provenance");

    return differences;
  }, [selectedCertificates]);

  const differences = findDifferences();

  // Format timestamp
  const formatTime = (ts: number) => {
    return new Date(ts * 1000).toLocaleString();
  };

  // Truncate hash
  const truncateHash = (hash: string) => {
    if (hash.length <= 16) return hash;
    return hash.slice(0, 10) + "..." + hash.slice(-6);
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Certificate Comparison
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Compare up to 3 asset versions across metadata and provenance fields
          </p>
        </div>

        {selectedCertificates.length >= 2 && (
          <div className="flex items-center gap-2">
            <button
              onClick={exportReport}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
            <button
              onClick={shareComparison}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              <Share2 className="w-4 h-4" />
              Share
            </button>
          </div>
        )}
      </div>

      {/* Search */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Search by certificate ID, creator, or content hash..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <button
          onClick={handleSearch}
          disabled={isSearching || !searchQuery.trim()}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          {isSearching ? "Searching..." : "Search"}
        </button>
      </div>

      {/* Search Results */}
      {searchResults.length > 0 && selectedCertificates.length < 3 && (
        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">
            Select certificates to compare:
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {searchResults.map((cert) => (
              <button
                key={cert.id}
                onClick={() => addCertificate(cert)}
                disabled={selectedCertificates.find((c) => c.id === cert.id) !== undefined}
                className="text-left p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <p className="font-mono text-sm font-medium text-gray-900 dark:text-white">
                  {cert.id}
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                  {truncateHash(cert.contentHash)}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Selected Certificates */}
      {selectedCertificates.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 dark:bg-gray-900 rounded-lg">
          <GitCompare className="w-16 h-16 mx-auto text-gray-300 dark:text-gray-700 mb-4" />
          <p className="text-gray-600 dark:text-gray-400">
            Search and select certificates to start comparing
          </p>
        </div>
      ) : (
        <>
          {/* Comparison Mode Toggle */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setComparisonMode("side-by-side")}
              className={`px-4 py-2 rounded-lg transition-colors ${
                comparisonMode === "side-by-side"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white"
              }`}
            >
              Side by Side
            </button>
            <button
              onClick={() => setComparisonMode("diff")}
              className={`px-4 py-2 rounded-lg transition-colors ${
                comparisonMode === "diff"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white"
              }`}
            >
              Differences Only
            </button>
          </div>

          {comparisonMode === "side-by-side" ? (
            /* Side by Side View */
            <div
              className="grid gap-4"
              style={{
                gridTemplateColumns: `repeat(${selectedCertificates.length}, minmax(0, 1fr))`,
              }}
            >
              {selectedCertificates.map((cert) => (
                <div
                  key={cert.id}
                  className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 relative"
                >
                  <button
                    onClick={() => removeCertificate(cert.id)}
                    className="absolute top-2 right-2 p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>

                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-gray-600 dark:text-gray-400">Certificate ID</p>
                      <p className="font-mono text-sm font-medium text-gray-900 dark:text-white mt-1">
                        {cert.id}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-gray-600 dark:text-gray-400">Content Hash</p>
                      <p className="font-mono text-xs text-gray-700 dark:text-gray-300 mt-1 break-all">
                        {truncateHash(cert.contentHash)}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-gray-600 dark:text-gray-400">Creator</p>
                      <p className="font-mono text-xs text-gray-700 dark:text-gray-300 mt-1">
                        {cert.creator}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-gray-600 dark:text-gray-400">Timestamp</p>
                      <p className="text-xs text-gray-700 dark:text-gray-300 mt-1">
                        {formatTime(cert.timestamp)}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-gray-600 dark:text-gray-400">Status</p>
                      <p className="text-xs font-medium text-green-600 dark:text-green-400 mt-1">
                        {cert.status}
                      </p>
                    </div>

                    {cert.metadata && Object.keys(cert.metadata).length > 0 && (
                      <div>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">Metadata</p>
                        <div className="space-y-1">
                          {Object.entries(cert.metadata).map(([key, value]) => (
                            <div key={key} className="text-xs">
                              <span className="text-gray-600 dark:text-gray-400">{key}:</span>{" "}
                              <span className="text-gray-900 dark:text-white">{String(value)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {cert.provenance && Object.keys(cert.provenance).length > 0 && (
                      <div>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">Provenance</p>
                        <div className="space-y-1">
                          {Object.entries(cert.provenance).map(([key, value]) => (
                            <div key={key} className="text-xs">
                              <span className="text-gray-600 dark:text-gray-400">{key}:</span>{" "}
                              <span className="text-gray-900 dark:text-white">{String(value)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Differences View */
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <GitCompare className="w-5 h-5" />
                Detected Differences
              </h3>

              {differences.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle className="w-12 h-12 mx-auto text-green-500 mb-2" />
                  <p className="text-gray-600 dark:text-gray-400">
                    No differences found between selected certificates
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        <th className="px-3 py-2 text-gray-600 dark:text-gray-400">Field</th>
                        {selectedCertificates.map((cert) => (
                          <th key={cert.id} className="px-3 py-2 font-mono text-xs text-gray-600 dark:text-gray-400">
                            {cert.id}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {differences.map((diff) => (
                        <tr key={diff.field} className="border-b border-gray-100 dark:border-gray-700/70">
                          <td className="px-3 py-3 font-medium text-gray-900 dark:text-white">
                            <span className="inline-flex items-center gap-2">
                              <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                              {diff.field}
                            </span>
                          </td>
                          {diff.values.map((value, valueIdx) => (
                            <td key={`${diff.field}-${valueIdx}`} className="px-3 py-3">
                              <code className="block max-w-xs whitespace-pre-wrap break-words rounded bg-amber-50 px-2 py-1 text-xs text-gray-800 dark:bg-amber-900/20 dark:text-gray-200">
                                {String(value)}
                              </code>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
