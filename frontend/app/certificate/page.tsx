"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CertificateVerificationPanel } from "@/components/certificates/CertificateVerificationPanel";

function CertificatePageContent() {
  const searchParams = useSearchParams();
  return <CertificateVerificationPanel initialCertificateId={searchParams.get("id")} />;
}

export default function CertificatePage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      <Suspense fallback={null}>
        <CertificatePageContent />
      </Suspense>
    </main>
  );
}
