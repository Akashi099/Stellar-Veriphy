import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { SkipLinks } from "@/utils/accessibility";

const TITLE = "Dashboard";
const DESCRIPTION =
  "Overview of your provenance records, recent activity, and verification metrics.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login?callbackUrl=/dashboard");
  }

  const role = (session.user as { role?: string }).role;

  if (role !== "admin") {
    redirect("/unauthorized");
  }

  return (
    <>
      <SkipLinks
        links={[
          { href: "#dashboard-main", label: "Skip to dashboard content" },
          { href: "#dashboard-navigation", label: "Skip to dashboard navigation" },
        ]}
      />
      <nav id="dashboard-navigation" aria-label="Dashboard navigation" className="sr-only">
        <a href="/dashboard">Overview</a>
        <a href="/transactions">Transactions</a>
        <a href="/verification-history">Verification history</a>
      </nav>
      {children}
    </>
  );
}
