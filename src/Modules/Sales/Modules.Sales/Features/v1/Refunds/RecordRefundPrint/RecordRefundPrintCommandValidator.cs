using FluentValidation;
using FSH.Modules.Sales.Contracts.v1.Refunds;
using FSH.Modules.Sales.Features.v1.Sales.RecordSalePrint;

namespace FSH.Modules.Sales.Features.v1.Refunds.RecordRefundPrint;

public sealed class RecordRefundPrintCommandValidator : AbstractValidator<RecordRefundPrintCommand>
{
    public RecordRefundPrintCommandValidator()
    {
        RuleFor(x => x.RefundId).NotEmpty();
        RuleFor(x => x.Format)
            .NotEmpty()
            .Must(f => RecordSalePrintCommandValidator.Formats.Contains(f, StringComparer.OrdinalIgnoreCase))
            .WithMessage($"Format must be one of: {string.Join(", ", RecordSalePrintCommandValidator.Formats)}.");
    }
}
