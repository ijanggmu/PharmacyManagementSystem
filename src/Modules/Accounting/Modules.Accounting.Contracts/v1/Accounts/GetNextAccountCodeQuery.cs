using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.Accounts;

/// <summary>The code a new account created under <paramref name="ParentId"/> would get right now (a preview — not reserved).</summary>
public sealed record GetNextAccountCodeQuery(Guid ParentId) : IQuery<string>;
