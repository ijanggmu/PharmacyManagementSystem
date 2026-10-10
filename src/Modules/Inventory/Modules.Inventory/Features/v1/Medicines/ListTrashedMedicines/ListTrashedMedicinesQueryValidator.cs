using FluentValidation;
using FSH.Modules.Inventory.Contracts.v1.Medicines;

namespace FSH.Modules.Inventory.Features.v1.Medicines.ListTrashedMedicines;

public sealed class ListTrashedMedicinesQueryValidator : AbstractValidator<ListTrashedMedicinesQuery>
{
    public ListTrashedMedicinesQueryValidator()
    {
        RuleFor(x => x.PageNumber).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 200);
    }
}
