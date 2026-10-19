import type { Metadata } from "next";

import { ApiTokenManager } from "@/components/admin/ApiTokenManager";
import { t } from "@/lib/i18n";

export const metadata: Metadata = {
  title: t("admin.tokens.metadata.title"),
  description: t("admin.tokens.metadata.description"),
};

export default function AdminApiTokensPage() {
  return (
    <main id="main-content" className="min-h-screen bg-gray-50 dark:bg-gray-900 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">{t("admin.tokens.title")}</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t("admin.tokens.description")} {t("admin.tokens.runbookBefore")}{" "}
            <code>docs/security/api-token-lifecycle.md</code> {t("admin.tokens.runbookAfter")}
          </p>
        </div>
        <ApiTokenManager />
      </div>
    </main>
  );
}
