using System.Net;
using FSH.Framework.Core.Domain;
using FSH.Framework.Core.Exceptions;

namespace FSH.Modules.Sales.Domain;

/// <summary>
/// One tender leg of a sale (cash, card, credit, ...). Reached only through <see cref="Sale.Payments"/>,
/// so its EF config needs <c>ValueGeneratedNever()</c> (database.md nav-child footgun).
/// </summary>
public sealed class SalePayment : BaseEntity<Guid>
{
    public Guid SaleId { get; private set; }

    /// <summary>Mirrors the owning <see cref="Sale.BranchId"/>.</summary>
    public Guid BranchId { get; private set; }

    public string Method { get; private set; } = default!;
    public decimal Amount { get; private set; }
    public string? Reference { get; private set; }

    private SalePayment() { }

    internal static SalePayment Create(string method, decimal amount, string? reference)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(method);

        if (amount <= 0)
        {
            throw new CustomException("Payment amount must be positive.", (IEnumerable<string>?)null, HttpStatusCode.BadRequest);
        }

        return new SalePayment
        {
            Id = Guid.CreateVersion7(),
            Method = method.Trim(),
            Amount = amount,
            Reference = string.IsNullOrWhiteSpace(reference) ? null : reference.Trim(),
        };
    }

    internal void AssignSale(Guid saleId, Guid branchId)
    {
        SaleId = saleId;
        BranchId = branchId;
    }
}
