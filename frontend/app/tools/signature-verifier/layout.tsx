import type { Metadata } from "next";

const TITLE = "Signature Verifier";
const DESCRIPTION = "Validate attestation and payload signatures using public-key formats, directly in the browser.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION },
};

export default function SignatureVerifierLayout({ children }: { children: React.ReactNode }) {
  return children;
}
