using FluentValidation;
using FSH.Modules.Inventory.Contracts.v1.Medicines;

namespace FSH.Modules.Inventory.Features.v1.Medicines.GetMedicineSummaries;

public sealed class GetMedicineSummariesQueryValidator : AbstractValidator<GetMedicineSummariesQuery>
{
    public GetMedicineSummariesQueryValidator()
    {
        RuleFor(x => x.MedicineIds).NotNull();
        RuleFor(x => x.MedicineIds.Count)
            .LessThanOrEqualTo(GetMedicineSummariesQuery.MaxIds)
            .When(x => x.MedicineIds is not null);
    }
}
