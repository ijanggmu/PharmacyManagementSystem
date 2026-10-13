using FluentValidation;
using FSH.Modules.Accounting.Contracts.v1.Cheques;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.Cheques.GetChequeStatusForPayment;

/// <summary>Looks up the register entry of the cheque that settled a payment, for the Customers / Suppliers void paths.</summary>
public sealed class GetChequeStatusForPaymentQueryHandler(AccountingDbContext dbContext)
    : IQueryHandler<GetChequeStatusForPaymentQuery, PaymentChequeStatusDto?>
{
    public async ValueTask<PaymentChequeStatusDto?> Handle(GetChequeStatusForPaymentQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var row = await dbContext.Cheques
            .AsNoTracking()
            .Where(c => c.PaymentReferenceType == query.PaymentReferenceType && c.PaymentReferenceId == query.PaymentId)
            .Select(c => new { c.Id, c.ChequeNumber, c.Status })
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false);

        return row is null
            ? null
            : new PaymentChequeStatusDto(row.Id, row.ChequeNumber, Cheque.ToWire(row.Status), row.Status == ChequeStatus.Cleared);
    }
}

public sealed class GetChequeStatusForPaymentQueryValidator : AbstractValidator<GetChequeStatusForPaymentQuery>
{
    public GetChequeStatusForPaymentQueryValidator()
    {
        RuleFor(x => x.PaymentId).NotEmpty();
        RuleFor(x => x.PaymentReferenceType)
            .Must(t => t is ChequePaymentReferenceTypes.CustomerPayment or ChequePaymentReferenceTypes.SupplierPayment)
            .WithMessage("Unknown payment reference type.");
    }
}
