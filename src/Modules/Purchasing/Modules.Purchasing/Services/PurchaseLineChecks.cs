using System.Globalization;
using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Inventory.Contracts.Dtos;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Reference.Contracts.v1.Settings;
using Mediator;

namespace FSH.Modules.Purchasing.Services;

/// <summary>One purchase line as the VAT check sees it: its medicine, taxable value (after every discount) and VAT.</summary>
internal readonly record struct PurchaseVatLine(Guid MedicineId, decimal NetAmount, decimal VatAmount);

/// <summary>
/// Checks shared by purchase orders (create and receive) and direct goods receipts.
/// <list type="bullet">
/// <item>Every line's medicine must exist and not be archived (Inventory answers 404 for both): an order for a
/// medicine that isn't there can't be received, and an archived one is no longer stocked.</item>
/// <item>Input VAT must match the medicine: a VAT-exempt medicine's line carries no VAT, and on a VAT bill a taxable
/// line's VAT is the pharmacy's VAT rate on the line's taxable value, give or take <see cref="VatTolerance"/> for the
/// supplier's rounding. A bill with no VAT on any line is a non-VAT bill (a supplier not registered for VAT) and is
/// accepted as it is.</item>
/// </list>
/// </summary>
internal static class PurchaseLineChecks
{
    /// <summary>How far a line's VAT may be from the rate on its taxable value (supplier rounding).</summary>
    public const decimal VatTolerance = 1.00m;

    /// <summary>The medicines of <paramref name="medicineIds"/>, by id. Throws 404 naming the first missing or archived one.</summary>
    public static async Task<Dictionary<Guid, MedicineDto>> LoadMedicinesAsync(
        IMediator mediator, IEnumerable<Guid> medicineIds, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(mediator);
        ArgumentNullException.ThrowIfNull(medicineIds);

        var medicines = new Dictionary<Guid, MedicineDto>();
        foreach (Guid medicineId in medicineIds.Distinct())
        {
            try
            {
                medicines[medicineId] = await mediator.Send(new GetMedicineByIdQuery(medicineId), cancellationToken).ConfigureAwait(false);
            }
            catch (NotFoundException)
            {
                throw new NotFoundException(
                    $"Medicine {medicineId} was not found or has been archived, so it can't be ordered or received. Restore it or remove the line.");
            }
        }

        return medicines;
    }

    /// <summary>The pharmacy's VAT rate in percent (Settings → Pharmacy), read only when some line carries VAT.</summary>
    public static async Task<decimal> VatRatePercentAsync(
        IMediator mediator, IReadOnlyCollection<PurchaseVatLine> lines, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(mediator);
        ArgumentNullException.ThrowIfNull(lines);
        if (!lines.Any(l => l.VatAmount > 0m))
        {
            return 0m;
        }

        var settings = await mediator.Send(new GetPharmacySettingsQuery(), cancellationToken).ConfigureAwait(false);
        return settings.VatRatePercent;
    }

    /// <summary>Throws 400 listing every line whose VAT doesn't fit its medicine (see the class remarks).</summary>
    public static void EnsureVatMatches(
        IReadOnlyCollection<PurchaseVatLine> lines, IReadOnlyDictionary<Guid, MedicineDto> medicines, decimal vatRatePercent)
    {
        ArgumentNullException.ThrowIfNull(lines);
        ArgumentNullException.ThrowIfNull(medicines);

        bool vatBill = lines.Any(l => l.VatAmount > 0m);
        var problems = new List<string>();
        foreach (var line in lines)
        {
            medicines.TryGetValue(line.MedicineId, out var medicine);
            string name = medicine?.Name ?? line.MedicineId.ToString();
            bool taxable = medicine?.IsTaxable ?? true;

            if (!taxable && line.VatAmount != 0m)
            {
                problems.Add(string.Format(
                    CultureInfo.InvariantCulture,
                    "{0} is VAT-exempt, so its line can't carry VAT (entered {1:0.00}).", name, line.VatAmount));
                continue;
            }

            if (!taxable || !vatBill)
            {
                continue;
            }

            decimal expected = Math.Round(line.NetAmount * vatRatePercent / 100m, 2, MidpointRounding.AwayFromZero);
            if (Math.Abs(line.VatAmount - expected) > VatTolerance)
            {
                problems.Add(string.Format(
                    CultureInfo.InvariantCulture,
                    "{0}: VAT {1:0.00} doesn't match {2:0.##}% of the taxable value {3:0.00} (expected {4:0.00}).",
                    name, line.VatAmount, vatRatePercent, line.NetAmount, expected));
            }
        }

        if (problems.Count > 0)
        {
            throw new CustomException(
                "The VAT on this bill doesn't match the medicines' VAT status. Correct the VAT amounts.",
                problems, HttpStatusCode.BadRequest);
        }
    }
}
