namespace FSH.Modules.Accounting.Services;

/// <summary>Reserves the next voucher number for the current tenant. Implemented by
/// <see cref="AccountingVoucherSequenceService"/>; an interface so handlers that post several vouchers
/// in one transaction can be unit-tested without the raw-SQL sequence row.</summary>
public interface IAccountingVoucherNumbers
{
    Task<int> ReserveNextNumberAsync(CancellationToken cancellationToken = default);
}
