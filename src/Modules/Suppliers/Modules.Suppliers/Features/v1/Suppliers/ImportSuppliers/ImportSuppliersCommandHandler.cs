using System.Diagnostics;
using System.Net;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Identity.Contracts.Services;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Suppliers.Contracts.Authorization;
using FSH.Modules.Suppliers.Contracts.Events;
using FSH.Modules.Suppliers.Contracts.v1.Suppliers;
using FSH.Modules.Suppliers.Data;
using FSH.Modules.Suppliers.Domain;
using FSH.Modules.Suppliers.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace FSH.Modules.Suppliers.Features.v1.Suppliers.ImportSuppliers;

/// <summary>
/// Imports a supplier spreadsheet, all-or-nothing per file (at most <see cref="SupplierImportLimits.MaxRows"/> rows).
///
/// <para>Plan first (<see cref="SupplierImportPlanner"/>): every row is validated and matched against existing
/// suppliers by PAN / VAT number, then by name. If any row fails — or it's a dry run — the plan is returned and
/// nothing is written. Otherwise all creates and updates run in one transaction.</para>
///
/// <para>New suppliers go through the same path as <c>CreateSupplierCommandHandler</c>: a non-zero opening balance is
/// the supplier's first <see cref="SupplierLedgerEntryType.OpeningBalance"/> AP-ledger entry, dated at the row's as-of
/// date (due after the supplier's credit days), plus a <see cref="SupplierOpeningBalanceRecordedIntegrationEvent"/> in
/// the same transaction, so Accounting posts the AP vs opening-equity voucher on that date and the AP control account
/// keeps agreeing with the subledger. Existing suppliers never get an opening balance from an import.</para>
///
/// <para>Permissions: the endpoint needs Suppliers.Create; updating existing suppliers also needs Suppliers.Update,
/// and opening balances need Manage Supplier Opening Balances — checked for the whole file before writing.</para>
/// </summary>
public sealed class ImportSuppliersCommandHandler(
    SuppliersDbContext dbContext,
    ICurrentBranch currentBranch,
    ISupplierLedgerPermissionGuard ledgerPermissions,
    IUserPermissionService userPermissions,
    IOutboxWriter outbox,
    ICurrentUser currentUser)
    : ICommandHandler<ImportSuppliersCommand, SupplierImportResult>
{
    public async ValueTask<SupplierImportResult> Handle(ImportSuppliersCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var existing = await dbContext.Suppliers.AsNoTracking()
            .Select(s => new ExistingSupplierKey(s.Id, s.Name, s.TaxId))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        var plan = SupplierImportPlanner.Plan(command.Rows, existing, command.DuplicateMode, new SupplierImportRowValidator());
        if (command.DryRun || plan.Any(p => p.Status == SupplierImportRowStatuses.Failed))
        {
            return Result(plan, committed: false, command.DryRun, ids: null);
        }

        await EnsurePermissionsAsync(plan, cancellationToken).ConfigureAwait(false);

        bool anyOpeningBalance = plan.Any(IsOpeningBalance);
        Guid? branchId = anyOpeningBalance
            ? await currentBranch.GetBranchIdAsync(cancellationToken).ConfigureAwait(false)
            : null;

        var ids = await SupplierRowLock.InTransactionAsync(
            dbContext,
            () => WriteAsync(plan, command.AsOfDate, branchId, cancellationToken),
            cancellationToken).ConfigureAwait(false);

        return Result(plan, committed: true, dryRun: false, ids);
    }

    private static bool IsOpeningBalance(SupplierImportPlanRow p) =>
        p.Status == SupplierImportRowStatuses.Created && (p.Row.OpeningBalance ?? 0m) != 0m;

    private async Task EnsurePermissionsAsync(IReadOnlyList<SupplierImportPlanRow> plan, CancellationToken cancellationToken)
    {
        if (plan.Any(p => p.Status == SupplierImportRowStatuses.Updated))
        {
            Guid userId = currentUser.GetUserId();
            bool canUpdate = userId != Guid.Empty
                && await userPermissions
                    .HasPermissionAsync(userId.ToString(), SuppliersPermissions.Suppliers.Update, cancellationToken)
                    .ConfigureAwait(false);
            if (!canUpdate)
            {
                throw new CustomException(
                    "Updating existing suppliers from an import needs the Update Suppliers permission. Choose \"skip existing\" instead.",
                    (IEnumerable<string>?)null, HttpStatusCode.Forbidden);
            }
        }

        if (plan.Any(IsOpeningBalance))
        {
            await ledgerPermissions.EnsureCanManageOpeningBalanceAsync(cancellationToken).ConfigureAwait(false);
        }
    }

    private async Task<Dictionary<int, Guid>> WriteAsync(
        IReadOnlyList<SupplierImportPlanRow> plan, DateOnly? fileAsOfDate, Guid? branchId, CancellationToken cancellationToken)
    {
        var ids = new Dictionary<int, Guid>();
        var openingBalances = new List<(Supplier Supplier, SupplierLedgerEntry Entry, decimal Amount)>();

        var updateIds = plan.Where(p => p.Status == SupplierImportRowStatuses.Updated).Select(p => p.Match!.Id).ToList();
        var toUpdate = updateIds.Count == 0
            ? []
            : await dbContext.Suppliers
                .Where(s => updateIds.Contains(s.Id))
                .ToDictionaryAsync(s => s.Id, cancellationToken)
                .ConfigureAwait(false);

        foreach (var (item, index) in plan.Select((p, i) => (p, i)))
        {
            var row = item.Row;
            if (item.Status == SupplierImportRowStatuses.Created)
            {
                decimal opening = row.OpeningBalance ?? 0m;
                var supplier = Supplier.Create(
                    row.Name!, Blank(row.ContactPerson), Blank(row.Phone), Blank(row.Email), Blank(row.Address),
                    SupplierImportKeys.PanKey(row.PanNumber), opening, row.CreditDays);
                dbContext.Suppliers.Add(supplier);
                ids[index] = supplier.Id;

                if (opening != 0m)
                {
                    DateOnly asOf = row.AsOfDate ?? fileAsOfDate ?? SupplierImportKeys.NepalToday();
                    DateTime entryDateUtc = asOf.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
                    var entry = SupplierLedgerEntry.Create(
                        supplier.Id, entryDateUtc, SupplierLedgerEntryType.OpeningBalance, "Opening balance",
                        debitAmount: opening > 0 ? opening : 0m,
                        creditAmount: opening < 0 ? -opening : 0m,
                        runningBalance: supplier.CurrentBalance,
                        referenceType: "SupplierImport", referenceId: null, branchId: branchId,
                        dueDateUtc: opening > 0 ? supplier.DueDateFor(entryDateUtc) : null);
                    dbContext.SupplierLedgerEntries.Add(entry);
                    openingBalances.Add((supplier, entry, opening));
                }
            }
            else if (item.Status == SupplierImportRowStatuses.Updated && item.Match is { } match)
            {
                var supplier = toUpdate.GetValueOrDefault(match.Id)
                    ?? throw new NotFoundException($"Supplier \"{match.Name}\" was removed while the import ran. Import the file again.");

                // Blank cells keep what's stored; the name (the supplier's identity) is never changed by an import.
                supplier.Update(
                    supplier.Name,
                    Blank(row.ContactPerson) ?? supplier.ContactPerson,
                    Blank(row.Phone) ?? supplier.Phone,
                    Blank(row.Email) ?? supplier.Email,
                    Blank(row.Address) ?? supplier.Address,
                    SupplierImportKeys.PanKey(row.PanNumber) ?? supplier.TaxId,
                    supplier.IsActive,
                    row.CreditDays ?? supplier.CreditDays);
                ids[index] = supplier.Id;
            }
            else if (item.Match is { } skipped)
            {
                ids[index] = skipped.Id;
            }
        }

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation, ConstraintName: SupplierNameGuard.NameIndex })
        {
            throw new CustomException(
                "A supplier with one of these names was added while the import ran. Import the file again to see it as existing.",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        // The outbox joins this transaction: suppliers, their ledger entries and the events commit together.
        foreach (var (supplier, entry, amount) in openingBalances)
        {
            await outbox.AddAsync(new SupplierOpeningBalanceRecordedIntegrationEvent(
                Id: Guid.NewGuid(),
                OccurredOnUtc: DateTime.UtcNow,
                TenantId: currentUser.GetTenant(),
                CorrelationId: Activity.Current?.Id ?? Guid.NewGuid().ToString(),
                Source: "Suppliers",
                LedgerEntryId: entry.Id,
                SupplierId: supplier.Id,
                SupplierName: supplier.Name,
                Amount: amount,
                VoucherDateUtc: entry.EntryDateUtc,
                BranchId: branchId),
                cancellationToken).ConfigureAwait(false);
        }

        return ids;
    }

    private static SupplierImportResult Result(
        IReadOnlyList<SupplierImportPlanRow> plan, bool committed, bool dryRun, Dictionary<int, Guid>? ids)
    {
        var rows = plan
            .Select((p, i) => new SupplierImportRowResult(
                p.Row.RowNumber,
                p.Status,
                ids is not null && ids.TryGetValue(i, out var id) ? id : p.Match?.Id,
                p.Errors,
                p.Warnings))
            .ToList();

        return new SupplierImportResult(
            committed,
            dryRun,
            Created: rows.Count(r => r.Status == SupplierImportRowStatuses.Created),
            Updated: rows.Count(r => r.Status == SupplierImportRowStatuses.Updated),
            Skipped: rows.Count(r => r.Status == SupplierImportRowStatuses.Skipped),
            Failed: rows.Count(r => r.Status == SupplierImportRowStatuses.Failed),
            rows);
    }

    private static string? Blank(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
