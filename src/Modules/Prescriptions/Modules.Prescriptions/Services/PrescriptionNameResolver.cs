using FSH.Framework.Core.Exceptions;
using FSH.Modules.Customers.Contracts.v1.Customers;
using FSH.Modules.Inventory.Contracts.v1.Medicines;
using FSH.Modules.Prescriptions.Domain;
using Mediator;

namespace FSH.Modules.Prescriptions.Services;

/// <summary>
/// Resolves customer and medicine display names for prescription DTOs through the Customers and Inventory
/// contract queries (never their runtime projects). A lookup that finds nothing leaves the name out of the map.
/// </summary>
public sealed class PrescriptionNameResolver(IMediator mediator)
{
    public async ValueTask<PrescriptionNames> ResolveAsync(IEnumerable<Prescription> prescriptions, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(prescriptions);
        var list = prescriptions as IReadOnlyCollection<Prescription> ?? prescriptions.ToList();

        var customerNames = new Dictionary<Guid, string>();
        foreach (var customerId in list.Select(p => p.CustomerId).Distinct())
        {
            try
            {
                var customer = await mediator.Send(new GetCustomerByIdQuery(customerId), cancellationToken).ConfigureAwait(false);
                customerNames[customerId] = customer.Name;
            }
            catch (NotFoundException)
            {
                // Customer no longer exists; the DTO keeps a null name.
            }
        }

        var medicineNames = new Dictionary<Guid, string>();
        foreach (var medicineId in list.SelectMany(p => p.Items).Select(i => i.MedicineId).Distinct())
        {
            try
            {
                var medicine = await mediator.Send(new GetMedicineByIdQuery(medicineId), cancellationToken).ConfigureAwait(false);
                medicineNames[medicineId] = medicine.Name;
            }
            catch (NotFoundException)
            {
                // Medicine no longer exists; the item DTO keeps a null name.
            }
        }

        return new PrescriptionNames(customerNames, medicineNames);
    }
}

public sealed record PrescriptionNames(IReadOnlyDictionary<Guid, string> Customers, IReadOnlyDictionary<Guid, string> Medicines)
{
    public string? CustomerName(Guid customerId) => Customers.TryGetValue(customerId, out var name) ? name : null;

    public string? MedicineName(Guid medicineId) => Medicines.TryGetValue(medicineId, out var name) ? name : null;
}
