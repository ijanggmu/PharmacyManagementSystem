using FluentValidation;
using FSH.Modules.Sales.Contracts.v1.Sales;
using FSH.Modules.Sales.Data.Configurations;
using FSH.Modules.Sales.Domain;

namespace FSH.Modules.Sales.Features.v1.Sales.CreateSale;

public sealed class CreateSaleCommandValidator : AbstractValidator<CreateSaleCommand>
{
    public CreateSaleCommandValidator()
    {
        // Legacy single-payment shape: method and a positive amount are required.
        When(x => x.Payments is not { Count: > 0 }, () =>
        {
            RuleFor(x => x.PaymentMethod)
                .NotEmpty()
                .MaximumLength(32)
                .Must(m => SalePaymentMethods.Normalize(m) is not null)
                .WithMessage("Payment method must be one of: " + string.Join(", ", SalePaymentMethods.All) + ".");
            RuleFor(x => x.PaymentAmount).GreaterThan(0m).PrecisionScale(18, 2, ignoreTrailingZeros: true)
                .WithMessage("Payment amount is in whole paisa (at most 2 decimal places).");
        });

        // Split tender: every leg needs an allowed method and a positive amount. Coverage of the
        // server-priced total is checked in the domain (Sale.Finalize), once prices are known.
        When(x => x.Payments is { Count: > 0 }, () =>
        {
            RuleForEach(x => x.Payments!).ChildRules(p =>
            {
                p.RuleFor(x => x.Method)
                    .NotEmpty()
                    .Must(m => SalePaymentMethods.Normalize(m) is not null)
                    .WithMessage("Payment method must be one of: " + string.Join(", ", SalePaymentMethods.All) + ".");
                p.RuleFor(x => x.Amount).GreaterThan(0m).PrecisionScale(18, 2, ignoreTrailingZeros: true)
                    .WithMessage("Payment amounts are in whole paisa (at most 2 decimal places).");
                p.RuleFor(x => x.Reference).MaximumLength(100);
            });
        });

        RuleFor(x => x.CustomerId)
            .NotNull()
            .When(x => x.Payments is { Count: > 0 } ps
                && ps.Any(p => string.Equals(p.Method.Trim(), "credit", StringComparison.OrdinalIgnoreCase)))
            .WithMessage("Customer is required for credit sales.");

        RuleFor(x => x.RedeemLoyaltyPoints).GreaterThanOrEqualTo(0);
        RuleFor(x => x.CustomerId)
            .NotNull()
            .When(x => x.RedeemLoyaltyPoints > 0)
            .WithMessage("Choose the member whose points are being redeemed.");

        RuleFor(x => x.Notes).MaximumLength(1024);
        RuleFor(x => x.ClientRequestId).MaximumLength(SaleConfiguration.MaxClientRequestIdLength);
        RuleFor(x => x.BuyerName).MaximumLength(SaleConfiguration.MaxBuyerNameLength);
        RuleFor(x => x.SmsReceiptPhone)
            .MaximumLength(20)
            .Matches(@"^\+?[0-9 \-]{7,20}$")
            .When(x => !string.IsNullOrWhiteSpace(x.SmsReceiptPhone))
            .WithMessage("Enter a valid mobile number for the SMS receipt.");
        RuleFor(x => x.BuyerPan)
            .Must(pan => string.IsNullOrWhiteSpace(pan) || Services.Ird.IrdPan.IsValid(pan))
            .WithMessage("Buyer PAN must be 9 digits.");
        RuleFor(x => x.ApprovalTokens).Must(t => t is null || t.Count <= 5).WithMessage("At most 5 approval tokens.");
        RuleForEach(x => x.ApprovalTokens).NotEmpty().MaximumLength(128);
        RuleFor(x => x.Items).NotEmpty().WithMessage("A sale must have at least one item.");
        RuleForEach(x => x.Items).ChildRules(item =>
        {
            item.RuleFor(i => i.MedicineId).NotEmpty();
            item.RuleFor(i => i.Quantity).GreaterThan(0m).PrecisionScale(18, 3, ignoreTrailingZeros: true)
                .WithMessage("Quantity can have at most 3 decimal places.");
            item.RuleFor(i => i.DiscountAmount).GreaterThanOrEqualTo(0m).PrecisionScale(18, 2, ignoreTrailingZeros: true)
                .WithMessage("Discount amount is in whole paisa (at most 2 decimal places).");
            item.RuleFor(i => i.DiscountPercent).InclusiveBetween(0m, 100m).PrecisionScale(5, 2, ignoreTrailingZeros: true);
            item.RuleFor(i => i.SaleUnit)
                .Must(SaleItemInput.IsKnownSaleUnit)
                .WithMessage("Sale unit must be 'base', 'pack' or 'box'.");
            // A pack (box) line names how many whole packs (boxes); its base Quantity is checked against the
            // medicine's UnitsPerPack (× PacksPerBox) by the handler (the pack and box sizes live in Inventory).
            item.RuleFor(i => i.PackCount)
                .NotNull().GreaterThan(0)
                .When(i => i.IsSoldInWholeUnits())
                .WithMessage("A line sold in packs or boxes needs a whole, positive pack count.");
            item.RuleFor(i => i.PackCount)
                .Null()
                .When(i => !i.IsSoldInWholeUnits())
                .WithMessage("Pack count is only sent for a line sold in packs or boxes.");
            item.RuleFor(i => i.Quantity)
                .Must(q => q == decimal.Truncate(q))
                .When(i => i.IsSoldInWholeUnits())
                .WithMessage("A line sold in packs or boxes has a whole base quantity.");
        });
    }
}
