using FluentValidation;
using FSH.Modules.Inventory.Contracts.v1.Reports;

namespace FSH.Modules.Inventory.Features.v1.Reports.GetTopSellingMedicines;

public sealed class GetTopSellingMedicinesQueryValidator : AbstractValidator<GetTopSellingMedicinesQuery>
{
    public GetTopSellingMedicinesQueryValidator()
    {
        RuleFor(x => x.ToUtc).GreaterThanOrEqualTo(x => x.FromUtc)
            .WithMessage("toUtc must be on or after fromUtc.");
        RuleFor(x => x.Take).InclusiveBetween(1, 100);
    }
}
