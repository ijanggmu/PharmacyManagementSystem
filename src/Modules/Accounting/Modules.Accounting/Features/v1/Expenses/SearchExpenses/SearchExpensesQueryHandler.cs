using FSH.Framework.Shared.Persistence;
using FSH.Modules.Accounting.Contracts.Dtos;
using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Contracts.v1.Expenses;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Multitenancy.Contracts;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Accounting.Features.v1.Expenses.SearchExpenses;

public sealed class SearchExpensesQueryHandler(AccountingDbContext dbContext, ICurrentBranch currentBranch)
    : IQueryHandler<SearchExpensesQuery, PagedResponse<ExpenseDto>>
{
    public async ValueTask<PagedResponse<ExpenseDto>> Handle(SearchExpensesQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        Guid? branchFilter = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);

        int page = query.PageNumber < 1 ? 1 : query.PageNumber;
        int size = query.PageSize is < 1 or > 200 ? 50 : query.PageSize;

        var q = dbContext.Expenses.AsNoTracking().AsQueryable();

        if (!string.IsNullOrWhiteSpace(query.Category))
        {
            q = q.Where(e => EF.Functions.ILike(e.Category, $"%{query.Category}%"));
        }

        if (query.DateFromUtc is { } from)
        {
            q = q.Where(e => e.ExpenseDateUtc >= from);
        }

        if (query.DateToUtc is { } to)
        {
            q = q.Where(e => e.ExpenseDateUtc <= to);
        }

        if (branchFilter is { } branchId)
        {
            q = q.Where(e => e.BranchId == branchId);
        }

        // Many expenses share a date (stored at midnight); the tie-breakers keep pages stable.
        q = q.OrderByDescending(e => e.ExpenseDateUtc).ThenByDescending(e => e.CreatedAtUtc).ThenByDescending(e => e.Id);

        long total = await q.LongCountAsync(cancellationToken).ConfigureAwait(false);
        var items = await (
                from e in q.Skip((page - 1) * size).Take(size)
                join a in dbContext.Accounts.AsNoTracking() on e.ExpenseAccountId equals (Guid?)a.Id into accounts
                from a in accounts.DefaultIfEmpty()
                select new ExpenseDto(
                    e.Id, e.ExpenseDateUtc, e.Category, e.Amount, e.PaymentMethod, e.Description, e.RecordedBy, e.CreatedAtUtc,
                    e.BranchId, e.ReceiptReference, e.ExpenseAccountId,
                    a == null ? null : a.Code,
                    a == null ? null : a.Name,
                    e.VatAmount, e.SupplierVatNumber, e.VendorName, e.SupplierId,
                    e.TdsCategoryCode, e.TdsCategoryName, e.TdsRatePercent, e.TdsAmount))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        // Join results come back unordered; keep the page in the query's order.
        items = items
            .OrderByDescending(i => i.ExpenseDateUtc).ThenByDescending(i => i.CreatedAtUtc).ThenByDescending(i => i.Id)
            .ToList();

        // Expenses recorded before an account could be chosen are booked to General Expenses.
        if (items.Exists(i => i.ExpenseAccountId is null))
        {
            var general = await dbContext.Accounts
                .AsNoTracking()
                .Where(a => a.Code == AccountingSystemAccountCodes.GeneralExpenses)
                .Select(a => new { a.Id, a.Code, a.Name })
                .FirstOrDefaultAsync(cancellationToken)
                .ConfigureAwait(false);
            if (general is not null)
            {
                items = items
                    .Select(i => i.ExpenseAccountId is null
                        ? i with { ExpenseAccountId = general.Id, ExpenseAccountCode = general.Code, ExpenseAccountName = general.Name }
                        : i)
                    .ToList();
            }
        }

        return new PagedResponse<ExpenseDto>
        {
            Items = items,
            PageNumber = page,
            PageSize = size,
            TotalCount = total,
            TotalPages = (int)Math.Ceiling(total / (double)size),
        };
    }
}
