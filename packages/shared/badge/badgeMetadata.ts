import type { VerificationRecord, VerificationStatus } from "../types";
import { resolveSchemaVersion } from "../schemas";

export type BadgeStandard = "opengraph" | "schema_org" | "custom";

export interface BadgeAttributeEntry {
  label: string;
  value: string;
}

export interface BadgeMetadata {
  id: string;
  standard: BadgeStandard;
  title: string;
  description: string;
  status: VerificationStatus;
  badgeImageUrl: string;
  assetUrl: string;
  issuedAt: string;
  attributes: BadgeAttributeEntry[];
  // JSON-LD block for schema.org DigitalDocument (stringified).
  jsonLd: string;
  // OpenGraph / Twitter card meta tags as a key-value map.
  openGraph: Record<string, string>;
}

export interface BadgeGenerationOptions {
  badgeBaseUrl: string;
  assetBaseUrl: string;
  standard?: BadgeStandard;
}

const STATUS_LABEL: Record<VerificationStatus, string> = {
  certified: "Certified",
  pending: "Pending Verification",
  processing: "Verification in Progress",
  failed: "Verification Failed",
};

const STATUS_BADGE_IMAGE: Record<VerificationStatus, string> = {
  certified: "certified.svg",
  pending: "pending.svg",
  processing: "processing.svg",
  failed: "failed.svg",
};

export function generateBadgeMetadata(
  record: Pick<VerificationRecord, "id" | "title" | "status" | "manifest" | "cert">,
  opts: BadgeGenerationOptions,
): BadgeMetadata {
  const standard = opts.standard ?? "opengraph";
  const statusLabel = STATUS_LABEL[record.status];
  const badgeImageUrl = `${opts.badgeBaseUrl.replace(/\/$/, "")}/${STATUS_BADGE_IMAGE[record.status]}`;
  const assetUrl = `${opts.assetBaseUrl.replace(/\/$/, "")}/${record.id}`;
  const schemaVersion = resolveSchemaVersion(record.manifest);

  const attributes: BadgeAttributeEntry[] = [
    { label: "Status", value: statusLabel },
    { label: "Creator", value: record.manifest.creator },
    { label: "Content Hash", value: record.manifest.contentHash },
    { label: "Schema Version", value: schemaVersion },
    { label: "Timestamp", value: record.manifest.timestamp },
  ];

  if (record.cert) {
    attributes.push({ label: "Certificate ID", value: record.cert.id });
    attributes.push({ label: "Manifest Hash", value: record.cert.manifestHash });
  }
  if (record.manifest.metadata?.device) {
    attributes.push({ label: "Device", value: record.manifest.metadata.device });
  }
  if (record.manifest.metadata?.aiModel) {
    attributes.push({ label: "AI Model", value: record.manifest.metadata.aiModel });
  }

  const title = `${record.title} — ${statusLabel}`;
  const description =
    record.status === "certified"
      ? `This content has been verified and certified on StellarVeriphy. Creator: ${record.manifest.creator}.`
      : `Verification status: ${statusLabel}. Creator: ${record.manifest.creator}.`;

  const jsonLdObj: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "DigitalDocument",
    name: record.title,
    identifier: record.id,
    url: assetUrl,
    creator: { "@type": "Person", identifier: record.manifest.creator },
    dateCreated: record.manifest.timestamp,
    description,
  };
  if (record.cert) {
    jsonLdObj["certificateNumber"] = record.cert.id;
  }

  const openGraph: Record<string, string> = {
    "og:type": "article",
    "og:title": title,
    "og:description": description,
    "og:url": assetUrl,
    "og:image": badgeImageUrl,
    "twitter:card": "summary",
    "twitter:title": title,
    "twitter:description": description,
    "twitter:image": badgeImageUrl,
  };

  return {
    id: record.cert?.id ?? record.id,
    standard,
    title,
    description,
    status: record.status,
    badgeImageUrl,
    assetUrl,
    issuedAt: record.manifest.timestamp,
    attributes,
    jsonLd: JSON.stringify(jsonLdObj, null, 2),
    openGraph,
  };
}

// Renders OpenGraph/Twitter card entries as HTML <meta> tag strings.
export function badgeMetadataAsHtmlMeta(badge: BadgeMetadata): string {
  return Object.entries(badge.openGraph)
    .map(([property, content]) => `<meta property="${property}" content="${content}" />`)
    .join("\n");
}
