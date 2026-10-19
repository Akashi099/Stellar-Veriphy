import type { Metadata } from "next";

const TITLE = "Provenance";
const DESCRIPTION =
  "Explore provenance records, audit trails, version history, and bulk exports on StellarVeriphy.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

export default function ProvenanceLayout({ children }: { children: React.ReactNode }) {
  return children;
}
