using FSH.Modules.Reference.Contracts.Authorization;
using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Reference.Contracts.v1.Categories;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Reference.Features.v1.Categories.GetMedicineCategoryTree;

public static class GetMedicineCategoryTreeEndpoint
{
    internal static RouteHandlerBuilder MapGetMedicineCategoryTreeEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/categories/tree",
                (IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new GetMedicineCategoryTreeQuery(), ct))
            .WithName("GetMedicineCategoryTree")
            .WithSummary("Get the full medicine category tree")
            .RequirePermission(ReferencePermissions.Categories.View);
    }
}
