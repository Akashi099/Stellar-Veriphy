# Troubleshooting Guide

This guide covers common local setup and environment issues. For each problem you'll find the symptom and a concise, action-oriented fix. If your issue isn't listed here, check `DEVELOPMENT_WORKFLOW.md` or open an issue.

Before diving in, make sure you've run the initial setup:

```bash
./scripts/setup.sh
```

---

## Dependency install issues

**Symptom:** `npm install` (or the install step in `scripts/setup.sh`) fails with `EACCES`, `ENOENT`, or peer-dependency errors.

**Fix:**
- Ensure you're on the Node version pinned in `.nvmrc` / `package.json` (`engines`). Run `nvm use` if you use nvm.
- Delete stale artifacts and reinstall:
  ```bash
  rm -rf node_modules package-lock.json
  ./scripts/setup.sh
  ```
- If you hit `EACCES` on a global install, avoid `sudo`; fix npm's prefix or use a version manager instead.
- For peer-dependency conflicts, confirm you haven't mixed package managers (use the one the repo locks with — see the lockfile present).

---

## Environment variable misconfiguration

**Symptom:** The app starts but crashes with missing config, or behaves differently than expected. Errors like `Missing required env var` or unexpected defaults.

**Fix:**
- Copy the example env file and fill in values:
  ```bash
  cp .env.example .env
  ```
- Detect drift between your local `.env` and the expected schema:
  ```bash
  node scripts/env-drift.mjs
  ```
  This reports missing, extra, or malformed variables. Fix each reported item.
- Never commit `.env`. If you changed variable names, re-run `./scripts/setup.sh` to regenerate derived config.

---

## Database connection problems

**Symptom:** `ECONNREFUSED`, `connection refused`, authentication failures, or migrations failing to apply.

**Fix:**
- Confirm the database container/service is running (see Docker section below).
- Verify `DATABASE_URL` (and related vars) in `.env` match the running database — run `node scripts/env-drift.mjs` to catch mismatches.
- Reset to a clean database state:
  ```bash
  ./scripts/reset-db.sh
  ```
- If migrations are out of sync, `scripts/reset-db.sh` drops and recreates the schema, then re-applies migrations.

---

## Docker / container startup failures

**Symptom:** Containers exit immediately, restart loops, or the app is unreachable after `docker compose up`.

**Fix:**
- Check container health:
  ```bash
  ./scripts/check-container-health.sh
  ```
  This reports which services are unhealthy and surfaces recent logs.
- Inspect the entrypoint logs — startup failures are usually logged by `docker/entrypoint.sh`:
  ```bash
  docker compose logs <service>
  ```
- Common causes:
  - Missing env vars inside the container — ensure `.env` is mounted/passed (see `docker-compose.yml`).
  - Database not ready when the app starts — wait for the healthcheck or restart the app service after the DB is healthy.
  - Stale images — rebuild: `docker compose build --no-cache && docker compose up`.
- After fixing config, re-run `./scripts/setup.sh` to re-sync local state.

---

## Port conflicts

**Symptom:** `EADDRINUSE` / `address already in use`, or the app fails to bind on startup.

**Fix:**
- Find what's using the port (defaults are in `.env` / `docker-compose.yml`):
  ```bash
  lsof -i :<port>
  ```
- Stop the conflicting process, or change the port in `.env` (and in `docker-compose.yml` if the service is containerized).
- If a previous run left a container holding the port:
  ```bash
  docker compose down
  ```
  then bring it back up.

---

## Still stuck?

- Re-run the full setup from a clean state: `./scripts/setup.sh`.
- Reset the database: `./scripts/reset-db.sh`.
- Validate your environment: `node scripts/env-drift.mjs`.
- Check container health: `./scripts/check-container-health.sh`.
- Review `DEVELOPMENT_WORKFLOW.md` for the expected local workflow.