using FSH.Modules.Reference.Contracts.Authorization;
using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Reference.Contracts.v1.Categories;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Reference.Features.v1.Categories.GetMedicineCategoryById;

public static class GetMedicineCategoryByIdEndpoint
{
    internal static RouteHandlerBuilder MapGetMedicineCategoryByIdEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/categories/{categoryId:guid}",
                (Guid categoryId, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new GetMedicineCategoryByIdQuery(categoryId), ct))
            .WithName("GetMedicineCategoryById")
            .WithSummary("Get a medicine category by id")
            .RequirePermission(ReferencePermissions.Categories.View);
    }
}
