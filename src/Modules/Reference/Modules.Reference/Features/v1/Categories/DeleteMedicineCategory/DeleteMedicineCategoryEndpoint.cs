using FSH.Modules.Reference.Contracts.Authorization;
using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Reference.Contracts.v1.Categories;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Reference.Features.v1.Categories.DeleteMedicineCategory;

public static class DeleteMedicineCategoryEndpoint
{
    internal static RouteHandlerBuilder MapDeleteMedicineCategoryEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapDelete("/categories/{categoryId:guid}",
                async (Guid categoryId, IMediator mediator, CancellationToken ct) =>
                {
                    await mediator.Send(new DeleteMedicineCategoryCommand(categoryId), ct);
                    return Results.NoContent();
                })
            .WithName("DeleteMedicineCategory")
            .WithSummary("Delete a medicine category")
            .RequirePermission(ReferencePermissions.Categories.Delete);
    }
}
