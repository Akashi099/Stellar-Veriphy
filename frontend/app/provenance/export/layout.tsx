import type { Metadata } from "next";

const TITLE = "Export Provenance Records";
const DESCRIPTION =
  "Download provenance records as CSV, JSON, or NDJSON for audits, research, and compliance.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

export default function ProvenanceExportLayout({ children }: { children: React.ReactNode }) {
  return children;
}
