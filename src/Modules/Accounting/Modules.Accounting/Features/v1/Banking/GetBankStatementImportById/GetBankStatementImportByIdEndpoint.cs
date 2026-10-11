using FSH.Framework.Shared.Identity.Authorization;
using FSH.Modules.Accounting.Contracts.Authorization;
using FSH.Modules.Accounting.Contracts.v1.Banking;
using Mediator;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace FSH.Modules.Accounting.Features.v1.Banking.GetBankStatementImportById;

public static class GetBankStatementImportByIdEndpoint
{
    internal static RouteHandlerBuilder MapGetBankStatementImportByIdEndpoint(this IEndpointRouteBuilder endpoints) =>
        endpoints.MapGet("/banking/statement-imports/{importId:guid}",
                (Guid importId, IMediator mediator, CancellationToken ct) =>
                    mediator.Send(new GetBankStatementImportByIdQuery(importId), ct))
            .WithName("GetBankStatementImportById")
            .WithSummary("Get a bank statement import (lines, GL candidates, summary) by id")
            .RequirePermission(AccountingPermissions.Banking.View);
}
