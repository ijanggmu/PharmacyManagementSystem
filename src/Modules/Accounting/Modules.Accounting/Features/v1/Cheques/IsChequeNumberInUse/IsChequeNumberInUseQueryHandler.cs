using FluentValidation;
using FSH.Modules.Accounting.Contracts.v1.Cheques;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.Cheques.IsChequeNumberInUse;

/// <summary>A live (not bounced, not cancelled) register entry with the same party and cheque number.</summary>
public sealed class IsChequeNumberInUseQueryHandler(AccountingDbContext dbContext) : IQueryHandler<IsChequeNumberInUseQuery, bool>
{
    public async ValueTask<bool> Handle(IsChequeNumberInUseQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        string number = query.ChequeNumber.Trim();
        return await dbContext.Cheques
            .AsNoTracking()
            .AnyAsync(
                c => c.PaymentReferenceType == query.PaymentReferenceType
                    && c.PartyId == query.PartyId
                    && c.ChequeNumber == number
                    && c.Status != ChequeStatus.Bounced
                    && c.Status != ChequeStatus.Cancelled,
                cancellationToken)
            .ConfigureAwait(false);
    }
}

public sealed class IsChequeNumberInUseQueryValidator : AbstractValidator<IsChequeNumberInUseQuery>
{
    public IsChequeNumberInUseQueryValidator()
    {
        RuleFor(x => x.PartyId).NotEmpty();
        RuleFor(x => x.ChequeNumber).NotEmpty().MaximumLength(Cheque.ChequeNumberMaxLength);
        RuleFor(x => x.PaymentReferenceType)
            .Must(t => t is ChequePaymentReferenceTypes.CustomerPayment or ChequePaymentReferenceTypes.SupplierPayment)
            .WithMessage("Unknown payment reference type.");
    }
}
