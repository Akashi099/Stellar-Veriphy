import Link from "next/link";

const NAV_LINKS = [
  { href: "/explore", label: "Explore" },
  { href: "/creator/upload-content", label: "Upload" },
  { href: "/settings", label: "Settings" },
];

export default function SiteHeader() {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="font-semibold tracking-tight">
          StellarVeriphy
        </Link>
        <nav aria-label="Main">
          <ul className="flex gap-5 text-sm text-slate-600">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="hover:text-slate-900 focus-visible:underline">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
