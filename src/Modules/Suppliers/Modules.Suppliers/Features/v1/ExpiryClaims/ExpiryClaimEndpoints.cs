using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Suppliers.Contracts.Authorization;
using FSH.Modules.Suppliers.Contracts.v1.ExpiryClaims;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Suppliers.Features.v1.ExpiryClaims;

/// <summary>
/// Expiry claims to suppliers. Reading needs Returns.View; drafting and answering a claim needs Returns.Create —
/// accepting one raises a supplier return (debit note).
/// </summary>
public static class ExpiryClaimEndpoints
{
    internal static void MapExpiryClaimEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/suppliers/expiry-claims/candidates",
                async ([AsParameters] GetExpiryClaimCandidatesQuery query, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(query, ct)))
            .WithName("GetExpiryClaimCandidates")
            .WithSummary("Near-expiry and expired lots of the current branch, grouped by the supplier that delivered them")
            .RequirePermission(SuppliersPermissions.Returns.View);

        endpoints.MapGet("/suppliers/expiry-claims",
                async ([AsParameters] SearchExpiryClaimsQuery query, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(query, ct)))
            .WithName("SearchExpiryClaims")
            .WithSummary("List expiry claims")
            .RequirePermission(SuppliersPermissions.Returns.View);

        endpoints.MapGet("/suppliers/expiry-claims/{claimId:guid}",
                async (Guid claimId, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(new GetExpiryClaimByIdQuery(claimId), ct)))
            .WithName("GetExpiryClaimById")
            .WithSummary("An expiry claim with its lots")
            .RequirePermission(SuppliersPermissions.Returns.View);

        endpoints.MapPost("/suppliers/expiry-claims",
                async (CreateExpiryClaimCommand body, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(body, ct)))
            .WithName("CreateExpiryClaim")
            .WithSummary("Draft an expiry claim to a supplier")
            .RequirePermission(SuppliersPermissions.Returns.Create)
            .WithIdempotency();

        endpoints.MapPost("/suppliers/expiry-claims/{claimId:guid}/status",
                async (Guid claimId, ChangeExpiryClaimStatusCommand body, IMediator mediator, CancellationToken ct) =>
                {
                    ArgumentNullException.ThrowIfNull(body);
                    return Results.Ok(await mediator.Send(body with { ClaimId = claimId }, ct));
                })
            .WithName("ChangeExpiryClaimStatus")
            .WithSummary("Mark a claim sent, rejected, or credited")
            .RequirePermission(SuppliersPermissions.Returns.Create);

        endpoints.MapPost("/suppliers/expiry-claims/{claimId:guid}/accept",
                async (Guid claimId, AcceptExpiryClaimCommand body, IMediator mediator, CancellationToken ct) =>
                {
                    ArgumentNullException.ThrowIfNull(body);
                    return Results.Ok(await mediator.Send(body with { ClaimId = claimId }, ct));
                })
            .WithName("AcceptExpiryClaim")
            .WithSummary("Record the supplier's (partial) acceptance and send the accepted lots back on a debit note")
            .RequirePermission(SuppliersPermissions.Returns.Create)
            .WithIdempotency();
    }
}
