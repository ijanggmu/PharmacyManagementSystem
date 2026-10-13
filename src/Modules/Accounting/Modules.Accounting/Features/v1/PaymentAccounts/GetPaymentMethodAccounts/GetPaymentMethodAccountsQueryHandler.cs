using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.v1.PaymentAccounts;
using FSH.Modules.Accounting.Data;
using Mediator;

namespace FSH.Modules.Accounting.Features.v1.PaymentAccounts.GetPaymentMethodAccounts;

public sealed class GetPaymentMethodAccountsQueryHandler(AccountingDbContext dbContext)
    : IQueryHandler<GetPaymentMethodAccountsQuery, IReadOnlyList<PaymentMethodAccountDto>>
{
    public async ValueTask<IReadOnlyList<PaymentMethodAccountDto>> Handle(
        GetPaymentMethodAccountsQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);
        return await PaymentMethodAccountsView.BuildAsync(dbContext, cancellationToken).ConfigureAwait(false);
    }
}
