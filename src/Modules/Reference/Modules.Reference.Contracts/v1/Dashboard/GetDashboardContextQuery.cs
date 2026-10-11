using FSH.Modules.Reference.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Reference.Contracts.v1.Dashboard;

/// <summary>Dashboard bootstrap payload for the calling user. See <see cref="DashboardContextDto"/>.</summary>
/// <param name="BranchId">Branch the dashboard counters are for; null = the caller's default scope
/// (all branches for <c>Branches.ViewAll</c> holders, otherwise their own branch).</param>
public sealed record GetDashboardContextQuery(Guid? BranchId = null) : IQuery<DashboardContextDto>;
