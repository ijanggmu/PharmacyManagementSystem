using FSH.Modules.Multitenancy.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Multitenancy.Contracts.v1.GetBranchContext;

/// <summary>
/// Lists the caller's tenant branches plus which one is the caller's current branch. .NET-side
/// equivalent of the Next.js reference's <c>GET /api/branch-context</c>.
/// </summary>
public sealed record GetBranchContextQuery : IQuery<BranchContextDto>;
