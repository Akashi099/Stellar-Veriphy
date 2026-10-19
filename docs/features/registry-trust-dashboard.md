# Registry Trust Dashboard

**Route:** `/registry/trust`  
**API:** `GET /api/registry/trust`  
**Closes:** #691

## Purpose

The public transparency dashboard communicates registry health, trusted provider status, operational warnings, and ecosystem-level verification statistics to any user — without exposing private or sensitive operational details.

## What is shown

| Section | Data shown | Data NOT shown |
|---|---|---|
| Registry health banner | Overall health status (healthy / degraded / critical) and a plain-language note | Internal thresholds, operator credentials |
| Verification statistics | Total certificates minted, last-24 h count, overall success rate, active/suspended provider counts, approved TEE hash count | Individual job records, wallet addresses in full |
| Operational warnings | Active warnings (TEE hash expiry, low success rate) with severity | Internal alert IDs, operator identities, private system logs |
| Trusted provider directory | Address suffix (last 6 chars), status, trust level, success rate, TEE hash validity | Full provider addresses, stake amounts, metadata sources |
| Transparency note | Links to oracle registry, explanation of on-chain sourcing | None — this section is explanatory only |

## Privacy design

- Full provider addresses are never rendered. Only the last 6 characters of each address are shown in the public view. Full addresses are available on `/oracles` (the existing oracle registry page) for users who need them.
- No internal operational credentials, API keys, or governance secrets appear in the API response or the page.
- All data is derived from publicly visible on-chain state on the Stellar network.

## API response shape

```ts
{
  health: "healthy" | "degraded" | "critical";
  healthNote: string;
  warnings: Array<{
    id: string;
    severity: "info" | "warning" | "critical";
    message: string;
    issuedAt: string;  // ISO 8601
  }>;
  providers: Array<{
    addressSuffix: string;  // "…XZ4G2Q" — last 6 chars only
    status: "active" | "suspended";
    trustLevel: "high" | "moderate" | "low";
    successRate: number;
    teeHashValid: boolean;
  }>;
  stats: {
    totalCertificates: number;
    last24hCertificates: number;
    overallSuccessRate: number;
    activeTrustedProviders: number;
    suspendedProviders: number;
    approvedTeeHashes: number;
  };
  snapshotAt: string;  // ISO 8601
}
```

## Production wiring

Replace the mock builder in `app/api/registry/trust/route.ts` with real Soroban contract queries:

- `contracts/registry` → `get_approved_hashes()` for TEE hash count and validity
- `contracts/registry` → `get_provider_list()` + `is_provider_suspended()` for provider status
- `contracts/oracle` → `get_verification_metrics()` for success rates
- `contracts/provenance` → total certificate count via event indexer

The dashboard auto-refreshes every 60 seconds on the client.
