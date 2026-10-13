using FSH.Framework.Core.Context;
using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.v1.FiscalYears;
using FSH.Modules.Accounting.Services;
using Mediator;

namespace FSH.Modules.Accounting.Features.v1.FiscalYears.CloseFiscalYear;

public sealed class CloseFiscalYearCommandHandler(FiscalYearCloseService fiscalYears, ICurrentUser currentUser)
    : ICommandHandler<CloseFiscalYearCommand, FiscalYearCloseResultDto>
{
    public async ValueTask<FiscalYearCloseResultDto> Handle(CloseFiscalYearCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        string closedBy = currentUser.Name ?? currentUser.GetUserId().ToString();
        return await fiscalYears.CloseAsync(command.FiscalYear, closedBy, cancellationToken).ConfigureAwait(false);
    }
}
