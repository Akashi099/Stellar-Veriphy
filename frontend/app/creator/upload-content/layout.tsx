"use client";

import { WizardProvider } from "@/context/WizardContext";
import Breadcrumbs from "@/components/ui/Breadcrumbs";

export default function UploadContentLayout({ children }: { children: React.ReactNode }) {
  return (
    <WizardProvider>
      <main className="max-w-2xl mx-auto py-12 px-4">
        <Breadcrumbs items={[{ label: "Creator", href: "/creator/jobs" }, { label: "Upload content" }]} />
        {children}
      </main>
    </WizardProvider>
  );
}
