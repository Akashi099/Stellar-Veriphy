import type { Metadata } from "next";

const TITLE = "Audit Logs";
const DESCRIPTION = "Review tamper-evident security events, retention policy, and exportable compliance summaries.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION },
};

export default function AuditLogsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
