# Architecture Decision Records

Short records of significant architecture decisions: why they were made and what they cost. Each ADR has
**Status, Date, Context, Decision, Consequences**. ADRs are append-only. To change a decision, add a new ADR
that supersedes the old one and update the old one's Status.

| # | Title | Status | Date |
|---|---|---|---|
| [0001](0001-modular-monolith-vertical-slices.md) | Modular monolith with vertical slices (FullStackHero starter kit) | Accepted | 2026-09-09 |
| [0002](0002-outbox-inbox-saga-over-ambient-transactions.md) | Outbox/Inbox saga for cross-module workflows, not ambient transactions | Accepted | 2026-09-10 |
| [0003](0003-nextjs-bff-over-dotnet-api.md) | Next.js web app as a BFF over the .NET API | Accepted | 2026-09-09 |
| [0004](0004-remove-catalog-and-chat-modules.md) | Remove the starter kit's Catalog and Chat modules | Accepted | 2026-10-14 |
| [0005](0005-single-vps-compose-deployment.md) | Single-VPS Docker Compose deployment | Accepted (current state) | 2026-10-14 |

New ADR: copy the newest file, take the next number, keep it to about a page.
