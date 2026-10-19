import type { Metadata } from "next";

import { ModerationQueue } from "@/components/admin/ModerationQueue";
import { t } from "@/lib/i18n";

export const metadata: Metadata = {
  title: t("admin.moderation.metadata.title"),
  description: t("admin.moderation.metadata.description"),
};

export default function AdminModerationPage() {
  return (
    <main id="main-content" className="min-h-screen bg-gray-50 dark:bg-gray-900 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">
            {t("admin.moderation.title")}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t("admin.moderation.description")}
          </p>
        </div>
        <ModerationQueue />
      </div>
    </main>
  );
}
