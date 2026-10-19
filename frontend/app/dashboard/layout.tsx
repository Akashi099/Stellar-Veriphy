import type { Metadata } from "next";

const TITLE = "Dashboard";
const DESCRIPTION =
  "Overview of your provenance records, recent activity, and verification metrics.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
