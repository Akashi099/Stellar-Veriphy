# Upload and Verification Observability

This runbook covers failed upload registration, verification submission, and rate-limit diagnosis.

## Structured Events

Server routes emit one JSON object per operational event. Search by `event`, `requestId`, `route`, or `operation`.

- `upload.rejected`: upload metadata could not be parsed or failed validation.
- `upload.failed`: upload metadata was valid, but persistence failed.
- `verification_submission.rejected`: a verification job request was malformed or referenced a missing upload.
- `verification_submission.failed`: a verification job could not be queued.
- `verification_request.rate_limited`: anti-abuse protections blocked a request.
- `verification_request.rejected`: the verification request payload was malformed or failed validation.

Sensitive values are not logged directly. Wallet/public-key actors are represented as `actorHash`, while content and manifest hashes are shortened to prefixes for correlation.

## Triage Path

1. Search logs for the user's reported time window and route, for example `event="upload.rejected"` or `route="POST /api/jobs"`.
2. If the user can provide a support reference, match it to `requestId`. Otherwise correlate by timestamp plus `contentHashPrefix` or `manifestHashPrefix`.
3. For validation errors, inspect `details.fields` and `details.errorCount` before asking the user to retry.
4. For rate limiting, inspect `details.retryAfterSeconds`, `details.violations`, and the HTTP `Retry-After` response header.
5. For job failures, search the same `uploadId` or `jobId` and inspect worker logs for `api.server_error` or verification-worker errors.

## Client Behavior

The upload form preserves non-file draft fields in browser `localStorage` for seven days and clears the draft after a successful submission. The file itself is not persisted; users must reselect it after reopening the page. Rate-limited submissions show the retry delay returned by the server so users can wait without losing the draft.
