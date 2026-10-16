using System.Net;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Customers.Contracts.v1.Customers;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Prescriptions.Contracts.v1.Prescriptions;
using FSH.Modules.Prescriptions.Domain;
using Mediator;

namespace FSH.Modules.Prescriptions.Services;

/// <summary>
/// The checks a new prescription needs beyond its validator's shape rules: ones that depend on today's Nepal
/// date or on another module's data (through the Customers / Inventory contract queries only).
/// <list type="bullet">
/// <item>the customer exists and is active;</item>
/// <item>every medicine exists;</item>
/// <item>the issue date is not in the future and the prescription is not already expired;</item>
/// <item>the validity is within <see cref="PrescriptionRules.LatestExpiryFor"/> (shorter with a controlled medicine);</item>
/// <item>controlled medicines allow no refills (<see cref="PrescriptionRules.MaxControlledRefills"/>);</item>
/// <item>a prescription with a controlled medicine names the doctor's registration number.</item>
/// </list>
/// Throws one 400 listing every problem (409 for an inactive customer alone).
/// </summary>
public sealed class PrescriptionIssueChecks(IMediator mediator, TimeProvider timeProvider)
{
    public async ValueTask EnsureValidAsync(CreatePrescriptionCommand command, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(command);

        var errors = new List<string>();
        bool customerInactive = false;

        try
        {
            var customer = await mediator.Send(new GetCustomerByIdQuery(command.CustomerId), cancellationToken).ConfigureAwait(false);
            if (!customer.IsActive)
            {
                customerInactive = true;
                errors.Add($"Customer {customer.Name} is inactive. Reactivate them before recording a prescription.");
            }
        }
        catch (NotFoundException)
        {
            errors.Add($"Customer {command.CustomerId} not found.");
        }

        bool hasControlled = false;
        foreach (var item in command.Items)
        {
            try
            {
                var medicine = await mediator.Send(new GetMedicineByIdQuery(item.MedicineId), cancellationToken).ConfigureAwait(false);
                if (medicine.IsControlled)
                {
                    hasControlled = true;
                    if (item.RefillsAllowed > PrescriptionRules.MaxControlledRefills)
                    {
                        errors.Add($"{medicine.Name} is a controlled medicine: a prescription for it cannot allow refills.");
                    }
                }
            }
            catch (NotFoundException)
            {
                errors.Add($"Medicine {item.MedicineId} not found.");
            }
        }

        var today = NepalClock.Today(timeProvider);
        if (command.PrescriptionDate > today)
        {
            errors.Add($"Prescription date {command.PrescriptionDate:yyyy-MM-dd} is in the future (today is {today:yyyy-MM-dd}).");
        }

        if (command.ExpiryDate < today)
        {
            errors.Add($"The prescription expired on {command.ExpiryDate:yyyy-MM-dd}; it cannot be recorded as valid.");
        }

        // The DDA narcotic register records the prescriber's registration number for every controlled dispense.
        if (hasControlled && string.IsNullOrWhiteSpace(command.DoctorLicenseNumber))
        {
            errors.Add(PrescriptionRules.ControlledNeedsLicenseMessage);
        }

        var latest = PrescriptionRules.LatestExpiryFor(command.PrescriptionDate, hasControlled);
        if (command.ExpiryDate > latest)
        {
            int months = hasControlled ? PrescriptionRules.MaxControlledValidityMonths : PrescriptionRules.MaxValidityMonths;
            errors.Add(
                $"A prescription{(hasControlled ? " with a controlled medicine" : string.Empty)} is valid for at most " +
                $"{months} months: expiry cannot be later than {latest:yyyy-MM-dd}.");
        }

        if (errors.Count == 0)
        {
            return;
        }

        var status = customerInactive && errors.Count == 1 ? HttpStatusCode.Conflict : HttpStatusCode.BadRequest;
        throw new CustomException(string.Join(" ", errors), errors, status);
    }
}
