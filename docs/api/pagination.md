# Pagination for collection endpoints

Every list endpoint returns results in pages and includes a `pagination` object next to `data`. The rules live in `packages/shared/validation/pagination.ts` (`parsePaginationParams`, `paginate`), so all endpoints accept the same parameters and return the same fields.

## Endpoints

| Endpoint | Sort order | Envelope |
|----------|------------|----------|
| `GET /api/uploads?contentHash=…` | Insertion order | `{ status, data, pagination }` |
| `GET /api/uploads/sessions?creator=…` | Most recently updated first | `{ status, data, pagination }` |
| `GET /api/disputes` | Newest first | `{ success, data, pagination }` |
| `GET /api/admin/moderation` | Newest first (`data.items`) | `{ success, data: { items, summary }, pagination }` |
| `GET /api/audit-logs` | Newest first | `{ success, data, pagination }` |
| `GET /api/versions` | Insertion order | `{ success, data, pagination }` |

Filters such as `status` or `contentHash` are applied before paging, so `total` counts only the matching records.

`GET /api/jobs?ids=…` is not paginated. It returns the jobs you asked for, up to 50 IDs.

## Query parameters

| Parameter | Default | Rules |
|-----------|---------|-------|
| `pageSize` | `20` | Whole number from 1 to 100. `limit` works as an alias |
| `page` | `1` | Whole number of 1 or more |
| `cursor` | none | A `nextCursor` or `previousCursor` value from an earlier response. Do not send it together with `page` |

Invalid values return a validation error (see [validation.md](./validation.md)):

```json
{
  "status": "validation_error",
  "message": "Pagination parameters are invalid.",
  "errors": [{ "field": "pageSize", "message": "Must be at most 100." }]
}
```

Older `{ success }` routes return the same `errors` list with HTTP 400.

## Response metadata

```json
{
  "success": true,
  "data": [ /* up to pageSize items */ ],
  "pagination": {
    "total": 47,
    "page": 2,
    "pageSize": 20,
    "totalPages": 3,
    "hasNextPage": true,
    "hasPreviousPage": true,
    "nextCursor": "bzo0MA",
    "previousCursor": "bzow"
  }
}
```

| Field | Meaning |
|-------|---------|
| `total` | Number of matching records across all pages |
| `page` | 1-based page number of this response |
| `pageSize` | Page size used |
| `totalPages` | `ceil(total / pageSize)`, and at least 1 even when `total` is 0 |
| `hasNextPage` / `hasPreviousPage` | Whether another page exists in that direction |
| `nextCursor` / `previousCursor` | Pass as `cursor` to get the next or previous page. `null` when there is no such page |

## Moving between pages

- **Page numbers:** request `page + 1` while `hasNextPage` is true. Use `totalPages` to draw page links.
- **Cursors:** request `?cursor=<nextCursor>` until `nextCursor` is `null`. Keep the same `pageSize` on every request.

Cursors are opaque. Do not parse or build them. They currently encode an offset, so a record created between two requests can move other records by one position. A later change to keyset cursors will not change the API.

## Adding pagination to a new endpoint

```ts
import { paginate } from "@stellarveriphy/shared";
import { readPagination, respond } from "@/lib/server/http";

export async function GET(req: Request) {
  const pageParams = readPagination(req);            // 422 on bad params
  if ("response" in pageParams) return pageParams.response;

  const items = (await loadItems()).sort(newestFirst); // filter + sort first
  const page = paginate(items, pageParams.value);
  return respond(200, { status: "ok", data: page.items, pagination: page.pagination });
}
```

For `{ success }` routes, call `parsePaginationParams(searchParams)` and return `legacyValidationError(result.errors)` when it fails.
