namespace FSH.Modules.Accounting.Services;

/// <summary>Reserves the next voucher number in a series (<see cref="Domain.VoucherSeries"/>) for the current
/// tenant. Implemented by <see cref="AccountingVoucherSequenceService"/>; an interface so handlers that post
/// several vouchers in one transaction can be unit-tested without the raw-SQL sequence rows.</summary>
public interface IAccountingVoucherNumbers
{
    Task<int> ReserveNextNumberAsync(string series, CancellationToken cancellationToken = default);
}
