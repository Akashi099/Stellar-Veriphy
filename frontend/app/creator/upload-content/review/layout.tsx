import type { Metadata } from "next";

const TITLE = "Review & Submit";
const DESCRIPTION =
  "Review your content hashes and manifest before submitting for on-chain verification.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
};

export default function ReviewLayout({ children }: { children: React.ReactNode }) {
  return children;
}
