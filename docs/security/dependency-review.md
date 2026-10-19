# Dependency security and maintenance

## Automated security checks

`Dependency security` runs on every PR, main push, weekly on Monday and manual
dispatch. Trivy scans committed JavaScript and Cargo lockfiles, including development
dependencies. It builds and scans the application runtime image and literal external
image references in `docker-compose*.yml`. The variable preview tag is covered by
the application build; new variable image references need explicit coverage before
release. Development images are not release artifacts. Commit synchronized lockfiles
for every manifest: manifests alone do not provide resolved dependency coverage.

HIGH/CRITICAL findings (including unfixed advisories), scanner errors and build errors
fail the checks. Reports are retained as Actions artifacts for 30 days. PR jobs receive
no application secrets and publish no images. An incomplete scan is not a clean scan.

Maintainers must enable Actions failure notifications and require `Package vulnerability
scan` and `Image vulnerability scan` in the main branch ruleset. Before deployment,
operators verify successful checks for the exact release commit. This checkout has no
deployment workflow: future deployment workflows must call this reusable workflow and
use `needs` to gate publication/deployment on success. Independent checks alone do not
prevent a deployment. Review scanner/action versions and coverage quarterly.

## Ownership and risk thresholds

The update reviewer owns PR findings. A maintainer reviews scheduled failures within
one business day and assigns an owner. Escalate suspected exploitation immediately
using the [incident runbook](../operations/incident-communication.md).

| Signal | Required response |
| --- | --- |
| Critical advisory | Block release; triage within 24 hours and mitigate immediately |
| High advisory | Block release; triage within two business days; target remediation within seven days |
| Medium/Low advisory | Track and review within 30 days |
| Latest stable release at least 365 days old | Review support and alternatives within 30 days |
| Latest stable release at least 730 days old or deprecated | Maintenance check fails; assign migration/support decision before merging updates |
| Archived upstream, deprecated resolved version, unsupported runtime | High maintenance risk regardless of release age |

Reporter/disclosure timelines remain governed by [SECURITY.md](../../SECURITY.md).
Do not lower vulnerability thresholds or add broad ignores to unblock releases.
If no fix exists, remove the dependency or mitigate affected functionality with a
documented security review.

## Monthly maintenance review

`Dependency maintenance` runs monthly on the first, manually, and on manifest/tool
PRs. A standard-library Python script queries registry metadata without installing
or executing dependencies. Direct runtime, development, optional and peer dependencies
in root, frontend, backend and shared packages appear in its summary and 90-day
artifact. Registry lookup failures fail the job and require investigation or retry.

Release age measures upstream stable-release activity, not abandonment or installed
version age. The reviewing maintainer also checks resolved lockfile versions, release
notes, upstream archive/support status, security responses and migration cost.
Explicitly review Next.js, wallet/Stellar SDKs, parsers, cryptography, Soroban crates,
Docker base images and Compose services. Prefer reviewed image versions/digests over
mutable tags such as `latest`.

Record each monthly review in a dated tracking issue with resolved versions, upstream
evidence, report links, risk, owner, action and deadline. Upgrade, replace, remove or
adopt a supported fork of unmaintained packages. Update manifests and lockfiles
together and include compatibility/security validation in the PR. Age gates have no
automatic exemptions: track justified continued use with a dated support decision,
but keep the failed maintenance result visible until remediated.
