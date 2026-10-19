import type { Metadata } from "next";

const TITLE = "Content Hash Calculator";
const DESCRIPTION = "Calculate SHA-256 and SHA-512 hashes for files locally in the browser, with progress tracking and comparison.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION },
};

export default function HashCalculatorLayout({ children }: { children: React.ReactNode }) {
  return children;
}
