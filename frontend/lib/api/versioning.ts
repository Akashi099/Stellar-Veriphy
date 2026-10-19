// API versioning policy. See docs/api/versioning.md.
//
// Clients select a version with a path prefix (/api/v1/...) or, for
// unversioned paths, the X-API-Version request header. The path wins when
// both are present. Every response echoes the served version.

export const API_VERSION_HEADER = "X-API-Version";

interface VersionInfo {
  status: "current" | "deprecated";
  // RFC 9745 / RFC 8594 values, set once a version is deprecated.
  deprecatedAt?: string;
  sunsetAt?: string;
  successor?: string;
}

export const API_VERSIONS = {
  "1": { status: "current" },
} as const satisfies Record<string, VersionInfo>;

export type ApiVersion = keyof typeof API_VERSIONS;

export const LATEST_API_VERSION: ApiVersion = "1";

// Served to clients that don't ask for a version. Only move this after the
// previous default has been deprecated for at least one release cycle.
export const DEFAULT_API_VERSION: ApiVersion = "1";

export const UNVERSIONED_API_PATHS = new Set(["/api/health", "/api/maintenance"]);

export function isSupportedVersion(value: string): value is ApiVersion {
  return Object.prototype.hasOwnProperty.call(API_VERSIONS, value);
}

// Accepts "1" or "v1". Returns null for anything unsupported.
export function parseApiVersion(raw: string | null | undefined): ApiVersion | null {
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase().replace(/^v/, "");
  return isSupportedVersion(normalized) ? normalized : null;
}

const VERSIONED_PATH = /^\/api\/v([^/]+)(\/.*)?$/;

export function versionFromPath(pathname: string): { raw: string; rest: string } | null {
  const match = VERSIONED_PATH.exec(pathname);
  return match ? { raw: match[1], rest: match[2] ?? "" } : null;
}

export function versionHeaders(version: ApiVersion): Record<string, string> {
  const info: VersionInfo = API_VERSIONS[version];
  const headers: Record<string, string> = { [API_VERSION_HEADER]: version };
  if (info.status === "deprecated") {
    headers["Deprecation"] = info.deprecatedAt
      ? `@${Math.floor(Date.parse(info.deprecatedAt) / 1000)}`
      : "true";
    if (info.sunsetAt) headers["Sunset"] = new Date(info.sunsetAt).toUTCString();
    if (info.successor) {
      headers["Link"] = `</docs/api/versioning.md#v${info.successor}>; rel="successor-version"`;
    }
  }
  return headers;
}

export function supportedVersionsDetail() {
  return {
    supportedVersions: Object.keys(API_VERSIONS),
    latestVersion: LATEST_API_VERSION,
  };
}
