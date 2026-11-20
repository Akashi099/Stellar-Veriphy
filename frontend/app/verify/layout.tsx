import type { Metadata } from "next";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
import { SkipLinks } from "@/utils/accessibility";

const TITLE = "Verify Content";
const DESCRIPTION =
  "Upload media and cryptographically verify its authenticity and provenance on the Stellar blockchain.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

export default function VerifyLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SkipLinks
        links={[
          { href: "#verification-main", label: "Skip to verification content" },
          { href: "#verification-navigation", label: "Skip to verification navigation" },
        ]}
      />
      <div className="mx-auto max-w-5xl px-4 pt-2">
        <Breadcrumbs items={[{ label: "Verify", href: "/verify" }, { label: "Verification" }]} />
      </div>
      {children}
    </>
  );
}
