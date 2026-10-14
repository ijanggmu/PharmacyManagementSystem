# Module: Notifications

Per-user in-app inbox (bell icon) driven by cross-module integration events, with live SignalR push. Module `Order = 750`.

**Entities / DbContext:** `Notification` (aggregate: `UserId`, `Type`, `Title`/`Body`/`Link`, `Source`, `MetadataJson`, `ReadAtUtc`). `NotificationsDbContext`. Consumes integration events from other modules (e.g. Accounting's operational alerts, Reference's licence-expiry reminders).
**Areas:** List, GetUnreadCount, MarkRead, MarkAllRead. Full list: `Features/v1/` or `/scalar`.

## Gotchas

- **It's a consumer.** New notification types come from **handling another module's integration event** (`AddIntegrationEventHandlers`), not from new endpoints. The handler writes an inbox row **and** pushes `"NotificationCreated"` to SignalR group `user:{userId}` via `IHubContext<AppHub>`.
- **Repeatable sources dedupe via `DedupeKey`** (unique per user). Daily scans: Reference's `LicenseExpiryScanJob` → `license.expiry`; Accounting's `OperationalAlertsJob` → `ops.*` digests (low stock, expiring batches, overdue payables/receivables) via `OperationalAlertRaisedIntegrationEvent`, delivered under `OperationalAlertDedupe` (Accounting.Contracts): one digest per category/scope a day, an unchanged one only every `alerts.repeat_days`.
- **Order matters** — Notifications (750) must load before any publisher whose events it consumes. If a new module publishes events Notifications should react to, mind the `Order`.
- In-memory bus runs handlers **synchronously in the publisher's request scope** — keep the handler minimal; an exception surfaces to the originating request. See `eventing.md`.
- Inbox rows are **denormalized** (Title/Body/Link/MetadataJson copied in) so rendering never calls back into the source module. `MarkRead` is idempotent (`ReadAtUtc ??= now`).

## SMS (Nepal)

- **Where:** `Sms/` (providers, templates, segments, quiet hours, dedupe), `Jobs/ProcessSmsQueueJob` (every minute + fire-and-forget per tenant), `Jobs/SmsReminderScanJob` (03:15 UTC = 09:00 NPT), `IntegrationEventHandlers/SaleReceiptSmsHandler`, `Features/v1/Sms` (`/notifications/sms/...`).
- **Tables:** `SmsSettings` (one per tenant; gateway token Data-Protection-encrypted like Sales' IRD password, never returned/logged), `SmsTemplates` (kind × language, defaults in `SmsTemplates`), `SmsMessages` (queue + log; text rendered at queue time).
- **Providers:** `LogOnly` (dev/tests), `Sparrow` (form `token, from, to, text`), `Aakash` (form `auth_token, to, text`). Field names follow the gateways' published APIs — re-verify against their current docs before go-live. Host URLs in `SmsOptions`. The `SmsGateway` HttpClient has `AddHeroResilience` with POST retries disabled (no double texts); the queue job retries with backoff.
- **Rules:** quiet hours (NPT, default 21-07) hold reminders, never receipts/tests; `MaxPerHour` per tenant; automatic reminders need `Customer.SmsConsent` (Customers module) — staff-initiated reminders and ticked receipts don't; refill templates must contain STOP; an invoice gets at most one reminder per `DuesReminderDays`. Never log phone numbers unmasked (`SmsPhone.Mask`) or message bodies.
- **Cross-module reads:** Customers.Contracts `GetCustomerSmsDuesQuery` / `GetCustomerSmsContactsQuery` (tenant-wide, server-only), Prescriptions.Contracts `GetRefillsDueQuery`, Sales.Contracts `SaleCompletedIntegrationEvent.SmsReceipt`.

