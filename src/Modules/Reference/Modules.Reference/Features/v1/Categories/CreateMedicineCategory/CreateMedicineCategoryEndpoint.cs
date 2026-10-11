using FSH.Modules.Reference.Contracts.Authorization;
using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Reference.Contracts.v1.Categories;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Reference.Features.v1.Categories.CreateMedicineCategory;

public static class CreateMedicineCategoryEndpoint
{
    internal static RouteHandlerBuilder MapCreateMedicineCategoryEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPost("/categories",
                async (CreateMedicineCategoryCommand command, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(command, ct)))
            .WithName("CreateMedicineCategory")
            .WithSummary("Create a medicine category")
            .RequirePermission(ReferencePermissions.Categories.Create)
            .WithIdempotency();
    }
}
