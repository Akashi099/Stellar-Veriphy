import type { Metadata } from "next";

const TITLE = "Developer Tools";
const DESCRIPTION =
  "Hash calculators, signature verifiers, API key management, and audit logs for developers.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

export default function ToolsLayout({ children }: { children: React.ReactNode }) {
  return <div dir="rtl">{children}</div>;
}
