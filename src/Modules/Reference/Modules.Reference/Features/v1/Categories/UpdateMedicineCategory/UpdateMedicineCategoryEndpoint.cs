using FSH.Modules.Reference.Contracts.Authorization;
using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Reference.Contracts.v1.Categories;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Reference.Features.v1.Categories.UpdateMedicineCategory;

public static class UpdateMedicineCategoryEndpoint
{
    internal static RouteHandlerBuilder MapUpdateMedicineCategoryEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPut("/categories/{categoryId:guid}",
                async (Guid categoryId, UpdateMedicineCategoryCommand body, IMediator mediator, CancellationToken ct) =>
                {
                    ArgumentNullException.ThrowIfNull(body);
                    var command = body with { CategoryId = categoryId };
                    return Results.Ok(await mediator.Send(command, ct));
                })
            .WithName("UpdateMedicineCategory")
            .WithSummary("Update a medicine category")
            .RequirePermission(ReferencePermissions.Categories.Update);
    }
}
