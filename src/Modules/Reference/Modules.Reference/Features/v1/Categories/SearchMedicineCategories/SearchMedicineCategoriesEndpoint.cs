using FSH.Modules.Reference.Contracts.Authorization;
using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Reference.Contracts.v1.Categories;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Reference.Features.v1.Categories.SearchMedicineCategories;

public static class SearchMedicineCategoriesEndpoint
{
    internal static RouteHandlerBuilder MapSearchMedicineCategoriesEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapGet("/categories",
                (string? search, Guid? parentCategoryId, int? pageNumber, int? pageSize,
                 string? sortBy, string? sortDir,
                 IMediator mediator, CancellationToken ct) =>
                    mediator.Send(
                        new SearchMedicineCategoriesQuery(
                            search,
                            parentCategoryId,
                            pageNumber is null or 0 ? 1 : pageNumber.Value,
                            pageSize is null or 0 ? 50 : pageSize.Value,
                            sortBy,
                            sortDir),
                        ct))
            .WithName("SearchMedicineCategories")
            .WithSummary("Search medicine categories (paged, filter by parent, sortable)")
            .RequirePermission(ReferencePermissions.Categories.View);
    }
}
