import type { Metadata } from "next";

const TITLE = "Creator Studio";
const DESCRIPTION =
  "Upload media, attach manifests, and register your content for on-chain provenance verification.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

export default function CreatorLayout({ children }: { children: React.ReactNode }) {
  return children;
}
