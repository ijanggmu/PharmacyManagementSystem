using FSH.Modules.Billing.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Billing.Contracts.v1.Subscriptions;

/// <summary>
/// Root-only query: lists the current subscription (active, suspended or cancelled-but-latest) for
/// every tenant that has one, joined with its plan. Used by the SuperAdmin tenant list/overview to
/// show plan + subscription status for every client in a single call instead of one call per tenant.
/// </summary>
public sealed record GetSubscriptionsQuery : IQuery<IReadOnlyList<SubscriptionDto>>;
