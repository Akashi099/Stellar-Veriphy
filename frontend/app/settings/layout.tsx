import type { ReactNode } from "react";
import type { Metadata } from "next";

const TITLE = "Settings";
const DESCRIPTION =
  "Manage preferences, notifications, offline cache, and backup your locally stored data.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return children;
}
