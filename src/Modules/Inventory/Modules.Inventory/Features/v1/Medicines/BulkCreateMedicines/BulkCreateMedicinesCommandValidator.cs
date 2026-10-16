using FluentValidation;
using FSH.Modules.Inventory.Contracts.Events;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Inventory.Domain;

namespace FSH.Modules.Inventory.Features.v1.Medicines.BulkCreateMedicines;

public sealed class BulkCreateMedicinesCommandValidator : AbstractValidator<BulkCreateMedicinesCommand>
{
    public BulkCreateMedicinesCommandValidator()
    {
        RuleFor(x => x.Rows).NotEmpty().WithMessage("At least one medicine row is required.");

        RuleForEach(x => x.Rows).ChildRules(row =>
        {
            row.RuleFor(r => r.Name).NotEmpty().MaximumLength(256);
            row.RuleFor(r => r.GenericName).MaximumLength(256);
            row.RuleFor(r => r.Form).MaximumLength(64);
            row.RuleFor(r => r.Strength).MaximumLength(64);
            row.RuleFor(r => r.ReorderLevel).GreaterThanOrEqualTo(0m);
            row.RuleFor(r => r.Quantity).GreaterThanOrEqualTo(0m);
            row.RuleFor(r => r.UnitPrice).GreaterThanOrEqualTo(0m);
            row.RuleFor(r => r.CostPrice).GreaterThanOrEqualTo(0m);
            row.RuleFor(r => r.SellingPrice).GreaterThanOrEqualTo(0m);
            row.RuleFor(r => r.MaximumStock).GreaterThanOrEqualTo(0m).When(r => r.MaximumStock.HasValue);
            row.RuleFor(r => r.MaximumStock)
                .Must((r, max) => max is not > 0m || max >= r.ReorderLevel)
                .WithMessage(Medicine.MaximumBelowReorderMessage);
            row.RuleFor(r => r.BatchNo).MaximumLength(64);
            row.RuleFor(r => r.RackLocation).MaximumLength(64);
            row.RuleFor(r => r.SupplierInvoiceNumber).MaximumLength(120);
            row.RuleFor(r => r.VatAmount).GreaterThanOrEqualTo(0m);

            // The medicine card fields, with CreateMedicineCommandValidator's limits.
            row.RuleFor(r => r.BrandName).MaximumLength(200);
            row.RuleFor(r => r.Description).MaximumLength(2000);
            row.RuleFor(r => r.Dosage).MaximumLength(200);
            row.RuleFor(r => r.Barcode).MaximumLength(64);
            row.RuleFor(r => r.UnitsPerPack).GreaterThanOrEqualTo(1).When(r => r.UnitsPerPack is not null);
            row.RuleFor(r => r.UnitLabel).MaximumLength(50);
            row.RuleFor(r => r.PacksPerBox).GreaterThanOrEqualTo(2).When(r => r.PacksPerBox is not null)
                .WithMessage("A box holds at least 2 packs.");
            row.RuleFor(r => r.PacksPerBox).Null().When(r => r.UnitsPerPack is null)
                .WithMessage("Set the units per pack before the packs per box.");
            row.RuleFor(r => r.BoxLabel).MaximumLength(50);
            row.RuleFor(r => r.StorageTempMinC).InclusiveBetween(-50m, 50m).When(r => r.StorageTempMinC is not null);
            row.RuleFor(r => r.StorageTempMaxC).InclusiveBetween(-50m, 50m).When(r => r.StorageTempMaxC is not null);
            row.RuleFor(r => r.SideEffects).MaximumLength(2000);
            row.RuleFor(r => r.StorageInstructions).MaximumLength(2000);

            row.When(r => r.Payment is not null, () =>
            {
                row.RuleFor(r => r.SupplierId).NotEmpty().WithMessage("A paid bill needs a supplier.");
                row.RuleFor(r => r.Quantity).GreaterThan(0m).WithMessage("A paid bill needs stock.");
                row.RuleFor(r => r.Payment!.Method)
                    .Must(SupplierPaymentMethods.IsKnown)
                    .WithMessage("Choose how the supplier was paid (cash, bank, cheque, card, eSewa, Khalti or Fonepay).");
                row.RuleFor(r => r.Payment!.Reference).MaximumLength(200);
                row.RuleFor(r => r.Payment!.Amount).GreaterThan(0m).When(r => r.Payment!.Amount is not null);
            });
        });

        // One barcode belongs to one medicine: two rows can't both claim it (the database is checked in the handler).
        RuleFor(x => x.Rows).Custom((rows, context) =>
        {
            if (rows is null)
            {
                return;
            }

            var taken = rows
                .Select(r => Medicine.NormalizeBarcode(r.Barcode))
                .Where(b => b is not null)
                .GroupBy(b => b, StringComparer.Ordinal)
                .Where(g => g.Count() > 1)
                .Select(g => g.Key);
            foreach (string? barcode in taken)
            {
                context.AddFailure("Rows", $"Barcode {barcode} is on more than one row. Each barcode can belong to one medicine only.");
            }
        });

        // A bill's paid amount can't exceed that bill's total (rows sharing supplier, invoice and date).
        RuleFor(x => x.Rows).Custom((rows, context) =>
        {
            if (rows is null)
            {
                return;
            }

            var bills = rows
                .Select((row, index) => (Row: row, Index: index))
                .Where(r => r.Row.SupplierId is not null && r.Row.Quantity > 0)
                .GroupBy(r => (
                    r.Row.SupplierId,
                    string.IsNullOrWhiteSpace(r.Row.SupplierInvoiceNumber) ? $"#{r.Index}" : r.Row.SupplierInvoiceNumber.Trim(),
                    r.Row.ReceiptDate));
            foreach (var bill in bills)
            {
                decimal? paid = bill.Select(r => r.Row.Payment).FirstOrDefault(p => p is not null)?.Amount;
                decimal gross = bill.Sum(r => (r.Row.Quantity * r.Row.CostPrice) + r.Row.VatAmount);
                if (paid is { } amount && amount > gross)
                {
                    context.AddFailure(
                        "Rows",
                        $"Bill {bill.Key.Item2.TrimStart('#')}: the amount paid ({amount:0.00}) is more than the bill total ({gross:0.00}).");
                }
            }
        });
    }
}
