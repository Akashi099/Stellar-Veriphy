import type { Metadata } from "next";

const TITLE = "Asset Version History";
const DESCRIPTION =
  "Browse all certified versions of an asset and perform auditable rollbacks to prior versions.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

export default function ProvenanceVersionsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
