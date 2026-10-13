using System.Diagnostics;
using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Customers.Contracts.Authorization;
using FSH.Modules.Customers.Contracts.Events;
using FSH.Modules.Customers.Contracts.v1.Customers;
using FSH.Modules.Customers.Data;
using FSH.Modules.Customers.Domain;
using FSH.Modules.Customers.Services;
using FSH.Modules.Identity.Contracts.Services;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Customers.Features.v1.Customers.ImportCustomers;

/// <summary>
/// Imports a customer spreadsheet, all-or-nothing per file (at most <see cref="CustomerImportLimits.MaxRows"/> rows).
///
/// <para>Plan first: every row is validated and matched against existing customers by phone (digits, without +977) or
/// PAN (<see cref="CustomerImportPlanner"/>). If any row fails — or the request is a dry run — the plan is returned and
/// nothing is written. Otherwise every create and update runs in one transaction: a half-imported file can't happen,
/// and re-sending the same file (same Idempotency-Key) replays the stored result instead of importing twice.</para>
///
/// <para>New customers go through the same path as <c>CreateCustomerCommandHandler</c>: a non-zero opening balance is
/// an <see cref="CustomerLedgerEntryType.OpeningBalance"/> AR-ledger entry dated at the row's as-of date (due after
/// the customer's credit days) plus a <see cref="CustomerOpeningBalanceRecordedIntegrationEvent"/> in the same
/// transaction, so Accounting posts Dr AR / Cr Owner's Equity on that date and the AR control account keeps agreeing
/// with the subledger. Existing customers never get an opening balance from an import (a warning says so).</para>
///
/// <para>Permissions: the endpoint needs Customers.Create; updating existing customers also needs Customers.Update,
/// and credit limits / credit days / opening balances need Manage Customer Credit Limits — the same rules as the
/// one-at-a-time forms. They're checked for the whole file before writing.</para>
/// </summary>
public sealed class ImportCustomersCommandHandler(
    CustomersDbContext dbContext,
    ICustomerCodeService customerCodes,
    ICustomerCreditPermissionGuard creditPermission,
    IUserPermissionService userPermissions,
    IOutboxWriter outbox,
    ICurrentUser currentUser,
    ICurrentBranch currentBranch)
    : ICommandHandler<ImportCustomersCommand, CustomerImportResult>
{
    public async ValueTask<CustomerImportResult> Handle(ImportCustomersCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var existing = await dbContext.Customers.AsNoTracking()
            .Where(c => c.Phone != null || c.PanNumber != null)
            .Select(c => new ExistingCustomerKey(c.Id, c.Code, c.Name, c.Phone, c.PanNumber))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var plan = CustomerImportPlanner.Plan(command.Rows, existing, command.DuplicateMode, CustomerImportKeys.NepalToday());
        bool anyFailed = plan.Any(p => p.Status == CustomerImportRowStatuses.Failed);
        if (anyFailed || command.DryRun)
        {
            return Result(plan, committed: false, command.DryRun, ids: null);
        }

        await EnsurePermissionsAsync(plan, cancellationToken).ConfigureAwait(false);

        bool anyOpeningBalance = plan.Any(p => p.Status == CustomerImportRowStatuses.Created && (p.Row.OpeningBalance ?? 0m) != 0m);
        Guid? branchId = anyOpeningBalance
            ? await currentBranch.GetBranchIdAsync(cancellationToken).ConfigureAwait(false)
            : null;

        var ids = await CustomerWrites.ExecuteAsync(
            dbContext,
            ct => WriteAsync(plan, command.AsOfDate, branchId, ct),
            cancellationToken).ConfigureAwait(false);

        return Result(plan, committed: true, dryRun: false, ids);
    }

    private async Task EnsurePermissionsAsync(IReadOnlyList<CustomerImportPlanRow> plan, CancellationToken cancellationToken)
    {
        var writes = plan.Where(p => p.Status is CustomerImportRowStatuses.Created or CustomerImportRowStatuses.Updated).ToList();

        if (writes.Any(p => p.Status == CustomerImportRowStatuses.Updated))
        {
            Guid userId = currentUser.GetUserId();
            bool canUpdate = userId != Guid.Empty
                && await userPermissions
                    .HasPermissionAsync(userId.ToString(), CustomersPermissions.Customers.Update, cancellationToken)
                    .ConfigureAwait(false);
            if (!canUpdate)
            {
                throw new CustomException(
                    "Updating existing customers from an import needs the Update Customers permission. Choose \"skip existing\" instead.",
                    (IEnumerable<string>?)null, HttpStatusCode.Forbidden);
            }
        }

        if (writes.Any(p => p.Row.CreditLimit is not null || p.Row.CreditDays is not null))
        {
            await creditPermission.EnsureCanManageCreditAsync(cancellationToken).ConfigureAwait(false);
        }

        if (writes.Any(p => p.Status == CustomerImportRowStatuses.Created && (p.Row.OpeningBalance ?? 0m) != 0m))
        {
            await creditPermission.EnsureCanSetOpeningBalanceAsync(cancellationToken).ConfigureAwait(false);
        }
    }

    private async ValueTask<Dictionary<int, Guid>> WriteAsync(
        IReadOnlyList<CustomerImportPlanRow> plan, DateOnly? fileAsOfDate, Guid? branchId, CancellationToken cancellationToken)
    {
        var ids = new Dictionary<int, Guid>();
        var openingBalances = new List<(Customer Customer, CustomerLedgerEntry Entry, decimal Amount)>();

        foreach (var (item, index) in plan.Select((p, i) => (p, i)))
        {
            var row = item.Row;
            if (item.Status == CustomerImportRowStatuses.Created)
            {
                string code = await customerCodes.NextAsync(cancellationToken).ConfigureAwait(false);
                decimal opening = row.OpeningBalance ?? 0m;
                var customer = Customer.Create(row.Name!, Blank(row.Phone), Blank(row.Email), Blank(row.Address), opening, code, row.CreditLimit);
                customer.SetPanNumber(row.PanNumber);
                if (row.CreditDays is not null)
                {
                    customer.SetCreditDays(row.CreditDays);
                }

                dbContext.Customers.Add(customer);
                ids[index] = customer.Id;

                if (opening != 0m)
                {
                    DateOnly asOf = row.AsOfDate ?? fileAsOfDate ?? CustomerImportKeys.NepalToday();
                    DateTime entryDateUtc = asOf.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
                    var entry = CustomerLedgerEntry.Create(
                        customer.Id, entryDateUtc, CustomerLedgerEntryType.OpeningBalance, "Opening balance",
                        debitAmount: opening > 0 ? opening : 0m,
                        creditAmount: opening < 0 ? -opening : 0m,
                        runningBalance: customer.CurrentBalance,
                        referenceType: "CustomerImport",
                        branchId: branchId,
                        dueDateUtc: customer.DueDateFor(entryDateUtc));
                    dbContext.CustomerLedgerEntries.Add(entry);
                    openingBalances.Add((customer, entry, opening));
                }
            }
            else if (item.Status == CustomerImportRowStatuses.Updated && item.Match is { } match)
            {
                // Locked like every other customer write, so the profile update never races a balance update.
                var customer = await CustomerWrites.LockAndLoadAsync(dbContext, match.Id, cancellationToken).ConfigureAwait(false)
                    ?? throw new NotFoundException($"Customer {match.Code} was removed while the import ran. Import the file again.");

                // Blank cells keep what's stored: an import fills in or corrects, it never wipes a field.
                customer.Update(
                    string.IsNullOrWhiteSpace(row.Name) ? customer.Name : row.Name,
                    Blank(row.Phone) ?? customer.Phone,
                    Blank(row.Email) ?? customer.Email,
                    Blank(row.Address) ?? customer.Address,
                    customer.IsActive);
                if (!string.IsNullOrWhiteSpace(row.PanNumber))
                {
                    customer.SetPanNumber(row.PanNumber);
                }

                if (row.CreditLimit is not null && row.CreditLimit != customer.CreditLimit)
                {
                    customer.SetCreditLimit(row.CreditLimit);
                }

                if (row.CreditDays is not null && row.CreditDays != customer.CreditDays)
                {
                    customer.SetCreditDays(row.CreditDays);
                }

                ids[index] = customer.Id;
            }
            else if (item.Match is { } skipped)
            {
                ids[index] = skipped.Id;
            }
        }

        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        // The outbox joins this transaction: the customers, their ledger entries and the events commit together.
        foreach (var (customer, entry, amount) in openingBalances)
        {
            await outbox.AddAsync(new CustomerOpeningBalanceRecordedIntegrationEvent(
                Id: Guid.NewGuid(),
                OccurredOnUtc: entry.EntryDateUtc,
                TenantId: currentUser.GetTenant(),
                CorrelationId: Activity.Current?.Id ?? Guid.NewGuid().ToString(),
                Source: "Customers",
                LedgerEntryId: entry.Id,
                CustomerId: customer.Id,
                CustomerName: customer.Name,
                Amount: amount,
                BranchId: branchId),
                cancellationToken).ConfigureAwait(false);
        }

        return ids;
    }

    private static CustomerImportResult Result(
        IReadOnlyList<CustomerImportPlanRow> plan, bool committed, bool dryRun, Dictionary<int, Guid>? ids)
    {
        var rows = plan
            .Select((p, i) => new CustomerImportRowResult(
                p.Row.RowNumber,
                p.Status,
                ids is not null && ids.TryGetValue(i, out var id) ? id : p.Match?.Id,
                p.Errors,
                p.Warnings))
            .ToList();

        return new CustomerImportResult(
            committed,
            dryRun,
            Created: rows.Count(r => r.Status == CustomerImportRowStatuses.Created),
            Updated: rows.Count(r => r.Status == CustomerImportRowStatuses.Updated),
            Skipped: rows.Count(r => r.Status == CustomerImportRowStatuses.Skipped),
            Failed: rows.Count(r => r.Status == CustomerImportRowStatuses.Failed),
            rows);
    }

    private static string? Blank(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
