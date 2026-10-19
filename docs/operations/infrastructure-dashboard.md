# Infrastructure health dashboard

A Grafana dashboard that shows, on one screen, whether the app services, the data stores, and the external dependencies the backend relies on are healthy right now.

- Dashboard definition: [`monitoring/grafana/dashboards/infrastructure-health.json`](../../monitoring/grafana/dashboards/infrastructure-health.json)
- Provisioning: [`monitoring/grafana/provisioning/`](../../monitoring/grafana/provisioning/)
- Scrape config: [`monitoring/prometheus-staging.yml`](../../monitoring/prometheus-staging.yml)

## Opening it

The dashboard ships with the staging stack:

```bash
export STAGING_GRAFANA_PASSWORD=choose_a_password
docker-compose -f docker-compose.staging.yml up -d prometheus grafana postgres-exporter redis-exporter
```

Then open <http://localhost:3002> and sign in as `admin` (or `$STAGING_GRAFANA_USER`). **Infrastructure Health** is set as the home dashboard and is also listed under the _Stellar Veriphy_ folder. It refreshes every 30 seconds and shows the last hour by default.

The dashboard is provisioned read-only. To change it, edit the JSON file and restart Grafana (or wait up to 30s for the file provider to reload it); edits made in the UI are not saved.

## Panels

| Panel                    | Source metric                                  | States                                                                                                          |
| ------------------------ | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Application services     | `up{job=~"frontend\|api"}`                     | UP / DOWN. DOWN means Prometheus can't scrape the service's `/metrics` endpoint.                                |
| Data stores              | `pg_up`, `redis_up` (exporters)                | UP / DOWN. Reflects whether the exporter can reach the database, not just whether the exporter is running.      |
| Dependency health        | `sv_dependency_health`                         | UP / DEGRADED / DOWN for `mongodb`, `stellar_horizon`, `soroban_rpc`, and optional `ipfs`, `kms`, `tee_oracle`. |
| Last successful check    | `sv_dependency_last_success_timestamp_seconds` | Age in seconds. Orange after 2 minutes, red after 10.                                                           |
| Consecutive failures     | `sv_dependency_consecutive_failures`           | 0 when healthy.                                                                                                 |
| Check latency (p95)      | `sv_dependency_check_duration_seconds`         | Includes retries, so a spike can mean a dependency is flapping.                                                 |
| Check failures by reason | `sv_dependency_check_failures_total`           | Stacked by `reason` (`timeout`, `connection`, `misconfigured`, ...).                                            |

A tile showing **NO DATA** means Prometheus has no samples for that series. Usually the target isn't running or isn't reachable from the Prometheus container; check <http://localhost:9090/targets>.

## Reading it

- **App service DOWN, data stores UP**: the service process crashed or is restarting. Check `docker-compose -f docker-compose.staging.yml logs <service>`.
- **Data store DOWN**: everything downstream will follow. Fix the database first. `/health/ready` on the backend will return `503` while `mongodb` (the default critical dependency) is down.
- **External dependency DEGRADED or DOWN**: the backend keeps serving cached and MongoDB-backed reads. Follow the remediation hint returned by `GET /health` and the per-dependency guidance in [health-checks.md](health-checks.md).
- **Reason `misconfigured`**: the URL points at the wrong Stellar network. Compare `STELLAR_NETWORK` with the Horizon/RPC URL.

Alerting for the same metrics lives in [`infra/prometheus/alerts.yml`](../../infra/prometheus/alerts.yml); the dashboard is for looking, the alerts are for paging.

## Adding a service

1. Expose metrics from the service, or add an exporter to `docker-compose.staging.yml`.
2. Add a scrape job to `monitoring/prometheus-staging.yml`.
3. Add the series to the relevant stat panel in `infrastructure-health.json` (keep the UP/DOWN value mappings so the tile stays readable).
