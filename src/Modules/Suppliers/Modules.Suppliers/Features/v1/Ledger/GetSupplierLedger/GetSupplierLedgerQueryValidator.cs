using FluentValidation;
using FSH.Modules.Suppliers.Contracts.v1.Ledger;

namespace FSH.Modules.Suppliers.Features.v1.Ledger.GetSupplierLedger;

public sealed class GetSupplierLedgerQueryValidator : AbstractValidator<GetSupplierLedgerQuery>
{
    public GetSupplierLedgerQueryValidator()
    {
        RuleFor(x => x.SupplierId).NotEmpty();
        RuleFor(x => x.PageNumber).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 200);
    }
}
