using FluentValidation;
using FSH.Modules.Sales.Contracts.v1.ParkedSales;
using FSH.Modules.Sales.Contracts.v1.Sales;
using FSH.Modules.Sales.Domain;

namespace FSH.Modules.Sales.Features.v1.ParkedSales;

public sealed class ParkSaleCommandValidator : AbstractValidator<ParkSaleCommand>
{
    public ParkSaleCommandValidator()
    {
        RuleFor(x => x.Label).MaximumLength(ParkedSale.MaxLabelLength);
        RuleFor(x => x.Lines).NotEmpty().WithMessage("There is nothing in the cart to hold.");
        RuleFor(x => x.Lines).Must(l => l is null || l.Count <= ParkedSale.MaxLines)
            .WithMessage($"A held bill has at most {ParkedSale.MaxLines} lines.");
        RuleForEach(x => x.Lines).ChildRules(line =>
        {
            line.RuleFor(l => l.MedicineId).NotEmpty();
            line.RuleFor(l => l.MedicineName).NotEmpty().MaximumLength(300);
            line.RuleFor(l => l.Quantity).GreaterThan(0m);
            line.RuleFor(l => l.DiscountPercent).InclusiveBetween(0m, 100m);
            line.RuleFor(l => l.UnitPrice).GreaterThanOrEqualTo(0m);
            line.RuleFor(l => l.LineTotal).GreaterThanOrEqualTo(0m);
            line.RuleFor(l => l.SaleUnit)
                .Must(SaleItemInput.IsKnownSaleUnit)
                .WithMessage("Sale unit must be 'base', 'pack' or 'box'.");
            line.RuleFor(l => l.PackCount).GreaterThan(0).When(l => l.PackCount is not null);
        });
        RuleFor(x => x.TotalAmount).GreaterThanOrEqualTo(0m);
        RuleFor(x => x.BillDiscountAmount).GreaterThanOrEqualTo(0m);
        RuleFor(x => x.CustomerName).MaximumLength(ParkedSale.MaxNameLength);
        RuleFor(x => x.BuyerName).MaximumLength(ParkedSale.MaxNameLength);
        RuleFor(x => x.BuyerPan).MaximumLength(20);
        RuleFor(x => x.Notes).MaximumLength(ParkedSale.MaxNotesLength);
        RuleFor(x => x.ClientParkId).MaximumLength(ParkedSale.MaxClientParkIdLength);
    }
}

public sealed class RecallParkedSaleCommandValidator : AbstractValidator<RecallParkedSaleCommand>
{
    public RecallParkedSaleCommandValidator() => RuleFor(x => x.Id).NotEmpty();
}

public sealed class DiscardParkedSaleCommandValidator : AbstractValidator<DiscardParkedSaleCommand>
{
    public DiscardParkedSaleCommandValidator() => RuleFor(x => x.Id).NotEmpty();
}
