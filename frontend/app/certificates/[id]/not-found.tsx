import Link from "next/link";

export default function CertificateNotFound() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-16">
      <h1 className="text-2xl font-bold">Certificate not found</h1>
      <p className="mt-2 text-slate-600">We couldn&apos;t find a verification record with that ID.</p>
      <Link href="/explore" className="mt-6 inline-block text-indigo-700 hover:underline">
        Browse verified content
      </Link>
    </main>
  );
}
