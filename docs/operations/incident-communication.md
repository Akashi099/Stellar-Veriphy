# Incident communication runbook

Use for downtime, delayed verifications, incorrect certificates or suspected exposure.
Use UTC timestamps and an incident ID (`INC-YYYYMMDD-NN`) in all records and notices.

## Ownership and escalation

The first responder records detection time, impact and evidence privately and contacts
maintainers directly. The first available maintainer becomes incident commander and
names a technical lead and communication owner (roles may initially be combined).
The commander owns severity and closure; the communication owner publishes approved
updates and monitors replies. Record names and the next update deadline.

If nobody acknowledges within 15 minutes, directly contact another maintainer; repeat
every 15 minutes until someone accepts command. Before release, maintainers must record
primary/backup contacts and private contact routes in a responder-accessible operational
roster. If private chat fails, use direct maintainer email and retain a private log.
Never expose sensitive evidence publicly to obtain attention.

| Severity | Examples | First notice after confirmation | Update cadence |
| --- | --- | --- | --- |
| SEV1 | Widespread outage, integrity failure, suspected key/data exposure | Within 15 minutes | Every 30 minutes |
| SEV2 | Partial outage, failed submissions, substantial delays | Within 30 minutes | Every 60 minutes |
| SEV3 | Limited degradation with safe workaround | Within four hours | Each business day |

Investigate immediately; do not wait for root cause before communicating. Escalate
plausible exposure/integrity failures to SEV1 and involve security and component owners
privately. Record unanswered escalations and decisions.

## Channels and sequence

1. Open a public GitHub issue titled `[Incident INC-ID] <user impact>` as the canonical
   status thread. Link it from the application banner when available; see
   [maintenance mode](maintenance-mode.md). Use the banner if GitHub fails and backfill
   the issue later; use GitHub if the application fails. Before release, configure an
   independent status channel in the operational roster for loss of both surfaces.
   Do not advertise an unconfigured status page or mailing list.
2. Publish affected features/networks, known start time (or unknown), confirmed impact,
   a safe workaround and next update time. State when recovery time is unknown.
3. Update at the severity cadence even without progress; publish material changes
   immediately. Mirror the same wording to the banner and configured support/status
   channels with the canonical link. Keep contributor coordination in the public
   thread only when it contains no sensitive details.
4. For planned maintenance, give at least 48 hours' notice where practical, including
   scope, UTC window and impact; remind users one hour before and announce start.
   Emergency work follows incident timing. Communicate overruns immediately.
5. Announce monitoring after mitigation. The technical lead checks health, submissions,
   queue recovery and affected journeys; use the [rollback checklist](rollback-checklist.md)
   if reverting a deployment. After at least 30 minutes of stable monitoring, the
   commander may approve resolution.
6. Publish recovery time, remaining impact, required user actions and follow-up date.
   Clear the banner and close the thread after the final update.

## Security incidents

Follow [SECURITY.md](../../SECURITY.md) for private reporting and coordinated disclosure.
Public notices describe impact and protective actions without exploit instructions,
secrets, personal data or unverified attribution. Keep evidence and affected-user lists
private. Security maintainers approve security wording; if unavailable, issue a minimal
availability notice within the cadence above. Arrange warranted direct affected-user
notifications through established support contacts. Refer notification obligations to
the responsible privacy/legal owner under the project's privacy policy.

## Update template

> [INC-ID] Investigating / Identified / Monitoring / Resolved — [UTC timestamp].
> Impact: [features, networks, start time and symptoms].
> User action: [safe workaround or no action currently required].
> Progress: [confirmed facts; recovery estimate only when supported].
> Next update: [UTC time, even if there is no change].
> Status: [canonical thread link].

Within two business days of recovery, assign follow-up owners. Within five business
days publish a sanitized review linked from the thread: impact, timeline, detection,
known root cause, recovery, communication gaps and preventive actions with owners and
deadlines. Review contacts and exercise primary-channel failure quarterly.
