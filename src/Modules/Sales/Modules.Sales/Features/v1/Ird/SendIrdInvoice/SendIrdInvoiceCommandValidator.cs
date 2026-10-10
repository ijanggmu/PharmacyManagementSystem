using FluentValidation;
using FSH.Modules.Sales.Contracts.v1.Ird;

namespace FSH.Modules.Sales.Features.v1.Ird.SendIrdInvoice;

public sealed class SendIrdInvoiceCommandValidator : AbstractValidator<SendIrdInvoiceCommand>
{
    public SendIrdInvoiceCommandValidator()
    {
        RuleFor(x => x.SaleId).NotEmpty();
    }
}
