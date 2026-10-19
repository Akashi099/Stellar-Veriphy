import type { Metadata } from "next";
import Link from "next/link";

import { DisputeEvidencePackageView } from "@/components/admin/DisputeEvidencePackageView";
import { t } from "@/lib/i18n";

export const metadata: Metadata = {
  title: t("admin.evidence.metadata.title"),
  description: t("admin.evidence.metadata.description"),
};

export default async function DisputeEvidencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main id="main-content" className="min-h-screen bg-gray-50 dark:bg-gray-900 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <Link href="/admin/moderation" className="text-sm text-blue-600 hover:underline">
            {t("admin.evidence.backLink")}
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-gray-900 dark:text-gray-50">{t("admin.evidence.title")}</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t("admin.evidence.description")}
          </p>
        </div>
        <DisputeEvidencePackageView disputeId={id} />
      </div>
    </main>
  );
}
