import type { Metadata } from "next";

const TITLE = "Certificate Explorer";
const DESCRIPTION =
  "Search and filter provenance certificates by status, creator, level, and date range. Export results as JSON or CSV.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

export default function CertificatesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
