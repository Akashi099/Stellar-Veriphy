import type { Metadata } from "next";

const TITLE = "Verification History";
const DESCRIPTION =
  "A private, browser-only log of certificates you have looked up or verified, with date filtering and export.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

export default function VerificationHistoryLayout({ children }: { children: React.ReactNode }) {
  return children;
}
