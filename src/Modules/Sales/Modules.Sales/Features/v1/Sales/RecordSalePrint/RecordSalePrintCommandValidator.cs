using FluentValidation;
using FSH.Modules.Sales.Contracts.v1.Sales;

namespace FSH.Modules.Sales.Features.v1.Sales.RecordSalePrint;

public sealed class RecordSalePrintCommandValidator : AbstractValidator<RecordSalePrintCommand>
{
    public static readonly string[] Formats = ["thermal-58", "thermal-80", "a5"];

    public RecordSalePrintCommandValidator()
    {
        RuleFor(x => x.SaleId).NotEmpty();
        RuleFor(x => x.Format)
            .NotEmpty()
            .Must(f => Formats.Contains(f, StringComparer.OrdinalIgnoreCase))
            .WithMessage($"Format must be one of: {string.Join(", ", Formats)}.");
    }
}
