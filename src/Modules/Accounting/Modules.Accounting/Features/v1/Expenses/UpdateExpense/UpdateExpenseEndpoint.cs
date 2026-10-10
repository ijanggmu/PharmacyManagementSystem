using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.Expenses;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.Expenses.UpdateExpense;

public static class UpdateExpenseEndpoint
{
    internal static RouteHandlerBuilder MapUpdateExpenseEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapPatch("/expenses/{expenseId:guid}",
                async (Guid expenseId, UpdateExpenseCommand body, IMediator mediator, CancellationToken ct) =>
                {
                    ArgumentNullException.ThrowIfNull(body);
                    var command = body with { ExpenseId = expenseId };
                    return Results.Ok(await mediator.Send(command, ct));
                })
            .WithName("UpdateExpense")
            .WithSummary("Update a recorded expense (reverses and reposts its GL voucher)")
            .RequirePermission(AccountingPermissions.Expenses.Update);
    }
}
