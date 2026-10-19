# API versioning

## Selecting a version

There are two equivalent ways to select a version:

1. **Path prefix (recommended):** `/api/v1/records/bulk-status`
2. **Header:** call the unversioned path and send `X-API-Version: 1` (`v1` is also accepted):

   ```
   POST /api/records/bulk-status
   X-API-Version: 1
   ```

The middleware rewrites the header form to the path form (`frontend/middleware.ts`). If a request has both, the path wins. If it has neither, the request is served by the **default version**, currently `1`.

Every response includes `X-API-Version`, the version that actually handled the request. Clients should log it.

If the requested version is unknown, the server returns `400 UNSUPPORTED_API_VERSION`. `details.supportedVersions` and `details.latestVersion` tell the client what it can switch to.

`/api/health` is not versioned.

## Supported versions

| Version | Status | Deprecated | Sunset | Successor |
|---|---|---|---|---|
| `1` | current | — | — | — |

The registry in `frontend/lib/api/versioning.ts` is the source of truth. Update this table whenever you change that registry.

## What counts as a breaking change

Breaking changes **require a new version**:

- Removing or renaming a field, endpoint, or error code
- Changing a field's type, or its meaning
- Making an optional request field required, or tightening validation on an existing field
- Changing the default of a request option (for example, `atomic`)
- Changing the status code returned for an existing outcome

These changes are **non-breaking** and can ship within the current version:

- Adding endpoints, optional request fields, or response fields
- Adding new error codes. Clients must handle unknown codes by falling back to `retryable`.
- Relaxing validation

Clients must ignore response fields they don't recognize.

## Rolling out a new version

1. Add `"2": { status: "current" }` to `API_VERSIONS`. Implement the changed routes under `app/api/v2/...`. Routes that didn't change can share their handler function: move the inner function into a shared module and wrap it with `defineRoute("2", handler)` in the v2 route. Don't re-export the v1 route itself, because it would send `X-API-Version: 1`.
2. Set `LATEST_API_VERSION` to `"2"`. The bundled client (`apiRequest`) now sends v2 by default. Callers can pin `version: "1"` while they migrate.
3. Mark v1 deprecated by setting `status: "deprecated"`, `deprecatedAt`, `sunsetAt` (at least 90 days out) and `successor: "2"`. Every v1 response then carries these headers:
   - `Deprecation: @<unix-seconds>` (RFC 9745)
   - `Sunset: <HTTP date>` (RFC 8594)
   - `Link: <...versioning.md#v2>; rel="successor-version"`
4. Move `DEFAULT_API_VERSION` to `"2"` only after v1 has been deprecated for at least one release cycle. Clients that never chose a version are the ones this step affects.
5. After the sunset date, remove v1 from the registry and delete `app/api/v1`. Requests for v1 then receive `UNSUPPORTED_API_VERSION`.

## Migration guide template

Add a section to this file for each new version:

```
### v1 → v2
- Changed: <endpoint>: <what changed and why>
- Removed: <field>: use <replacement>
- Client action: <concrete steps>
```
