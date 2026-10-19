import type { Metadata } from "next";
import Breadcrumbs from "@/components/ui/Breadcrumbs";

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
      <div className="mx-auto max-w-5xl px-4 pt-2">
        <Breadcrumbs items={[{ label: "Verify", href: "/verify" }, { label: "Verification" }]} />
      </div>
      {children}
    </>
  );
}
