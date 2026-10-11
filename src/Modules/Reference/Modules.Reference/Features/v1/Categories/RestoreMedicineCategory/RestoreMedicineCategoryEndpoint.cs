using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Reference.Contracts.Authorization;
using FSH.Modules.Reference.Contracts.v1.Categories;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Reference.Features.v1.Categories.RestoreMedicineCategory;

public static class RestoreMedicineCategoryEndpoint
{
    internal static RouteHandlerBuilder MapRestoreMedicineCategoryEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPost("/categories/{categoryId:guid}/restore",
                async (Guid categoryId, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(new RestoreMedicineCategoryCommand(categoryId), ct)))
            .WithName("RestoreMedicineCategory")
            .WithSummary("Restore a soft-deleted medicine category")
            .RequirePermission(ReferencePermissions.Categories.Restore)
            .WithIdempotency();
    }
}
