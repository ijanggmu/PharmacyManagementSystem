using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Reference.Contracts.Authorization;
using FSH.Modules.Reference.Contracts.v1.Categories;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Reference.Features.v1.Categories.ListTrashedMedicineCategories;

public static class ListTrashedMedicineCategoriesEndpoint
{
    internal static RouteHandlerBuilder MapListTrashedMedicineCategoriesEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/categories/trash",
                async (int? pageNumber, int? pageSize, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(
                        new ListTrashedMedicineCategoriesQuery(pageNumber ?? 1, pageSize ?? 20), ct)))
            .WithName("ListTrashedMedicineCategories")
            .WithSummary("List soft-deleted medicine categories")
            .RequirePermission(ReferencePermissions.Categories.Restore);
    }
}
