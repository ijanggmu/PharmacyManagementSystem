using FluentValidation;
using FSH.Modules.Suppliers.Contracts.v1.ExpiryClaims;
using FSH.Modules.Suppliers.Services;

namespace FSH.Modules.Suppliers.Features.v1.ExpiryClaims.AcceptExpiryClaim;

public sealed class AcceptExpiryClaimCommandValidator : AbstractValidator<AcceptExpiryClaimCommand>
{
    public AcceptExpiryClaimCommandValidator()
    {
        RuleFor(x => x.ClaimId).NotEmpty();
        RuleFor(x => x.ReturnDateUtc).NotEmpty().Must(BusinessDateRules.IsValid).WithMessage(BusinessDateRules.Message);
        RuleFor(x => x.SupplierInvoiceNumber).MaximumLength(100);
        RuleFor(x => x.Lines)
            .Must(lines => lines is null || lines.Select(l => l.LineId).Distinct().Count() == lines.Count)
            .WithMessage("Each claim line can be answered only once.");
        RuleForEach(x => x.Lines).ChildRules(line =>
        {
            line.RuleFor(l => l.LineId).NotEmpty();
            line.RuleFor(l => l.AcceptedQuantity).GreaterThanOrEqualTo(0m);
        });
    }
}
