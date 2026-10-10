using FSH.Framework.Shared.Identity.Authorization;
using FSH.Framework.Web.Idempotency;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.Expenses;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.Expenses.RecordExpense;

public static class CreateExpenseEndpoint
{
    internal static RouteHandlerBuilder MapCreateExpenseEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapPost("/expenses",
                async (RecordExpenseCommand command, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(command, ct)))
            .WithName("CreateExpense")
            .WithSummary("Record a business expense (Dr General Expenses / Cr Cash or Bank)")
            .RequirePermission(AccountingPermissions.Expenses.Record)
            .WithIdempotency();
}
