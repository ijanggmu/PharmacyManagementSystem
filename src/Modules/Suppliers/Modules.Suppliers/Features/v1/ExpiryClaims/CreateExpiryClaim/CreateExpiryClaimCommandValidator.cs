using FluentValidation;
using FSH.Modules.Suppliers.Contracts.v1.ExpiryClaims;

namespace FSH.Modules.Suppliers.Features.v1.ExpiryClaims.CreateExpiryClaim;

public sealed class CreateExpiryClaimCommandValidator : AbstractValidator<CreateExpiryClaimCommand>
{
    public CreateExpiryClaimCommandValidator()
    {
        RuleFor(x => x.SupplierId).NotEmpty();
        RuleFor(x => x.Notes).MaximumLength(1024);
        RuleFor(x => x.Lines).NotEmpty()
            .Must(lines => lines is null || lines.Select(l => l.BatchId).Distinct().Count() == lines.Count)
            .WithMessage("Each batch can appear only once on a claim.");
        RuleForEach(x => x.Lines).ChildRules(line =>
        {
            line.RuleFor(l => l.BatchId).NotEmpty();
            line.RuleFor(l => l.Quantity).GreaterThan(0m);
        });
    }
}
