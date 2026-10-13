using FluentValidation;
using FSH.Modules.Customers.Contracts.v1.Sms;
using FSH.Modules.Customers.Data;
using FSH.Modules.Customers.Domain;
using FSH.Modules.Customers.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Customers.Features.v1.Sms;

public sealed class GetCustomerSmsContactsQueryHandler(CustomersDbContext dbContext)
    : IQueryHandler<GetCustomerSmsContactsQuery, IReadOnlyList<CustomerSmsContactDto>>
{
    public async ValueTask<IReadOnlyList<CustomerSmsContactDto>> Handle(GetCustomerSmsContactsQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);
        var ids = query.CustomerIds.Distinct().ToList();
        if (ids.Count == 0)
        {
            return [];
        }

        return await dbContext.Customers
            .AsNoTracking()
            .Where(c => ids.Contains(c.Id))
            .Select(c => new CustomerSmsContactDto(c.Id, c.Name, c.Phone, c.SmsConsent, c.IsActive))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
    }
}

public sealed class GetCustomerSmsContactsQueryValidator : AbstractValidator<GetCustomerSmsContactsQuery>
{
    public GetCustomerSmsContactsQueryValidator()
    {
        RuleFor(x => x.CustomerIds).NotNull();
        RuleFor(x => x.CustomerIds.Count).LessThanOrEqualTo(1000).When(x => x.CustomerIds is not null);
    }
}

/// <summary>
/// Open debts for SMS dues reminders. Settlement is the AR aging's (<see cref="CustomerDebtSettlement"/>, FIFO over the
/// customer's whole account) and the due date the receivables-due report's (<see cref="PaymentTerms"/>), so the amount
/// in the SMS agrees with what staff see. Trashed customers are left out (the soft-delete filter applies).
/// </summary>
public sealed class GetCustomerSmsDuesQueryHandler(CustomersDbContext dbContext)
    : IQueryHandler<GetCustomerSmsDuesQuery, IReadOnlyList<CustomerSmsDuesDto>>
{
    public async ValueTask<IReadOnlyList<CustomerSmsDuesDto>> Handle(GetCustomerSmsDuesQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        var rows = await CustomerDebtSettlement.LoadRowsAsync(dbContext, query.AsOfUtc, null, query.CustomerId, cancellationToken)
            .ConfigureAwait(false);
        if (rows.Count == 0)
        {
            return [];
        }

        var customerIds = rows.Select(r => r.CustomerId).Distinct().ToList();
        var customers = await dbContext.Customers
            .AsNoTracking()
            .Where(c => customerIds.Contains(c.Id))
            .Select(c => new { c.Id, c.Name, c.Phone, c.SmsConsent, c.IsActive, c.CreditDays })
            .ToDictionaryAsync(c => c.Id, cancellationToken)
            .ConfigureAwait(false);

        var result = new List<CustomerSmsDuesDto>();
        foreach (var group in rows.GroupBy(r => r.CustomerId))
        {
            if (!customers.TryGetValue(group.Key, out var customer))
            {
                continue;
            }

            var invoices = CustomerDebtSettlement.OpenDebits(group)
                .Select(open => ToInvoice(open.Row, open.Remaining, customer.CreditDays, query.AsOfUtc))
                .Where(i => i.Outstanding > 0m)
                .Where(i => query.CustomerId is not null || IsOverdueBy(i, query.MinDaysOverdue))
                .OrderBy(i => i.DueDateUtc ?? i.EntryDateUtc)
                .ToList();
            if (invoices.Count == 0)
            {
                continue;
            }

            result.Add(new CustomerSmsDuesDto(
                new CustomerSmsContactDto(customer.Id, customer.Name, customer.Phone, customer.SmsConsent, customer.IsActive),
                invoices));
        }

        return result;
    }

    internal static CustomerSmsDueInvoiceDto ToInvoice(CustomerArRow row, decimal remaining, int? creditDays, DateTime asOfUtc)
    {
        DateTime? due = PaymentTerms.EffectiveDueDate(row.DueDateUtc, row.EntryDateUtc, creditDays);
        return new CustomerSmsDueInvoiceDto(
            row.Id,
            row.DocumentNumber,
            remaining,
            row.EntryDateUtc,
            due,
            due is { } d ? PaymentTerms.DaysOverdue(d, asOfUtc) : null,
            Math.Max(0, (asOfUtc - row.EntryDateUtc).Days));
    }

    /// <summary>Overdue by at least <paramref name="minDays"/> days (at least 1); a debt without a due date counts its age.</summary>
    public static bool IsOverdueBy(CustomerSmsDueInvoiceDto invoice, int minDays)
    {
        ArgumentNullException.ThrowIfNull(invoice);
        int threshold = Math.Max(1, minDays);
        return (invoice.DaysOverdue ?? invoice.AgeDays) >= threshold;
    }
}

public sealed class GetCustomerSmsDuesQueryValidator : AbstractValidator<GetCustomerSmsDuesQuery>
{
    public GetCustomerSmsDuesQueryValidator()
    {
        RuleFor(x => x.MinDaysOverdue).InclusiveBetween(0, 3650);
    }
}
