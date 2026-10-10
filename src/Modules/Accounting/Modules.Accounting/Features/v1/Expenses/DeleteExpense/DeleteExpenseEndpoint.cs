using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.Expenses;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.Expenses.DeleteExpense;

public static class DeleteExpenseEndpoint
{
    internal static RouteHandlerBuilder MapDeleteExpenseEndpoint(this IEndpointRouteBuilder endpoints)
    {
        return endpoints.MapDelete("/expenses/{expenseId:guid}",
                async (Guid expenseId, IMediator mediator, CancellationToken ct) =>
                    Results.Ok(await mediator.Send(new DeleteExpenseCommand(expenseId), ct)))
            .WithName("DeleteExpense")
            .WithSummary("Delete an expense (reverses its GL voucher first)")
            .RequirePermission(AccountingPermissions.Expenses.Delete);
    }
}
