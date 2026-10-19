import type { Metadata } from "next";

const TITLE = "Attach Manifest";
const DESCRIPTION = "Attach a JSON or XML content manifest to associate metadata with your upload.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
};

export default function ManifestStepLayout({ children }: { children: React.ReactNode }) {
  return children;
}
