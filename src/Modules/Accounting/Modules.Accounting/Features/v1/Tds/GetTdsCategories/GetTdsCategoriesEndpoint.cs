using FSH.Modules.Accounting.Contracts.v1.Tds;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.Tds.GetTdsCategories;

public static class GetTdsCategoriesEndpoint
{
    /// <summary>Any signed-in user of the tenant: the expense form and the supplier payment dialog pre-fill the rate
    /// from these, and they hold nothing sensitive.</summary>
    internal static RouteHandlerBuilder MapGetTdsCategoriesEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapGet("/tds/categories",
                (IMediator mediator, CancellationToken ct) => mediator.Send(new GetTdsCategoriesQuery(), ct))
            .WithName("GetTdsCategories")
            .WithSummary("TDS (withholding tax) categories and their rates");
}
