import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { computeConfidence, metadataCompleteness, STANDARD_METADATA_FIELDS } from "@stellarveriphy/shared/scoring";
import type { ProvenanceEventType, VerificationRecord } from "@stellarveriphy/shared/types";
import ConfidenceExplanation from "@/components/ConfidenceExplanation";
import ConfidenceScore from "@/components/ConfidenceScore";
import { CopyButton } from "@/components/CopyButton";
import StatusBadge from "@/components/StatusBadge";
import { OwnershipTransferPanel } from "@/components/certificates/OwnershipTransferPanel";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
import { getRecord } from "@/lib/sample-records";

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const record = getRecord((await params).id);
  return { title: `${record?.title ?? "Certificate not found"} · StellarVeriphy` };
}

const STANDARD_FIELD_LABELS: Record<(typeof STANDARD_METADATA_FIELDS)[number], string> = {
  device: "Capture device",
  location: "Location",
  aiModel: "AI model used",
};

const EVENT_LABELS: Record<ProvenanceEventType, string> = {
  manifest_created: "Manifest created",
  uploaded: "Content uploaded",
  verification_requested: "Verification requested",
  attestation_generated: "Secure enclave check completed",
  certificate_minted: "Certificate minted on Stellar",
  verification_failed: "Verification failed",
};

const STATUS_SUMMARY: Record<VerificationRecord["status"], string> = {
  certified: "This content was verified and a provenance certificate was recorded on the Stellar blockchain.",
  processing: "Verification is in progress. Evidence will appear here as each check completes.",
  pending: "This request is waiting for an independent verification service to begin its review. It starts automatically; return here for the result and evidence.",
  failed: "Verification did not pass, so no certificate was issued. See the evidence and history below for why.",
};

function formatDate(iso: string | number) {
  const date = typeof iso === "number" ? new Date(iso * 1000) : new Date(iso);
  return date.toLocaleString("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC";
}

function humanize(key: string) {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
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
    <div className="grid gap-1 py-2 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-4 lg:grid-cols-1 lg:gap-1">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className={`min-w-0 break-all text-sm ${mono ? "font-mono" : ""}`}>{children}</dd>
    </div>
  );
}

function Missing() {
  return <span className="italic text-slate-400">Not provided</span>;
}

export default async function CertificateDetail({ params }: { params: Params }) {
  const record = getRecord((await params).id);
  if (!record) notFound();

  const { manifest, cert, evidence } = record;
  const confidence = computeConfidence(record);
  const metadata = manifest.metadata ?? {};
  const extraMetadata = Object.entries(metadata).filter(
    ([key, value]) => value && !(STANDARD_METADATA_FIELDS as readonly string[]).includes(key),
  );
  const timeline = [...record.timeline].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <Breadcrumbs items={[{ label: "Explore", href: "/explore" }, { label: "Certificate" }]} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/explore" className="text-sm text-indigo-700 hover:underline">
          <span aria-hidden="true">← </span>Back to explore
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href={`/v/${record.id}?mode=public`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 shadow-sm"
          >
            <span>🌐</span> Public Verification URL
          </Link>
          <Link
            href={`/v/${record.id}?mode=authenticated&role=auditor`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
          >
            <span>🔐</span> Auditor View
          </Link>
        </div>
      </div>

      <header className="mt-4">
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={record.status} />
          <span className="text-sm uppercase tracking-wide text-slate-500">{record.mediaType}</span>
        </div>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">{record.title}</h1>
        <p className="mt-2 max-w-2xl text-slate-600">{STATUS_SUMMARY[record.status]}</p>
        <div className="mt-4">
          <ConfidenceScore result={confidence} size="lg" />
        </div>
      </header>

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <Section title="Certificate evidence" emphasis>
            <dl className="divide-y divide-indigo-100 dark:divide-indigo-900/60">
              {cert ? (
                <>
                  <Field label="Certificate ID" mono>
                    {cert.id}
                  </Field>
                  <Field label="Minted">{formatDate(cert.timestamp)}</Field>
                  <Field label="Storage reference" mono>
                    {cert.storageRef}
                  </Field>
                  <Field label="Manifest hash" mono>
                    {cert.manifestHash}
                  </Field>
                </>
              ) : (
                <Field label="Certificate">
                  <Missing />
                </Field>
              )}
              <Field label="Content hash" mono>
                {manifest.contentHash}
              </Field>
              {evidence && (
                <>
                  <Field label="Verified by">{evidence.enclave}</Field>
                  <Field label="Attestation hash" mono>
                    {evidence.attestationHash}
                  </Field>
                  <Field label="Verifier code hash" mono>
                    {evidence.teeCodeHash}
                  </Field>
                </>
              )}
            </dl>
          </Section>

          <Section title="Why this score?">
            <ConfidenceExplanation result={confidence} />
          </Section>

          <Section title="History">
            {timeline.length ? (
              <ol className="relative border-l border-slate-200 pl-6">
                {timeline.map((event, i) => (
                  <li key={i} className="relative pb-6 last:pb-0">
                    <span
                      aria-hidden="true"
                      className={`absolute -left-[1.95rem] top-1 h-3 w-3 rounded-full ring-4 ring-white ${
                        event.type === "verification_failed" ? "bg-rose-500" : "bg-indigo-500"
                      }`}
                    />
                    <p className="font-medium">{EVENT_LABELS[event.type]}</p>
                    <p className="text-sm text-slate-500">
                      <time dateTime={event.timestamp}>{formatDate(event.timestamp)}</time>
                      {event.actor && <> · {event.actor}</>}
                    </p>
                    {event.detail && <p className="mt-1 text-sm text-slate-700">{event.detail}</p>}
                    {event.txHash && (
                      <p className="mt-1 break-all font-mono text-xs text-slate-500">Transaction {event.txHash}</p>
                    )}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-slate-500">
                {record.status === "pending"
                  ? "Review updates will appear here after the verification service starts."
                  : "No history recorded yet."}
              </p>
            )}
          </Section>
        </div>

        <div className="space-y-4">
          <Section title="Provenance" subdued>
            <dl className="divide-y divide-slate-100">
              <Field label="Original creator" mono>
                <span className="inline-flex max-w-full items-center gap-1">
                  <span className="min-w-0 break-all">{manifest.creator}</span>
                  <CopyButton text={manifest.creator} label="Copy creator wallet address" />
                </span>
              </Field>
              <Field label="Created">{formatDate(manifest.timestamp)}</Field>
              {STANDARD_METADATA_FIELDS.map((key) => (
                <Field key={key} label={STANDARD_FIELD_LABELS[key]}>
                  {metadata[key] || <Missing />}
                </Field>
              ))}
              {extraMetadata.map(([key, value]) => (
                <Field key={key} label={humanize(key)}>
                  {value}
                </Field>
              ))}
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
