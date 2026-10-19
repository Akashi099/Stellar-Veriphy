import type { Metadata } from "next";

const TITLE = "Advanced Manifest Editor";
const DESCRIPTION =
  "Rich manifest editor with real-time JSON schema validation, auto-complete, field enforcement, and schema version selection.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

export default function ManifestEditorLayout({ children }: { children: React.ReactNode }) {
  return children;
}
