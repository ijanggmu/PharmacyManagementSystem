using FluentValidation;
using FSH.Modules.Customers.Contracts.v1.Ledger;

namespace FSH.Modules.Customers.Features.v1.Ledger.GetCustomerStatement;

public sealed class GetCustomerStatementQueryValidator : AbstractValidator<GetCustomerStatementQuery>
{
    /// <summary>Longest period one statement may cover (two years, leap day included).</summary>
    public const int MaxRangeDays = 731;

    public GetCustomerStatementQueryValidator()
    {
        RuleFor(x => x.CustomerId).NotEmpty();
        RuleFor(x => x.BranchId).NotEqual(Guid.Empty).When(x => x.BranchId is not null);
        RuleFor(x => x.FromUtc)
            .LessThanOrEqualTo(x => x.ToUtc)
            .WithMessage("The statement start date must be on or before its end date.");
        RuleFor(x => x.ToUtc)
            .Must((q, to) => (to - q.FromUtc).TotalDays <= MaxRangeDays)
            .When(x => x.FromUtc <= x.ToUtc)
            .WithMessage("A statement can cover at most two years.");
    }
}
