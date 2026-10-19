"use client";

/**
 * Transaction History Explorer Page
 *
 * Browse and search all blockchain transactions related to user's certificates and verifications.
 * Features:
 * - List all user transactions with pagination
 * - Filter by transaction type
 * - Search transactions
 * - Transaction status indicators
 * - View detailed transaction information
 * - Link to Stellar block explorer
 * - Export transaction history as CSV
 */

import {
  AlertCircle,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  ExternalLink,
  Filter,
  Loader2,
  Search,
  TrendingUp,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { TransactionDetailsModal } from "@/components/transactions/TransactionDetailsModal";
import { StatsCardsSkeleton, TransactionListSkeleton } from "@/components/ui/Skeleton";
import { useWallet } from "@/context/WalletContext";
import {
  exportTransactions,
  fetchTransactionHistory,
  getTransactionStats,
} from "@/services/transactionService";
import type { Transaction, TransactionFilters, TransactionType } from "@/types/transaction.types";

// Transaction type options for filter dropdown
const TRANSACTION_TYPE_OPTIONS: { value: TransactionType | "all"; label: string }[] = [
  { value: "all", label: "All Types" },
  { value: "certificate_mint", label: "Certificate Minted" },
  { value: "certificate_transfer", label: "Certificate Transferred" },
  { value: "certificate_revoke", label: "Certificate Revoked" },
  { value: "certificate_renew", label: "Certificate Renewed" },
  { value: "verification_submit", label: "Verification Submitted" },
  { value: "verification_complete", label: "Verification Completed" },
  { value: "metadata_update", label: "Metadata Updated" },
];

export default function TransactionsPage() {
  const { publicKey, connected } = useWallet();

  // State
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const itemsPerPage = 20;

  // Filters
  const [filters, setFilters] = useState<TransactionFilters>({
    type: "all",
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // Stats
  const [stats, setStats] = useState<{
    total: number;
    last30Days: number;
    byStatus: Record<string, number>;
  } | null>(null);

  // Load transaction history
  const loadTransactions = useCallback(async () => {
    if (!connected || !publicKey) return;

    setLoading(true);
    try {
      const result = await fetchTransactionHistory(
        publicKey,
        { ...filters, ...(searchQuery ? { searchQuery } : {}) },
        { page: currentPage, limit: itemsPerPage }
      );

      setTransactions(result.transactions);
      setTotal(result.total);
      setTotalPages(Math.ceil(result.total / itemsPerPage));
      setHasMore(result.hasMore);
    } catch (error) {
      console.error("Failed to load transactions:", error);
    } finally {
      setLoading(false);
    }
  }, [connected, publicKey, filters, searchQuery, currentPage]);

  // Load stats
  const loadStats = useCallback(async () => {
    if (!connected || !publicKey) return;

    try {
      const statsData = await getTransactionStats(publicKey);
      setStats(statsData);
    } catch (error) {
      console.error("Failed to load stats:", error);
    }
  }, [connected, publicKey]);

  // Effects
  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // Handlers
  const handleFilterChange = (key: keyof TransactionFilters, value: unknown) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setCurrentPage(1);
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setCurrentPage(1);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleViewDetails = (transaction: Transaction) => {
    setSelectedTransaction(transaction);
    setIsModalOpen(true);
  };

  const handleExport = async (format: "csv" | "json") => {
    if (!publicKey) return;

    setExporting(true);
    try {
      const data = await exportTransactions(publicKey, {
        format,
        filters,
        includeMetadata: true,
      });

      // Download file
      const blob = new Blob([data], {
        type: format === "csv" ? "text/csv" : "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `transactions_${new Date().toISOString().split("T")[0]}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to export transactions:", error);
    } finally {
      setExporting(false);
    }
  };

  // Helper functions
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days} days ago`;

    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
  };

  const truncateHash = (hash: string) => {
    return `${hash.substring(0, 8)}...${hash.substring(hash.length - 8)}`;
  };

  const getStatusIcon = (status: Transaction["status"]) => {
    switch (status) {
      case "success":
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case "failed":
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      case "pending":
        return <Clock className="w-5 h-5 text-yellow-500" />;
    }
  };

  const getStatusColor = (status: Transaction["status"]) => {
    switch (status) {
      case "success":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "failed":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
      case "pending":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
    }
  };

  // Not connected state
  if (!connected) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            Connect Your Wallet
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Please connect your wallet to view transaction history
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Transaction History
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Browse and search all blockchain transactions related to your certificates
          </p>
        </div>

        {/* Stats Cards */}
        {!stats ? (
          <StatsCardsSkeleton count={3} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white dark:bg-gray-900 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-800">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                    Total Transactions
                  </p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</p>
                </div>
                <TrendingUp className="w-8 h-8 text-blue-500" />
              </div>
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-800">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Last 30 Days</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {stats.last30Days}
                  </p>
                </div>
                <Clock className="w-8 h-8 text-purple-500" />
              </div>
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-800">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Success Rate</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {stats.total > 0
                      ? Math.round(((stats.byStatus.success || 0) / stats.total) * 100)
                      : 0}
                    %
                  </p>
                </div>
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
            </div>
          </div>
        )}

        {/* Toolbar */}
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by hash, certificate ID, or description..."
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Filter Type */}
            <div className="md:w-64">
              <select
                value={filters.type || "all"}
                onChange={(e) => handleFilterChange("type", e.target.value as TransactionType)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {TRANSACTION_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Export Button */}
            <div className="relative">
              <button
                onClick={() => handleExport("csv")}
                disabled={exporting || transactions.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white rounded-lg transition-colors disabled:cursor-not-allowed"
              >
                {exporting ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Download className="w-5 h-5" />
                )}
                Export CSV
              </button>
            </div>
          </div>
        </div>

        {/* Transaction List */}
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
          {loading ? (
            <TransactionListSkeleton count={10} />
          ) : transactions.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 dark:text-gray-400">No transactions found</p>
            </div>
          ) : (
            <>
              {/* Desktop View */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Type
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Description
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Transaction Hash
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {transactions.map((tx) => (
                      <tr
                        key={tx.id}
                        className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">{getStatusIcon(tx.status)}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm text-gray-900 dark:text-white capitalize">
                            {tx.type.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-900 dark:text-white">
                            {tx.description}
                          </div>
                          {tx.certificateId && (
                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 font-mono">
                              {tx.certificateId}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <code className="text-sm font-mono text-gray-600 dark:text-gray-300">
                            {truncateHash(tx.stellarTxHash)}
                          </code>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {formatDate(tx.timestamp)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                          <button
                            onClick={() => handleViewDetails(tx)}
                            className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
                          >
                            Details
                          </button>
                          <a
                            href={`https://stellar.expert/explorer/testnet/tx/${tx.stellarTxHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-3 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                          >
                            <ExternalLink className="w-4 h-4 inline" />
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile View */}
              <div className="md:hidden divide-y divide-gray-200 dark:divide-gray-700">
                {transactions.map((tx) => (
                  <div key={tx.id} className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(tx.status)}
                        <span className="text-sm font-medium text-gray-900 dark:text-white capitalize">
                          {tx.type.replace(/_/g, " ")}
                        </span>
                      </div>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {formatDate(tx.timestamp)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                      {tx.description}
                    </p>
                    {tx.certificateId && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 font-mono">
                        {tx.certificateId}
                      </p>
                    )}
                    <code className="text-xs font-mono text-gray-600 dark:text-gray-400 block mb-3">
                      {truncateHash(tx.stellarTxHash)}
                    </code>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleViewDetails(tx)}
                        className="flex-1 px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded transition-colors"
                      >
                        View Details
                      </button>
                      <a
                        href={`https://stellar.expert/explorer/testnet/tx/${tx.stellarTxHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-2 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm rounded hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <nav
            aria-label="Transaction history pagination"
            className="mt-6 flex items-center justify-between"
          >
            <p
              className="text-sm text-gray-600 dark:text-gray-400"
              aria-live="polite"
              aria-atomic="true"
            >
              Showing {(currentPage - 1) * itemsPerPage + 1} to{" "}
              {Math.min(currentPage * itemsPerPage, total)} of {total} transactions
              <span className="sr-only">
                {" "}
                — page {currentPage} of {totalPages}
              </span>
            </p>

            <ul className="flex items-center gap-2">
              <li>
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  aria-label="Go to previous page"
                  className="p-2 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <ChevronLeft
                    className="w-5 h-5 text-gray-600 dark:text-gray-400"
                    aria-hidden="true"
                  />
                </button>
              </li>

              {[...Array(Math.min(totalPages, 5))].map((_, idx) => {
                let pageNum;
                if (totalPages <= 5) {
                  pageNum = idx + 1;
                } else if (currentPage <= 3) {
                  pageNum = idx + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + idx;
                } else {
                  pageNum = currentPage - 2 + idx;
                }

                const isCurrent = currentPage === pageNum;

                return (
                  <li key={pageNum}>
                    <button
                      onClick={() => handlePageChange(pageNum)}
                      aria-current={isCurrent ? "page" : undefined}
                      aria-label={
                        isCurrent ? `Page ${pageNum}, current page` : `Go to page ${pageNum}`
                      }
                      className={`px-3 py-2 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                        isCurrent
                          ? "bg-blue-500 text-white"
                          : "border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400"
                      }`}
                    >
                      {pageNum}
                    </button>
                  </li>
                );
              })}

              <li>
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  aria-label="Go to next page"
                  className="p-2 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <ChevronRight
                    className="w-5 h-5 text-gray-600 dark:text-gray-400"
                    aria-hidden="true"
                  />
                </button>
              </li>
            </ul>
          </nav>
        )}
      </div>

      {/* Transaction Details Modal */}
      <TransactionDetailsModal
        transaction={selectedTransaction}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        network="testnet"
      />
    </div>
  );
}
