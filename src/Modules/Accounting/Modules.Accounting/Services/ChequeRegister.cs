using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Services;

/// <summary>
/// Entering cheques into the register from the payment-recorded event handlers, and reading them back as DTOs.
/// </summary>
internal static class ChequeRegister
{
    /// <summary>True when a payment goes into the register: paid by cheque, with the cheque's number. A cheque payment
    /// without a number (older clients, events queued before the register) keeps posting straight to the bank.</summary>
    public static bool IsRegistered(string? paymentMethod, string? chequeNumber) =>
        string.Equals(PaymentMethodAccounts.Normalize(paymentMethod), PaymentMethodAccounts.Cheque, StringComparison.Ordinal)
        && !string.IsNullOrWhiteSpace(chequeNumber);

    /// <summary>
    /// Adds <paramref name="cheque"/> (not saved — it commits with the payment's voucher) unless the payment already
    /// has a register entry (a redelivered event). A payment voided before its own event was processed (a pending
    /// reversal is waiting for it) enters the register already cancelled.
    /// </summary>
    public static async Task AddOnceAsync(AccountingDbContext dbContext, Cheque cheque, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(dbContext);
        ArgumentNullException.ThrowIfNull(cheque);

        bool exists = await dbContext.Cheques
            .AnyAsync(c => c.PaymentReferenceType == cheque.PaymentReferenceType && c.PaymentReferenceId == cheque.PaymentReferenceId, cancellationToken)
            .ConfigureAwait(false);
        if (exists)
        {
            return;
        }

        bool voidedFirst = await dbContext.PendingReversals
            .AnyAsync(r => r.ReferenceType == cheque.PaymentReferenceType && r.ReferenceId == cheque.PaymentReferenceId, cancellationToken)
            .ConfigureAwait(false);
        if (voidedFirst)
        {
            cheque.CancelForVoidedPayment(cheque.PaymentDateUtc, "voided before it was posted");
        }

        dbContext.Cheques.Add(cheque);
    }

    public static ChequeDto ToDto(Cheque c, bool withHistory) => new(
        c.Id,
        Cheque.ToWire(c.Direction),
        Cheque.ToWire(c.Status),
        c.PartyId,
        c.PartyName,
        c.BankName,
        c.ChequeNumber,
        c.ChequeDateUtc,
        c.Amount,
        c.PaymentReferenceType,
        c.PaymentReferenceId,
        c.PaymentDateUtc,
        c.PostedToBank,
        c.BankAccountId,
        c.DepositedDateUtc,
        c.ClearedDateUtc,
        c.BranchId,
        c.Notes,
        c.CreatedAtUtc,
        withHistory
            ? c.History
                .OrderBy(h => h.ChangedAtUtc)
                .ThenBy(h => h.Id)
                .Select(h => new ChequeStatusChangeDto(
                    h.Id,
                    h.FromStatus is { } from ? Cheque.ToWire(from) : null,
                    Cheque.ToWire(h.ToStatus),
                    h.EffectiveDateUtc,
                    h.ChangedAtUtc,
                    h.ChangedBy,
                    h.Note,
                    h.VoucherId))
                .ToList()
            : null);
}
