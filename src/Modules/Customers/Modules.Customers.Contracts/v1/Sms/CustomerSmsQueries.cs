using Mediator;

namespace FSH.Modules.Customers.Contracts.v1.Sms;

/// <summary>Who an SMS goes to: name, phone and whether the customer agreed to automated SMS.</summary>
public sealed record CustomerSmsContactDto(Guid CustomerId, string Name, string? Phone, bool SmsConsent, bool IsActive);

/// <summary>One open debt as an SMS reminder shows it. <see cref="DaysOverdue"/> is null when the debt has no due date
/// (no payment terms); <see cref="AgeDays"/> counts from the sale date.</summary>
public sealed record CustomerSmsDueInvoiceDto(
    Guid LedgerEntryId,
    string? DocumentNumber,
    decimal Outstanding,
    DateTime EntryDateUtc,
    DateTime? DueDateUtc,
    int? DaysOverdue,
    int AgeDays);

/// <summary>A customer's open debts for a dues reminder (every branch: the SMS states what the customer owes the
/// pharmacy, not one branch's share).</summary>
public sealed record CustomerSmsDuesDto(CustomerSmsContactDto Contact, IReadOnlyList<CustomerSmsDueInvoiceDto> Invoices);

/// <summary>
/// Server-only (no endpoint): the contacts of the given customers, for the SMS feature. Unknown ids are left out.
/// </summary>
public sealed record GetCustomerSmsContactsQuery(IReadOnlyCollection<Guid> CustomerIds) : IQuery<IReadOnlyList<CustomerSmsContactDto>>;

/// <summary>
/// Server-only (no endpoint): open debts as of <paramref name="AsOfUtc"/> for dues reminders, tenant-wide (no branch
/// scope — it runs from a background job as well as from a request). With <paramref name="CustomerId"/> it returns that
/// customer's every open debt; without it, only customers with a debt overdue by at least
/// <paramref name="MinDaysOverdue"/> days (a debt without a due date counts its age instead), listing just those debts.
/// </summary>
public sealed record GetCustomerSmsDuesQuery(DateTime AsOfUtc, Guid? CustomerId = null, int MinDaysOverdue = 0)
    : IQuery<IReadOnlyList<CustomerSmsDuesDto>>;
