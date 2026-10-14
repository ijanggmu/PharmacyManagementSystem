# Module: Tickets

Support ticket lifecycle with comments. Module `Order = 700`.

**Entities / DbContext:** `Ticket` (aggregate, soft-deletable, state machine) + `TicketComment`. `TicketsDbContext`. `TicketStatus`/`TicketPriority` enums in Contracts; domain events internal.
**Areas:** Create, Assign, Resolve, Reopen, Restore, AddComment, ListComments, GetById, Search, ListTrashed. Full list: `Features/v1/` or `/scalar`.

## Gotchas

- **State machine** (`Domain/Ticket.cs`): `Open → InProgress → Resolved → Closed`. Illegal transitions throw **`CustomException` with `HttpStatusCode.Conflict` (409)** — not a generic 400. Assigning auto-starts (Open→InProgress); unassigning an InProgress ticket reverts to Open; creating with an assignee starts at InProgress. Closed tickets reject comments/resolve until reopened. Keep all transition guards in the aggregate.
- Soft-delete/restore/trash pattern: unique indexes are filtered on `"IsDeleted" = FALSE` so a trashed row doesn't block reusing its key (see `TicketConfiguration`).
- Endpoints are mapped on the bare `api/v{version}` group (no `/tickets` sub-path); literal routes precede `{ticketId:guid}`.
- **Access model (own vs tenant admin)** — `Tickets.View` + `Tickets.Create` are `IsBasic` (every tenant user): self-service on tickets the caller *reported*. `Tickets.ViewAll` (non-basic; Admin + pharmacy Manager) is the tenant support-desk view of every ticket. Enforced in handlers via `Authorization/TicketAccess` (scoped): Search force-filters `ReporterUserId == caller` without ViewAll; GetById/ListComments → **404** on another user's ticket; AddComment/Close/Reopen gate on `View` at the endpoint and allow the reporter, otherwise need ViewAll + Comment/Close/Reopen (404 if not visible, 403 if visible but not permitted). Assign/Resolve/Update/Delete/Restore stay admin-permission endpoints; Create with an `AssignedToUserId` needs `Tickets.Assign`. Never use `IgnoreQueryFilters` for this — tenant isolation stays on Finbuckle; cross-tenant is only the `ViewCrossTenant` endpoints.
