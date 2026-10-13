using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Customers.Contracts.Authorization;
using FSH.Modules.Customers.Contracts.v1.Customers;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Customers.Features.v1.Customers.ImportCustomers;

public static class CreateCustomerImportEndpoint
{
    internal static RouteHandlerBuilder MapCreateCustomerImportEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPost("/customers/import",
                async (ImportCustomersCommand command, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(command, ct)))
            .WithName("ImportCustomers")
            .WithSummary("Import customers from a spreadsheet (all-or-nothing; dryRun previews)")
            .RequirePermission(CustomersPermissions.Customers.Create)
            .WithIdempotency();
    }
}
