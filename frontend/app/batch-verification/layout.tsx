import type { Metadata } from "next";

const TITLE = "Batch Verification";
const DESCRIPTION = "Verify multiple assets and manifests at once, with per-item results.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

export default function BatchVerificationLayout({ children }: { children: React.ReactNode }) {
  return <div dir="rtl">{children}</div>;
}
