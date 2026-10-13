using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Accounting.Domain;
using FSH.Modules.Customers.Contracts.Authorization;
using FSH.Modules.Customers.Contracts.v1.Ledger;
using FSH.Modules.Identity.Contracts.Services;
using FSH.Modules.Suppliers.Contracts.Authorization;
using FSH.Modules.Suppliers.Contracts.v1.Ledger;
using Mediator;

namespace FSH.Modules.Accounting.Features.v1.Cheques.BounceCheque;

/// <summary>
/// Voids the payment a bounced or cancelled cheque settled, through the owning module's own void command (Customers /
/// Suppliers, via their Contracts): its ledger gets the reversing entry — the customer owes the amount again, the
/// supplier is owed it again (the bill re-opens) — and the payment-voided event makes Accounting reverse the payment
/// voucher (Dr AR / Cr Cheques in Hand, or Dr Cheques Issued / Cr AP). That keeps the AR/AP subledger and the GL
/// reconciled with one path instead of a second, register-only adjustment.
/// <para>The caller also needs that module's void-payment permission: the register can't be a way around it.</para>
/// </summary>
internal static class ChequePaymentVoider
{
    /// <summary>The void reason is capped at 500 characters by the void commands.</summary>
    private const int ReasonMax = 500;

    public static async Task VoidAsync(
        Cheque cheque,
        string what,
        string reason,
        IMediator mediator,
        ICurrentUser currentUser,
        IUserPermissionService permissions,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(cheque);
        ArgumentNullException.ThrowIfNull(mediator);
        ArgumentNullException.ThrowIfNull(currentUser);
        ArgumentNullException.ThrowIfNull(permissions);

        bool received = cheque.Direction == ChequeDirection.Received;
        string permission = received ? CustomersPermissions.Ledger.VoidPayment : SuppliersPermissions.Ledger.VoidPayment;
        bool allowed = await permissions
            .HasPermissionAsync(currentUser.GetUserId().ToString(), permission, cancellationToken)
            .ConfigureAwait(false);
        if (!allowed)
        {
            throw new ForbiddenException(received
                ? "Marking a customer's cheque bounced or cancelled voids their payment, which needs permission to void customer payments."
                : "Marking a supplier's cheque bounced or cancelled voids the payment, which needs permission to void supplier payments.");
        }

        string full = $"Cheque {cheque.ChequeNumber} {what}: {reason.Trim()}";
        string voidReason = full.Length <= ReasonMax ? full : full[..ReasonMax];

        // The party's void path refuses a payment whose cheque has cleared (the clearance moved the amount out of the
        // holding account). Only the register's own bounce of a cleared cheque lifts that guard — it reverses the
        // clearance itself (BounceChequeCommandHandler).
        bool clearedBounce = cheque.Status == ChequeStatus.Cleared;
        if (received)
        {
            await mediator.Send(
                    new VoidCustomerPaymentCommand(cheque.PartyId, cheque.PaymentReferenceId, voidReason) { BouncedFromChequeRegister = clearedBounce },
                    cancellationToken)
                .ConfigureAwait(false);
        }
        else
        {
            await mediator.Send(
                    new VoidSupplierPaymentCommand(cheque.PartyId, cheque.PaymentReferenceId, voidReason) { BouncedFromChequeRegister = clearedBounce },
                    cancellationToken)
                .ConfigureAwait(false);
        }
    }
}
