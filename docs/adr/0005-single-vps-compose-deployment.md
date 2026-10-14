# 0005. Single-VPS Docker Compose deployment

- **Status:** Accepted (records the current state)
- **Date:** 2026-10-14

## Context

The product is early-stage, run by a small team, and cost-sensitive. The starter kit ships Terraform for AWS
(`deploy/terraform`: ECS, RDS, ElastiCache, ALB, WAF, S3, CloudWatch), Aspire for local orchestration, and a
Docker Compose stack (`deploy/docker`).

## Decision

Run production as **one Docker Compose stack on a single VPS** (`deploy/docker/docker-compose.yml`): Postgres
18, Valkey (Redis), RustFS (S3-compatible), a one-shot migrator, the API, the pharmacy web app (Next.js BFF),
the optional admin console, and an optional Caddy TLS edge (or a host nginx / nginx-proxy). App ports bind to
`127.0.0.1`. The data plane is compose-internal.

**Delivery:** `.github/workflows/deploy.yml` deploys **every push to `main`**. It builds four images, pushes them
to GHCR, runs a storage smoke test, copies the compose bundle over SCP, and runs `scripts/deploy.sh` over SSH.
That script takes a pre-deploy `pg_dump`, runs `compose up`, polls health, and rolls back the images on failure.
There is **no staging environment**. Backups are a nightly `scripts/backup.sh` (`pg_dump`, optional off-site
copy). See `docs/runbooks/disaster-recovery.md`.

## Consequences

- **+** Cheap and simple. One host, one `.env`, deploys in minutes, automatic image rollback.
- **−** **Single point of failure.** A host, disk or provider outage takes everything down. Recovery is
  restore-from-backup (RPO 24 h / RTO 4 h, see the DR runbook).
- **−** **No staging.** Migrations and releases are first exercised in production, guarded only by CI tests, the
  pre-deploy dump and the health gate. Image rollback does not undo migrations.
- **−** Vertical scaling only. Data-plane maintenance (Postgres upgrades, disk) is manual.
- **−** `deploy/terraform` (AWS) and `deploy/dokploy` are **unused**. They are starter-kit leftovers that can mislead
  readers and drift from the compose setup. Delete them, or adopt them through a new ADR.
- Revisit when tenant count, an uptime SLA or compliance demands it: managed Postgres with PITR, a staging stack,
  and more than one app host.
