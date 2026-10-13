using FSH.Framework.Core.Context;
using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.v1.FiscalYears;
using FSH.Modules.Accounting.Services;
using Mediator;

namespace FSH.Modules.Accounting.Features.v1.FiscalYears.ReopenFiscalYear;

public sealed class ReopenFiscalYearCommandHandler(FiscalYearCloseService fiscalYears, ICurrentUser currentUser)
    : ICommandHandler<ReopenFiscalYearCommand, FiscalYearReopenResultDto>
{
    public async ValueTask<FiscalYearReopenResultDto> Handle(ReopenFiscalYearCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        string reopenedBy = currentUser.Name ?? currentUser.GetUserId().ToString();
        return await fiscalYears.ReopenAsync(command.FiscalYear, reopenedBy, cancellationToken).ConfigureAwait(false);
    }
}
