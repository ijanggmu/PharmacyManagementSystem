# 0004. Remove the starter kit's Catalog and Chat modules

- **Status:** Accepted
- **Date:** 2026-10-14

## Context

The FullStackHero starter kit ships sample/business modules including **Catalog** (brands, products) and
**Chat** (channels, messages, realtime). The pharmacy product uses neither:

- Inventory's **medicines** (with batches, FEFO and pricing) replace Catalog's products.
- The pharmacy web app has **no chat UI**, and the admin console never subscribed to chat events. Chat was
  reachable only through the API.

Keeping them costs build time, tests, migrations, permissions and attack surface, and it confuses newcomers
("which product table is real?").

## Decision

Remove both modules completely:

- Runtime + `.Contracts` projects and their test projects.
- Module registration (Mediator markers + module list in both `Program.cs` files) and solution entries.
- The Notifications handler for chat mentions, and the admin app's unused chat CSS.
- A new EF migration, `Reference/20261014090000_DropCatalogAndChatSchemas`, that **drops the `catalog` and
  `chat` schemas** (CASCADE) and their rows in a shared `public."__EFMigrationsHistory"` table if one exists.
  It rides on Reference's migration set because the two DbContexts no longer exist; it is model-free.
- The shared SignalR `AppHub` (BuildingBlocks, protected) still requires `IChannelMembershipChecker` and
  `IUserChannelLookup`, which only Chat implemented. The API host now registers `NoChatChannels`, which
  reports no memberships. The hub keeps carrying notifications and presence; its chat-only methods (typing
  indicators) refuse every call. BuildingBlocks is unchanged.
- Tests that used Catalog as a sample module were moved onto other modules: `OutboxAtomicityTests` (Reference),
  `CrossModuleAmbientTransactionTests` (Tickets), and the permission registry/syncer tests (Tickets, Sales).

## Consequences

- **−** **Breaking API change:** every `/api/v1/catalog/*` and `/api/v1/chat/*` endpoint is gone, along with
  the related permissions and the chat realtime events.
- **−** Merging future upstream starter-kit changes is harder in the areas these modules touched
  (registration, Notifications, the realtime hub's channel services, tests that used them as fixtures).
- **−** Data in those tables is dropped by the migration. A pre-deploy dump (ADR 0005, `deploy.sh`) is the only
  copy.
- **+** A smaller surface: fewer projects, endpoints, permissions and tables to secure, migrate and test.
- **+** One product model (Inventory medicines).
- If chat or a generic catalog is ever needed, reintroduce it from upstream as a new ADR.
