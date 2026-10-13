using System.Diagnostics;
using FluentValidation;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Payroll.Contracts.Dtos;
using FSH.Modules.Payroll.Contracts.Events;
using FSH.Modules.Payroll.Contracts.v1;
using FSH.Modules.Payroll.Data;
using FSH.Modules.Payroll.Domain;
using FSH.Modules.Payroll.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace FSH.Modules.Payroll.Features.v1.Runs;

public sealed class PreviewPayrollRunQueryHandler(PayrollDbContext dbContext, IBranchService branchService, ICurrentBranch currentBranch)
    : IQueryHandler<PreviewPayrollRunQuery, PayrollPreviewDto>
{
    public async ValueTask<PayrollPreviewDto> Handle(PreviewPayrollRunQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);
        await RunBranches.EnsureUsableAsync(branchService, currentBranch, query.BranchId, cancellationToken).ConfigureAwait(false);
        var month = NepaliMonth.Of(query.BsYear, query.BsMonth);
        var computation = await PayrollRunBuilder.ComputeAsync(dbContext, query.BranchId, month, excludeRunId: null, cancellationToken)
            .ConfigureAwait(false);
        return PayrollRunBuilder.ToPreview(query.BranchId, computation);
    }
}

public sealed partial class CreatePayrollRunCommandHandler(
    PayrollDbContext dbContext,
    IBranchService branchService,
    ICurrentBranch currentBranch,
    ICurrentUser currentUser,
    TimeProvider timeProvider,
    ILogger<CreatePayrollRunCommandHandler> logger) : ICommandHandler<CreatePayrollRunCommand, PayrollRunDto>
{
    public async ValueTask<PayrollRunDto> Handle(CreatePayrollRunCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);
        await RunBranches.EnsureUsableAsync(branchService, currentBranch, command.BranchId, cancellationToken).ConfigureAwait(false);
        var month = NepaliMonth.Of(command.BsYear, command.BsMonth);

        bool exists = await dbContext.Runs
            .AnyAsync(r => r.BranchId == command.BranchId && r.BsYear == command.BsYear && r.BsMonth == command.BsMonth, cancellationToken)
            .ConfigureAwait(false);
        if (exists)
        {
            throw PayrollWrites.Conflict($"This branch already has a payroll run for {month.Label}. Open it, or delete the draft first.");
        }

        var computation = await PayrollRunBuilder.ComputeAsync(dbContext, command.BranchId, month, excludeRunId: null, cancellationToken)
            .ConfigureAwait(false);
        if (computation.Lines.Count == 0)
        {
            throw PayrollWrites.Conflict($"No employee of this branch can be paid for {month.Label}: add employees and salary structures first.");
        }

        DateTime now = timeProvider.GetUtcNow().UtcDateTime;
        var run = PayrollRun.CreateDraft(command.BranchId, month, RunActors.Name(currentUser), now);
        run.ReplaceLines(computation.Lines.Select(l => PayrollRunLine.Create(run.Id, l.Employee, l.DaysWorked, l.DaysInMonth, l.Result)), now);
        dbContext.Runs.Add(run);
        try
        {
            await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        }
        catch (DbUpdateException)
        {
            // A concurrent create for the same branch and month won the unique index.
            throw PayrollWrites.Conflict($"This branch already has a payroll run for {month.Label}.");
        }

        LogCreated(logger, run.Id, run.BranchId, run.BsYear, run.BsMonth, run.Lines.Count);
        return run.ToDto(includeLines: true);
    }

    [LoggerMessage(Level = LogLevel.Information,
        Message = "[Payroll] draft run {RunId} created for branch {BranchId}, BS {BsYear}-{BsMonth}, {EmployeeCount} employees")]
    private static partial void LogCreated(ILogger logger, Guid runId, Guid branchId, int bsYear, int bsMonth, int employeeCount);
}

public sealed class RecalculatePayrollRunCommandHandler(PayrollDbContext dbContext, ICurrentBranch currentBranch, TimeProvider timeProvider)
    : ICommandHandler<RecalculatePayrollRunCommand, PayrollRunDto>
{
    public async ValueTask<PayrollRunDto> Handle(RecalculatePayrollRunCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);
        var run = await PayrollWrites.LoadRunAsync(dbContext, command.RunId, cancellationToken).ConfigureAwait(false);
        await currentBranch.ResolveListBranchFilterAsync(run.BranchId, cancellationToken).ConfigureAwait(false);
        if (run.Status != PayrollRunStatuses.Draft)
        {
            throw PayrollWrites.Conflict("Only a draft payroll run can be recalculated.");
        }

        var month = NepaliMonth.Of(run.BsYear, run.BsMonth);
        var computation = await PayrollRunBuilder.ComputeAsync(dbContext, run.BranchId, month, run.Id, cancellationToken).ConfigureAwait(false);

        // Old lines are deleted and new ones added in one save.
        dbContext.RunLines.RemoveRange(run.Lines);
        run.ReplaceLines(
            computation.Lines.Select(l => PayrollRunLine.Create(run.Id, l.Employee, l.DaysWorked, l.DaysInMonth, l.Result)),
            timeProvider.GetUtcNow().UtcDateTime);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return run.ToDto(includeLines: true);
    }
}

public sealed class DeletePayrollRunCommandHandler(PayrollDbContext dbContext, ICurrentBranch currentBranch)
    : ICommandHandler<DeletePayrollRunCommand, Unit>
{
    public async ValueTask<Unit> Handle(DeletePayrollRunCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);
        var run = await PayrollWrites.LoadRunAsync(dbContext, command.RunId, cancellationToken).ConfigureAwait(false);
        await currentBranch.ResolveListBranchFilterAsync(run.BranchId, cancellationToken).ConfigureAwait(false);
        if (run.Status != PayrollRunStatuses.Draft)
        {
            throw PayrollWrites.Conflict("Only a draft payroll run can be deleted.");
        }

        dbContext.RunLines.RemoveRange(run.Lines);
        dbContext.Runs.Remove(run);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return Unit.Value;
    }
}

public sealed class ApprovePayrollRunCommandHandler(
    PayrollDbContext dbContext, ICurrentBranch currentBranch, ICurrentUser currentUser, TimeProvider timeProvider)
    : ICommandHandler<ApprovePayrollRunCommand, PayrollRunDto>
{
    public async ValueTask<PayrollRunDto> Handle(ApprovePayrollRunCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);
        var run = await PayrollWrites.LoadRunAsync(dbContext, command.RunId, cancellationToken).ConfigureAwait(false);
        await currentBranch.ResolveListBranchFilterAsync(run.BranchId, cancellationToken).ConfigureAwait(false);
        PayrollWrites.Transition(() => run.Approve(RunActors.Name(currentUser), timeProvider.GetUtcNow().UtcDateTime));
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return run.ToDto(includeLines: true);
    }
}

/// <summary>Posts an approved run: marks it posted and writes <see cref="PayrollRunPostedIntegrationEvent"/> to the outbox
/// in the same transaction; Accounting books the accrual journal from it.</summary>
public sealed partial class PostPayrollRunCommandHandler(
    PayrollDbContext dbContext,
    IOutboxWriter outbox,
    ICurrentBranch currentBranch,
    ICurrentUser currentUser,
    TimeProvider timeProvider,
    ILogger<PostPayrollRunCommandHandler> logger) : ICommandHandler<PostPayrollRunCommand, PayrollRunDto>
{
    public async ValueTask<PayrollRunDto> Handle(PostPayrollRunCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);
        return await PayrollWrites.InTransactionAsync(dbContext, async ct =>
        {
            var run = await PayrollWrites.LoadRunAsync(dbContext, command.RunId, ct).ConfigureAwait(false);
            await currentBranch.ResolveListBranchFilterAsync(run.BranchId, ct).ConfigureAwait(false);

            DateOnly postingDate = command.PostingDate ?? run.PeriodEnd;
            if (postingDate < run.PeriodStart)
            {
                throw PayrollWrites.Conflict("The posting date can't be before the payroll month starts.");
            }

            DateTime now = timeProvider.GetUtcNow().UtcDateTime;
            PayrollWrites.Transition(() => run.Post(postingDate, RunActors.Name(currentUser), now));
            await dbContext.SaveChangesAsync(ct).ConfigureAwait(false);

            var month = NepaliMonth.Of(run.BsYear, run.BsMonth);
            await outbox.AddAsync(new PayrollRunPostedIntegrationEvent(
                Id: Guid.NewGuid(),
                OccurredOnUtc: now,
                TenantId: currentUser.GetTenant(),
                CorrelationId: Activity.Current?.Id ?? Guid.NewGuid().ToString(),
                Source: "Payroll",
                RunId: run.Id,
                BranchId: run.BranchId,
                PeriodLabel: month.Label,
                PostingDateUtc: RunActors.ToUtc(postingDate),
                TotalGross: run.TotalGross,
                TotalEmployeeSsf: run.TotalEmployeeSsf,
                TotalEmployerSsf: run.TotalEmployerSsf,
                TotalCit: run.TotalCit,
                TotalTds: run.TotalTds,
                TotalOtherDeductions: run.TotalOtherDeductions,
                TotalNet: run.TotalNet), ct).ConfigureAwait(false);

            LogPosted(logger, run.Id, run.BranchId, run.Lines.Count);
            return run.ToDto(includeLines: true);
        }, cancellationToken).ConfigureAwait(false);
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "[Payroll] run {RunId} posted for branch {BranchId} ({EmployeeCount} employees)")]
    private static partial void LogPosted(ILogger logger, Guid runId, Guid branchId, int employeeCount);
}

/// <summary>Records a posted run as paid and writes <see cref="PayrollRunPaidIntegrationEvent"/> to the outbox in the same
/// transaction; Accounting books the payment voucher (Dr Salaries Payable / Cr the payment method's money account).</summary>
public sealed partial class PayPayrollRunCommandHandler(
    PayrollDbContext dbContext,
    IOutboxWriter outbox,
    ICurrentBranch currentBranch,
    ICurrentUser currentUser,
    TimeProvider timeProvider,
    ILogger<PayPayrollRunCommandHandler> logger) : ICommandHandler<PayPayrollRunCommand, PayrollRunDto>
{
    public async ValueTask<PayrollRunDto> Handle(PayPayrollRunCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);
        return await PayrollWrites.InTransactionAsync(dbContext, async ct =>
        {
            var run = await PayrollWrites.LoadRunAsync(dbContext, command.RunId, ct).ConfigureAwait(false);
            await currentBranch.ResolveListBranchFilterAsync(run.BranchId, ct).ConfigureAwait(false);

            DateTime now = timeProvider.GetUtcNow().UtcDateTime;
            DateOnly paidOn = command.PaidOn ?? DateOnly.FromDateTime(now);
            if (run.PostingDate is { } posted && paidOn < posted)
            {
                throw PayrollWrites.Conflict("The payment date can't be before the run's posting date.");
            }

            PayrollWrites.Transition(() => run.MarkPaid(command.PaymentMethod, paidOn, RunActors.Name(currentUser), now));
            await dbContext.SaveChangesAsync(ct).ConfigureAwait(false);

            var month = NepaliMonth.Of(run.BsYear, run.BsMonth);
            await outbox.AddAsync(new PayrollRunPaidIntegrationEvent(
                Id: Guid.NewGuid(),
                OccurredOnUtc: now,
                TenantId: currentUser.GetTenant(),
                CorrelationId: Activity.Current?.Id ?? Guid.NewGuid().ToString(),
                Source: "Payroll",
                RunId: run.Id,
                BranchId: run.BranchId,
                PeriodLabel: month.Label,
                Amount: run.TotalNet,
                PaymentMethod: run.PaymentMethod!,
                PaidOnUtc: RunActors.ToUtc(paidOn)), ct).ConfigureAwait(false);

            LogPaid(logger, run.Id, run.BranchId, run.PaymentMethod!);
            return run.ToDto(includeLines: true);
        }, cancellationToken).ConfigureAwait(false);
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "[Payroll] run {RunId} for branch {BranchId} recorded as paid by {PaymentMethod}")]
    private static partial void LogPaid(ILogger logger, Guid runId, Guid branchId, string paymentMethod);
}

public sealed class ListPayrollRunsQueryHandler(PayrollDbContext dbContext, ICurrentBranch currentBranch)
    : IQueryHandler<ListPayrollRunsQuery, IReadOnlyList<PayrollRunDto>>
{
    public async ValueTask<IReadOnlyList<PayrollRunDto>> Handle(ListPayrollRunsQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);
        Guid? branchId = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);

        var runs = dbContext.Runs.AsNoTracking();
        if (branchId is { } branch)
        {
            runs = runs.Where(r => r.BranchId == branch);
        }

        if (query.FiscalYear is { } fy)
        {
            runs = runs.Where(r => r.FiscalYearStart == fy);
        }

        if (!string.IsNullOrWhiteSpace(query.Status))
        {
            runs = runs.Where(r => r.Status == query.Status);
        }

        var list = await runs
            .OrderByDescending(r => r.FiscalYearStart).ThenByDescending(r => r.MonthOfFiscalYear)
            .Take(500)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
        var ids = list.Select(r => r.Id).ToList();
        var counts = await dbContext.RunLines
            .AsNoTracking()
            .Where(l => ids.Contains(l.RunId))
            .GroupBy(l => l.RunId)
            .Select(g => new { RunId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.RunId, x => x.Count, cancellationToken)
            .ConfigureAwait(false);

        return list.Select(r => r.ToDto(includeLines: false, counts.GetValueOrDefault(r.Id))).ToList();
    }
}

public sealed class GetPayrollRunQueryHandler(PayrollDbContext dbContext, ICurrentBranch currentBranch)
    : IQueryHandler<GetPayrollRunQuery, PayrollRunDto>
{
    public async ValueTask<PayrollRunDto> Handle(GetPayrollRunQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);
        var run = await dbContext.Runs
            .AsNoTracking()
            .Include(r => r.Lines)
            .FirstOrDefaultAsync(r => r.Id == query.Id, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Payroll run {query.Id} not found.");
        await currentBranch.ResolveListBranchFilterAsync(run.BranchId, cancellationToken).ConfigureAwait(false);
        return run.ToDto(includeLines: true);
    }
}

internal static class RunActors
{
    public static string? Name(ICurrentUser currentUser)
    {
        string? name = currentUser.Name ?? (currentUser.IsAuthenticated() ? currentUser.GetUserId().ToString() : null);
        return name is { Length: > PayrollRun.UserMaxLength } ? name[..PayrollRun.UserMaxLength] : name;
    }

    /// <summary>A business date as the UTC instant Accounting dates vouchers with (midnight UTC = 05:45 the same day in Nepal).</summary>
    public static DateTime ToUtc(DateOnly date) => DateTime.SpecifyKind(date.ToDateTime(TimeOnly.MinValue), DateTimeKind.Utc);
}

internal static class RunBranches
{
    public static async Task EnsureUsableAsync(
        IBranchService branchService, ICurrentBranch currentBranch, Guid branchId, CancellationToken cancellationToken)
    {
        if (!await branchService.IsActiveBranchOfCurrentTenantAsync(branchId, cancellationToken).ConfigureAwait(false))
        {
            throw new NotFoundException($"Branch {branchId} not found.");
        }

        await currentBranch.ResolveListBranchFilterAsync(branchId, cancellationToken).ConfigureAwait(false);
    }
}

public sealed class PreviewPayrollRunQueryValidator : AbstractValidator<PreviewPayrollRunQuery>
{
    public PreviewPayrollRunQueryValidator()
    {
        RuleFor(x => x.BranchId).NotEmpty();
        RuleFor(x => x).Must(x => NepaliMonth.IsSupported(x.BsYear, x.BsMonth))
            .WithMessage("Pick a Nepali month the calendar covers.");
    }
}

public sealed class CreatePayrollRunCommandValidator : AbstractValidator<CreatePayrollRunCommand>
{
    public CreatePayrollRunCommandValidator()
    {
        RuleFor(x => x.BranchId).NotEmpty();
        RuleFor(x => x).Must(x => NepaliMonth.IsSupported(x.BsYear, x.BsMonth))
            .WithMessage("Pick a Nepali month the calendar covers.");
    }
}

public sealed class RecalculatePayrollRunCommandValidator : AbstractValidator<RecalculatePayrollRunCommand>
{
    public RecalculatePayrollRunCommandValidator() => RuleFor(x => x.RunId).NotEmpty();
}

public sealed class DeletePayrollRunCommandValidator : AbstractValidator<DeletePayrollRunCommand>
{
    public DeletePayrollRunCommandValidator() => RuleFor(x => x.RunId).NotEmpty();
}

public sealed class ApprovePayrollRunCommandValidator : AbstractValidator<ApprovePayrollRunCommand>
{
    public ApprovePayrollRunCommandValidator() => RuleFor(x => x.RunId).NotEmpty();
}

public sealed class PostPayrollRunCommandValidator : AbstractValidator<PostPayrollRunCommand>
{
    public PostPayrollRunCommandValidator() => RuleFor(x => x.RunId).NotEmpty();
}

public sealed class PayPayrollRunCommandValidator : AbstractValidator<PayPayrollRunCommand>
{
    public PayPayrollRunCommandValidator()
    {
        RuleFor(x => x.RunId).NotEmpty();
        RuleFor(x => x.PaymentMethod)
            .Cascade(CascadeMode.Stop)
            .NotEmpty().WithMessage("Pick how the salaries were paid.")
            .MaximumLength(PayrollRun.PaymentMethodMaxLength)
            .Must(m => !string.Equals(m.Trim(), "credit", StringComparison.OrdinalIgnoreCase))
            .WithMessage("Salaries are paid from cash or a bank account, not on credit.");
    }
}

public sealed class ListPayrollRunsQueryValidator : AbstractValidator<ListPayrollRunsQuery>
{
    public ListPayrollRunsQueryValidator()
    {
        RuleFor(x => x.Status)
            .Must(s => s is null || s is PayrollRunStatuses.Draft or PayrollRunStatuses.Approved or PayrollRunStatuses.Posted or PayrollRunStatuses.Paid)
            .WithMessage("Unknown payroll run status.");
    }
}
