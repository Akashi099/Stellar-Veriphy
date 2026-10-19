"use client";

/**
 * DisputeEvidencePackageView (#671)
 *
 * Single-page reviewer view of a dispute's evidence package: files,
 * manifests, hashes, attestations, links and comments grouped consistently,
 * each linked to the dispute with its integrity checks. Reviewers can
 * re-verify the package hash locally, add evidence, and export the package
 * as JSON for the audit record.
 */

import {
  type DisputeEvidenceItem,
  type DisputeEvidencePackage,
  EVIDENCE_KINDS,
  type EvidenceItemCheck,
  type EvidenceKind,
  type EvidencePackageSummary,
  type EvidencePackageVerification,
  verifyEvidencePackage,
} from "@stellarveriphy/shared";
import { useCallback, useEffect, useState } from "react";

import { cardGridClassName } from "@/components/ui/CardGrid";
import { type MessageKey,t } from "@/lib/i18n";

const KIND_LABEL_KEYS: Record<EvidenceKind, MessageKey> = {
  manifest: "admin.evidence.kind.manifest",
  hash: "admin.evidence.kind.hash",
  file: "admin.evidence.kind.file",
  attestation: "admin.evidence.kind.attestation",
  link: "admin.evidence.kind.link",
  comment: "admin.evidence.kind.comment",
};

const inputClass =
  "w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100";

function CheckBadges({ check }: { check?: EvidenceItemCheck }) {
  if (!check) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {check.contentHashRelation === "match" && (
        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-300">
          {t("admin.evidence.check.hashMatch")}
        </span>
      )}
      {check.contentHashRelation === "mismatch" && (
        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900/30 dark:text-red-300">
          {t("admin.evidence.check.hashMismatch")}
        </span>
      )}
      {check.manifestIntegrity === "valid" && (
        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-300">
          {t("admin.evidence.check.manifestValid")}
        </span>
      )}
      {check.manifestIntegrity === "invalid" && (
        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900/30 dark:text-red-300">
          {t("admin.evidence.check.manifestInvalid")}
        </span>
      )}
      <span className="rounded-full bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-300" title={check.itemDigest}>
        {t("admin.evidence.check.digest", { digest: check.itemDigest.slice(0, 10) })}
      </span>
    </div>
  );
}

function EvidenceItemCard({ item, check }: { item: DisputeEvidenceItem; check?: EvidenceItemCheck }) {
  return (
    <li className="rounded-md border border-gray-200 dark:border-gray-700 p-3 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{item.label}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {item.submitterRole} · <span className="font-mono">{item.submittedBy}</span> ·{" "}
            {new Date(item.submittedAt).toLocaleString()}
          </p>
        </div>
        <CheckBadges check={check} />
      </div>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs">
        {item.sha256 && (
          <>
            <dt className="text-gray-500">{t("admin.evidence.item.sha256")}</dt>
            <dd className="font-mono break-all text-gray-800 dark:text-gray-200">{item.sha256}</dd>
          </>
        )}
        {item.storageRef && (
          <>
            <dt className="text-gray-500">{t("admin.evidence.item.storage")}</dt>
            <dd className="font-mono break-all text-gray-800 dark:text-gray-200">{item.storageRef}</dd>
          </>
        )}
        {item.mimeType && (
          <>
            <dt className="text-gray-500">{t("admin.evidence.item.type")}</dt>
            <dd className="text-gray-800 dark:text-gray-200">
              {item.mimeType}
              {item.sizeBytes !== undefined && ` · ${t("admin.evidence.item.bytes", { count: item.sizeBytes.toLocaleString() })}`}
            </dd>
          </>
        )}
        {item.attestationRef && (
          <>
            <dt className="text-gray-500">{t("admin.evidence.item.attestation")}</dt>
            <dd className="font-mono break-all text-gray-800 dark:text-gray-200">{item.attestationRef}</dd>
          </>
        )}
        {item.url && (
          <>
            <dt className="text-gray-500">{t("admin.evidence.item.url")}</dt>
            <dd className="break-all">
              <a href={item.url} target="_blank" rel="noopener noreferrer nofollow" className="text-blue-600 hover:underline">
                {item.url}
              </a>
            </dd>
          </>
        )}
      </dl>
      {item.text && (
        <p className="whitespace-pre-wrap rounded bg-gray-50 dark:bg-gray-900/50 p-2 text-sm text-gray-700 dark:text-gray-300">{item.text}</p>
      )}
      {item.manifest && (
        <details>
          <summary className="cursor-pointer text-xs text-blue-600">{t("admin.evidence.item.viewManifest")}</summary>
          <pre className="mt-1 max-h-64 overflow-auto rounded bg-gray-50 dark:bg-gray-900 p-2 text-xs text-gray-800 dark:text-gray-200">
            {JSON.stringify(item.manifest, null, 2)}
          </pre>
        </details>
      )}
      {check && check.warnings.length > 0 && (
        <ul className="list-disc list-inside text-xs text-amber-700 dark:text-amber-400">
          {check.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
    </li>
  );
}

function AddEvidenceForm({ disputeId, onAdded }: { disputeId: string; onAdded: () => void }) {
  const [kind, setKind] = useState<EvidenceKind>("hash");
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");
  const [sha256, setSha256] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    setError(null);
    const body: Partial<DisputeEvidenceItem> = { kind, label };
    try {
      if (kind === "hash") body.sha256 = value;
      if (kind === "file") Object.assign(body, { storageRef: value, sha256 });
      if (kind === "link") body.url = value;
      if (kind === "comment") body.text = value;
      if (kind === "attestation") body.attestationRef = value;
      if (kind === "manifest") Object.assign(body, { manifest: JSON.parse(value), sha256: sha256 || undefined });
    } catch {
      setError(t("admin.evidence.add.invalidManifest"));
      setSaving(false);
      return;
    }
    try {
      const res = await fetch(`/api/admin/moderation/${disputeId}/evidence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error ?? t("admin.evidence.add.error"));
      } else {
        setLabel("");
        setValue("");
        setSha256("");
        onAdded();
      }
    } catch {
      setError(t("admin.common.networkError"));
    } finally {
      setSaving(false);
    }
  };

  const valueLabelKeys: Record<EvidenceKind, MessageKey> = {
    hash: "admin.evidence.add.valueHash",
    file: "admin.evidence.add.valueFile",
    link: "admin.evidence.add.valueLink",
    comment: "admin.evidence.add.valueComment",
    attestation: "admin.evidence.add.valueAttestation",
    manifest: "admin.evidence.add.valueManifest",
  };

  return (
    <section className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-3">
      <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{t("admin.evidence.add.heading")}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="ev-kind" className="block text-sm text-gray-700 dark:text-gray-300 mb-1">{t("admin.evidence.add.kind")}</label>
          <select id="ev-kind" value={kind} onChange={(e) => setKind(e.target.value as EvidenceKind)} className={inputClass}>
            {EVIDENCE_KINDS.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="ev-label" className="block text-sm text-gray-700 dark:text-gray-300 mb-1">{t("admin.evidence.add.label")}</label>
          <input id="ev-label" value={label} onChange={(e) => setLabel(e.target.value)} className={inputClass} />
        </div>
      </div>
      <div>
        <label htmlFor="ev-value" className="block text-sm text-gray-700 dark:text-gray-300 mb-1">{t(valueLabelKeys[kind])}</label>
        {kind === "comment" || kind === "manifest" ? (
          <textarea id="ev-value" rows={4} value={value} onChange={(e) => setValue(e.target.value)} className={`${inputClass} font-mono`} />
        ) : (
          <input id="ev-value" value={value} onChange={(e) => setValue(e.target.value)} className={`${inputClass} font-mono`} />
        )}
      </div>
      {(kind === "file" || kind === "manifest") && (
        <div>
          <label htmlFor="ev-sha" className="block text-sm text-gray-700 dark:text-gray-300 mb-1">
            {kind === "file" ? t("admin.evidence.add.fileSha") : t("admin.evidence.add.manifestSha")}
          </label>
          <input id="ev-sha" value={sha256} onChange={(e) => setSha256(e.target.value)} className={`${inputClass} font-mono`} />
        </div>
      )}
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <button
        type="button"
        onClick={() => void submit()}
        disabled={saving || !label.trim() || !value.trim()}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {saving ? t("admin.evidence.add.adding") : t("admin.evidence.add.submit")}
      </button>
    </section>
  );
}

export function DisputeEvidencePackageView({ disputeId }: { disputeId: string }) {
  const [pkg, setPkg] = useState<DisputeEvidencePackage | null>(null);
  const [summary, setSummary] = useState<EvidencePackageSummary | null>(null);
  const [verification, setVerification] = useState<EvidencePackageVerification | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setVerification(null);
    try {
      const res = await fetch(`/api/admin/moderation/${disputeId}/evidence`, { cache: "no-store" });
      const data = await res.json();
      if (data.success) {
        setPkg(data.data.package);
        setSummary(data.data.summary);
      } else {
        setError(data.error ?? t("admin.evidence.load.error"));
      }
    } catch {
      setError(t("admin.common.networkError"));
    } finally {
      setLoading(false);
    }
  }, [disputeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const exportJson = () => {
    if (!pkg) return;
    const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${pkg.packageId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading && !pkg) return <p className="text-sm text-gray-500">{t("admin.evidence.load.loading")}</p>;
  if (error) return <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>;
  if (!pkg || !summary) return null;

  const checkFor = (id: string) => pkg.checks.find((c) => c.itemId === id);

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-3">
        <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
          <dt className="text-gray-500">{t("admin.evidence.dispute")}</dt>
          <dd className="font-mono text-gray-900 dark:text-gray-100">
            {pkg.disputeId}
            {pkg.onChainDisputeId !== undefined && ` ${t("admin.evidence.onChain", { id: pkg.onChainDisputeId })}`}
          </dd>
          <dt className="text-gray-500">{t("admin.evidence.asset")}</dt>
          <dd className="font-mono text-gray-900 dark:text-gray-100">{pkg.assetId}</dd>
          <dt className="text-gray-500">{t("admin.evidence.contentHash")}</dt>
          <dd className="font-mono break-all text-xs text-gray-900 dark:text-gray-100">{pkg.contentHash}</dd>
          <dt className="text-gray-500">{t("admin.evidence.packageHash")}</dt>
          <dd className="font-mono break-all text-xs text-gray-900 dark:text-gray-100">{pkg.packageHash}</dd>
          {pkg.summary && (
            <>
              <dt className="text-gray-500">{t("admin.evidence.summary")}</dt>
              <dd className="text-gray-700 dark:text-gray-300">{pkg.summary}</dd>
            </>
          )}
        </dl>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={async () => setVerification(await verifyEvidencePackage(pkg))}
            className="rounded-md border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200"
          >
            {t("admin.evidence.reverify")}
          </button>
          <button
            type="button"
            onClick={exportJson}
            className="rounded-md border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200"
          >
            {t("admin.evidence.exportJson")}
          </button>
        </div>
        {verification && (
          <p
            role="status"
            className={`text-sm ${verification.valid ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}
          >
            {verification.valid
              ? t("admin.evidence.verify.valid")
              : verification.tamperedItems.length
                ? t("admin.evidence.verify.failedItems", { items: verification.tamperedItems.join(", ") })
                : t("admin.evidence.verify.failed")}
          </p>
        )}
      </section>

      <section className={cardGridClassName("summary")}>
        {[
          [t("admin.evidence.stats.items"), summary.totalItems],
          [t("admin.evidence.stats.matches"), summary.matchingHashes],
          [t("admin.evidence.stats.mismatches"), summary.mismatchingHashes],
          [t("admin.evidence.stats.invalidManifests"), summary.invalidManifests],
        ].map(([label, value]) => (
          <div key={label} className="h-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
            <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
            <p className="text-xl font-bold tabular-nums text-gray-900 dark:text-gray-100">{value}</p>
          </div>
        ))}
      </section>

      {summary.warnings.length > 0 && (
        <section className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 p-4">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200 mb-1">{t("admin.evidence.warnings")}</p>
          <ul className="list-disc list-inside text-xs text-amber-800 dark:text-amber-300 space-y-0.5">
            {summary.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </section>
      )}

      {EVIDENCE_KINDS.map((kind) => (
        <section key={kind} aria-labelledby={`ev-${kind}`} className="space-y-2">
          <h2 id={`ev-${kind}`} className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {t(KIND_LABEL_KEYS[kind])} <span className="text-gray-400">({pkg.sections[kind].length})</span>
          </h2>
          {pkg.sections[kind].length === 0 ? (
            <p className="text-xs text-gray-400">{t("admin.evidence.item.none")}</p>
          ) : (
            <ul className="space-y-2">
              {pkg.sections[kind].map((item) => (
                <EvidenceItemCard key={item.id} item={item} check={checkFor(item.id)} />
              ))}
            </ul>
          )}
        </section>
      ))}

      <AddEvidenceForm disputeId={disputeId} onAdded={() => void load()} />

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t("admin.evidence.auditTrail")}</h2>
        <ol className="space-y-1 text-xs text-gray-600 dark:text-gray-400">
          {pkg.auditTrail.map((a, i) => (
            <li key={i}>
              <span className="font-mono">{new Date(a.at).toLocaleString()}</span> · {a.action} · {a.actor} — {a.details}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
