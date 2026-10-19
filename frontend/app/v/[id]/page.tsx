import type { Metadata } from "next";
import Link from "next/link";
import { computeConfidence } from "@stellarveriphy/shared/scoring";
import type { ProvenanceEventType, VerificationRecord } from "@stellarveriphy/shared/types";
import ConfidenceExplanation from "@/components/ConfidenceExplanation";
import ConfidenceScore from "@/components/ConfidenceScore";
import { CopyButton } from "@/components/CopyButton";
import { OwnershipTransferPanel } from "@/components/certificates/OwnershipTransferPanel";
import StatusBadge from "@/components/StatusBadge";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
import { getRecord, SAMPLE_RECORDS } from "@/lib/sample-records";
import { parseVerificationUrlContext } from "@/lib/shareableUrl";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}): Promise<Metadata> {
  const { id } = await params;
  const sParams = await searchParams;
  const context = parseVerificationUrlContext(sParams);
  const record = getRecord(id) ?? SAMPLE_RECORDS.find((r) => r.manifest.contentHash.includes(id));

  const modeLabel = context.isAuthenticatedMode ? "[Auditor View]" : "[Public Verification]";
  return {
    title: `${modeLabel} ${record?.title ?? "Record Not Found"} · StellarVeriphy`,
    description: `Cryptographic provenance verification proof for asset ${record?.title ?? id}`,
  };
}

const EVENT_LABELS: Record<ProvenanceEventType, string> = {
  manifest_created: "Manifest created",
  uploaded: "Content uploaded",
  verification_requested: "Verification requested",
  attestation_generated: "Secure enclave check completed",
  certificate_minted: "Certificate minted on Stellar",
  verification_failed: "Verification failed",
};

function formatDate(iso: string | number) {
  const date = typeof iso === "number" ? new Date(iso * 1000) : new Date(iso);
  return date.toLocaleString("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC";
}

function Section({
  title,
  children,
  emphasis = false,
  subdued = false,
}: {
  title: string;
  children: React.ReactNode;
  emphasis?: boolean;
  subdued?: boolean;
}) {
  const id = title.toLowerCase().replace(/\W+/g, "-");
  const sectionStyle = emphasis
    ? "border-indigo-200 bg-indigo-50/50 shadow-md dark:border-indigo-900 dark:bg-indigo-950/30"
    : subdued
      ? "border-slate-100 bg-slate-50/70 shadow-none dark:border-gray-800 dark:bg-gray-900/60"
      : "border-slate-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900";

  return (
    <section aria-labelledby={id} className={`rounded-xl border p-4 sm:p-5 ${sectionStyle}`}>
      <h2
        id={id}
        className={`font-semibold ${emphasis ? "text-xl text-indigo-950 dark:text-indigo-100" : subdued ? "text-base text-slate-600 dark:text-gray-300" : "text-lg dark:text-white"}`}
      >
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Field({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="py-2.5 sm:grid sm:grid-cols-3 sm:gap-4">
      <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-gray-400">{label}</dt>
      <dd className={`mt-1 text-sm sm:col-span-2 sm:mt-0 ${mono ? "font-mono text-xs break-all" : ""} dark:text-gray-200`}>
        {children}
      </dd>
    </div>
  );
}

export default async function ShareableVerificationPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sParams = await searchParams;
  const { mode, role, isAuthenticatedMode } = parseVerificationUrlContext(sParams);

  // Lookup record by ID or partial content hash
  const record: VerificationRecord | undefined =
    getRecord(id) ?? SAMPLE_RECORDS.find((r) => r.manifest.contentHash.includes(id));

  // Fallback view when record is not found
  if (!record) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-2xl text-amber-600 dark:bg-amber-950/50">
            🔍
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight dark:text-white">
            Verification Record Not Found
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-gray-400">
            No verification record or certificate matches identifier &ldquo;<span className="font-mono text-indigo-600 dark:text-indigo-400">{id}</span>&rdquo;.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href="/verify"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
            >
              Verify by File / Hash
            </Link>
            <Link
              href="/explore"
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-300"
            >
              Browse Verified Content
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const { manifest, cert, evidence, timeline } = record;
  const confidence = computeConfidence(record);

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <Breadcrumbs items={[{ label: "Verify", href: "/verify" }, { label: "Verification result" }]} />
      {/* Contextual permissions banner */}
      <div
        className={`mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-xl p-4 border text-sm ${
          isAuthenticatedMode
            ? "border-purple-200 bg-purple-50 text-purple-900 dark:border-purple-900 dark:bg-purple-950/40 dark:text-purple-200"
            : "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200"
        }`}
      >
        <div className="flex items-center gap-2">
          <span className="text-base">{isAuthenticatedMode ? "🔐" : "🌐"}</span>
          <div>
            <strong className="font-semibold">
              {isAuthenticatedMode ? "Authenticated Auditor View" : "Public Verification Proof"}
            </strong>
            <span className="ml-2 text-xs opacity-80">
              Role: <span className="capitalize font-mono font-medium">{role}</span>
            </span>
          </div>
        </div>
        <div className="text-xs">
          {isAuthenticatedMode
            ? "Full enclave attestation, cryptographic signatures and audit trail enabled."
            : "Cryptographically verified record shared for external client inspection."}
        </div>
      </div>

      {/* Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-500">
            <span>{record.mediaType}</span>
            <span>•</span>
            <StatusBadge status={record.status} />
          </div>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            {record.title}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Created {formatDate(manifest.timestamp)}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/certificates/${record.id}`}
            className="rounded-lg border border-slate-300 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-200"
          >
            View Certificate
          </Link>
          <Link
            href="/explore"
            className="rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500"
          >
            Back to Explore
          </Link>
        </div>
      </header>

      {/* Grid */}
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Section title="Verification evidence" emphasis>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-indigo-100 pb-4 dark:border-indigo-900/60">
              <span className="text-sm font-medium text-slate-700 dark:text-gray-200">
                Confidence score
              </span>
              <ConfidenceScore result={confidence} size="lg" />
            </div>
            <div className="mt-4">
              <ConfidenceExplanation result={confidence} />
            </div>
            <dl className="mt-5 divide-y divide-indigo-100 border-t border-indigo-100 dark:divide-indigo-900/60 dark:border-indigo-900/60">
              {cert ? (
                <>
                  <Field label="Certificate ID" mono>
                    {cert.id}
                  </Field>
                  <Field label="Minted Date">{formatDate(cert.timestamp)}</Field>
                  <Field label="Storage Ref" mono>
                    {cert.storageRef}
                  </Field>
                </>
              ) : (
                <div className="py-2 text-amber-600">Pending on-chain minting</div>
              )}
              {evidence && (
                <>
                  <Field label="Attestation Enclave">{evidence.enclave}</Field>
                  <Field label="Attestation Hash" mono>
                    {evidence.attestationHash}
                  </Field>
                </>
              )}
            </dl>
          </Section>

          {/* Timeline */}
          <Section title="Verification History & Timeline">
            {timeline.length > 0 ? (
              <ol className="relative border-l border-slate-200 pl-4 space-y-4 dark:border-gray-800">
                {timeline.map((evt, idx) => (
                  <li key={idx} className="relative">
                    <div className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-indigo-600 ring-4 ring-white dark:ring-gray-900" />
                    <div className="text-xs text-slate-500">{formatDate(evt.timestamp)}</div>
                    <div className="text-sm font-semibold dark:text-white">
                      {EVENT_LABELS[evt.type] ?? evt.type}
                    </div>
                    {evt.detail && (
                      <div className="text-xs text-slate-600 dark:text-gray-400 mt-0.5">{evt.detail}</div>
                    )}
                    {evt.txHash && (
                      <div className="text-xs font-mono text-slate-400 mt-0.5 break-all">
                        Tx: {evt.txHash}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-slate-500 dark:text-gray-400">
                {record.status === "pending"
                  ? "Review updates will appear here after the independent verification service starts."
                  : "No review history is available yet."}
              </p>
            )}
          </Section>
        </div>

        {/* Supporting details */}
        <div className="space-y-4">
          <Section title="Asset Manifest & Provenance" subdued>
            <dl className="divide-y divide-slate-100 dark:divide-gray-800">
              <Field label="Original creator" mono>
                <span className="inline-flex max-w-full items-center gap-1">
                  <span className="min-w-0 break-all">{manifest.creator}</span>
                  <CopyButton text={manifest.creator} label="Copy creator wallet address" />
                </span>
              </Field>
              <Field label="Content Hash" mono>
                {manifest.contentHash}
              </Field>
              <Field label="Created At">{formatDate(manifest.timestamp)}</Field>
              {manifest.metadata?.device && (
                <Field label="Device">{manifest.metadata.device}</Field>
              )}
              {manifest.metadata?.location && (
                <Field label="Location">{manifest.metadata.location}</Field>
              )}
              {manifest.metadata?.aiModel && (
                <Field label="AI Model">{manifest.metadata.aiModel}</Field>
              )}
            </dl>
          </Section>

          {cert && (
            <Section title="Ownership">
              <OwnershipTransferPanel
                certificateId={record.id}
                initialOwner={cert.owner ?? cert.creator}
              />
            </Section>
          )}
        </div>
      </div>
    </main>
  );
}
