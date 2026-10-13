using System.Net;
using FluentValidation;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Shared.Persistence;
using FSH.Modules.Customers.Contracts.v1.Sms;
using FSH.Modules.Notifications.Contracts.v1.Sms;
using FSH.Modules.Notifications.Data;
using FSH.Modules.Notifications.Domain;
using FSH.Modules.Notifications.Sms;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Notifications.Features.v1.Sms;

/// <summary>
/// Manual "Send reminder" (receivables / customer sheet): one SMS stating everything the customer owes, the earliest due
/// date and the invoice numbers. Staff-initiated, so it does not need the customer's SMS consent; it does respect quiet
/// hours (it is sent when they end). A second reminder to the same customer within an hour is refused (double click).
/// Its invoices count as reminded for the automatic reminders' N-day window.
/// </summary>
public sealed class SendDuesReminderCommandHandler(
    NotificationsDbContext db,
    SmsComposer composer,
    SmsDispatchTrigger trigger,
    IMediator mediator,
    ICurrentUser currentUser,
    TimeProvider timeProvider)
    : ICommandHandler<SendDuesReminderCommand, SmsMessageDto>
{
    public async ValueTask<SmsMessageDto> Handle(SendDuesReminderCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);
        var settings = await composer.GetSettingsAsync(cancellationToken).ConfigureAwait(false);
        string? blocked = Jobs.ProcessSmsQueueJob.BlockReason(settings, SmsKinds.DuesReminder);
        if (blocked is not null)
        {
            throw Conflict(blocked);
        }

        DateTime now = timeProvider.GetUtcNow().UtcDateTime;
        var dues = await mediator.Send(new GetCustomerSmsDuesQuery(now, command.CustomerId), cancellationToken).ConfigureAwait(false);
        var customer = dues.FirstOrDefault(d => d.Contact.CustomerId == command.CustomerId)
            ?? throw Conflict("This customer owes nothing on account, so there is nothing to remind them of.");

        string phone = SmsPhone.Normalize(customer.Contact.Phone)
            ?? throw Conflict("This customer has no valid mobile number. Add a 10-digit number starting with 98, 97 or 96.");

        var recent = await composer.RecentAsync(command.CustomerId, SmsKinds.DuesReminder, now - SmsDedupe.ManualRepeatGuard, cancellationToken)
            .ConfigureAwait(false);
        if (SmsDedupe.IsManualRepeat(recent, now))
        {
            throw Conflict("A dues reminder was already sent to this customer in the last hour.");
        }

        var message = await composer.QueueAsync(
            settings!, SmsKinds.DuesReminder, SmsTrigger.Manual, command.CustomerId, customer.Contact.Name, phone,
            SmsMessageValues.Dues(customer.Contact.Name, customer.Invoices, settings!.DefaultLanguage),
            SmsDedupe.Join(customer.Invoices.Select(i => SmsDedupe.InvoiceKey(i.LedgerEntryId))),
            RequestedBy(currentUser), now, cancellationToken).ConfigureAwait(false);
        await db.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        trigger.Trigger();
        return SmsMessageMapper.ToDto(message);
    }

    internal static CustomException Conflict(string message) =>
        new(message, (IEnumerable<string>?)null, HttpStatusCode.Conflict);

    internal static string? RequestedBy(ICurrentUser currentUser) =>
        currentUser.IsAuthenticated() ? currentUser.GetUserId().ToString() : null;
}

public sealed class SendDuesReminderCommandValidator : AbstractValidator<SendDuesReminderCommand>
{
    public SendDuesReminderCommandValidator()
    {
        RuleFor(x => x.CustomerId).NotEmpty();
    }
}

/// <summary>Queues a test SMS with the saved settings, so the pharmacy can check its gateway before turning SMS on.</summary>
public sealed class SendTestSmsCommandHandler(
    NotificationsDbContext db,
    SmsComposer composer,
    SmsDispatchTrigger trigger,
    ICurrentUser currentUser,
    TimeProvider timeProvider)
    : ICommandHandler<SendTestSmsCommand, SmsMessageDto>
{
    public async ValueTask<SmsMessageDto> Handle(SendTestSmsCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);
        var settings = await composer.GetSettingsAsync(cancellationToken).ConfigureAwait(false);
        string? blocked = Jobs.ProcessSmsQueueJob.BlockReason(settings, SmsKinds.Test);
        if (blocked is not null)
        {
            throw SendDuesReminderCommandHandler.Conflict(blocked + " Save the settings first.");
        }

        string phone = SmsPhone.Normalize(command.Phone)
            ?? throw SendDuesReminderCommandHandler.Conflict("Enter a 10-digit Nepali mobile number (98…, 97… or 96…).");

        DateTime now = timeProvider.GetUtcNow().UtcDateTime;
        var message = await composer.QueueAsync(
            settings!, SmsKinds.Test, SmsTrigger.Manual, null, null, phone, new SmsTemplateValues(), null,
            SendDuesReminderCommandHandler.RequestedBy(currentUser), now, cancellationToken).ConfigureAwait(false);
        await db.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        trigger.Trigger();
        return SmsMessageMapper.ToDto(message);
    }
}

public sealed class SendTestSmsCommandValidator : AbstractValidator<SendTestSmsCommand>
{
    public SendTestSmsCommandValidator()
    {
        RuleFor(x => x.Phone).NotEmpty().MaximumLength(20);
    }
}

public sealed class RetrySmsMessageCommandHandler(
    NotificationsDbContext db,
    SmsDispatchTrigger trigger,
    TimeProvider timeProvider)
    : ICommandHandler<RetrySmsMessageCommand, SmsMessageDto>
{
    public async ValueTask<SmsMessageDto> Handle(RetrySmsMessageCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);
        var message = await db.SmsMessages.FirstOrDefaultAsync(m => m.Id == command.Id, cancellationToken).ConfigureAwait(false)
            ?? throw new NotFoundException($"SMS {command.Id} was not found.");
        message.Retry(timeProvider.GetUtcNow().UtcDateTime);
        await db.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        trigger.Trigger();
        return SmsMessageMapper.ToDto(message);
    }
}

public sealed class RetrySmsMessageCommandValidator : AbstractValidator<RetrySmsMessageCommand>
{
    public RetrySmsMessageCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
    }
}

public sealed class SearchSmsMessagesQueryHandler(NotificationsDbContext db)
    : IQueryHandler<SearchSmsMessagesQuery, PagedResponse<SmsMessageDto>>
{
    public async ValueTask<PagedResponse<SmsMessageDto>> Handle(SearchSmsMessagesQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);
        var messages = db.SmsMessages.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(query.Status) && Enum.TryParse<SmsStatus>(query.Status, ignoreCase: true, out var status))
        {
            messages = messages.Where(m => m.Status == status);
        }

        if (!string.IsNullOrWhiteSpace(query.Kind))
        {
            messages = messages.Where(m => m.Kind == query.Kind);
        }

        if (query.CustomerId is { } customerId)
        {
            messages = messages.Where(m => m.CustomerId == customerId);
        }

        int total = await messages.CountAsync(cancellationToken).ConfigureAwait(false);
        var page = await messages
            .OrderByDescending(m => m.CreatedAtUtc)
            .Skip((query.PageNumber - 1) * query.PageSize)
            .Take(query.PageSize)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return new PagedResponse<SmsMessageDto>
        {
            Items = page.Select(SmsMessageMapper.ToDto).ToList(),
            PageNumber = query.PageNumber,
            PageSize = query.PageSize,
            TotalCount = total,
            TotalPages = (int)Math.Ceiling(total / (double)query.PageSize),
        };
    }
}

public sealed class SearchSmsMessagesQueryValidator : AbstractValidator<SearchSmsMessagesQuery>
{
    public SearchSmsMessagesQueryValidator()
    {
        RuleFor(x => x.PageNumber).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 100);
        RuleFor(x => x.Status)
            .Must(s => Enum.TryParse<SmsStatus>(s, ignoreCase: true, out _))
            .When(x => !string.IsNullOrWhiteSpace(x.Status))
            .WithMessage("Unknown status.");
        RuleFor(x => x.Kind)
            .Must(k => k is SmsKinds.DuesReminder or SmsKinds.RefillReminder or SmsKinds.Receipt or SmsKinds.Test)
            .When(x => !string.IsNullOrWhiteSpace(x.Kind))
            .WithMessage("Unknown SMS kind.");
    }
}

internal static class SmsMessageMapper
{
    public static SmsMessageDto ToDto(SmsMessage m) => new(
        m.Id,
        m.Kind,
        m.Status.ToString(),
        m.Trigger.ToString(),
        m.CustomerId,
        m.RecipientName,
        SmsPhone.Mask(m.Phone),
        m.Body,
        m.Language,
        m.Segments,
        m.Encoding,
        m.Provider,
        m.Attempts,
        m.LastError,
        m.ResponseCode,
        m.ResponseMessage,
        m.ProviderMessageId,
        m.Credits,
        m.RequestedBy,
        m.CreatedAtUtc,
        m.SentAtUtc,
        m.NextAttemptAtUtc);
}
