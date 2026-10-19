"use client";

/**
 * Certificate Gallery Page — Issue #461
 */

import { CertificateGallery } from "@/components/certificates";
import { Header } from "@/components/Header";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";

export default function GalleryPage() {
  return (
    <main className="min-h-screen bg-white dark:bg-gray-950">
      <Header />
      <div className="mx-auto max-w-6xl px-6">
        <Breadcrumbs />
      </div>
      <div className="mx-auto max-w-6xl px-6 py-12">
        <h1 className="mb-6 text-2xl font-bold text-gray-900 dark:text-white">
          Certificate Gallery
        </h1>
        <CertificateGallery />
      </div>
    </main>
  );
}
