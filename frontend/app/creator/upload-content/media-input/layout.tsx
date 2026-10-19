import type { Metadata } from "next";

const TITLE = "Upload Media";
const DESCRIPTION = "Select or upload the media file you want to register for provenance.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
};

export default function MediaInputLayout({ children }: { children: React.ReactNode }) {
  return children;
}
