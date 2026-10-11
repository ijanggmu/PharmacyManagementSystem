using FSH.Modules.Onboarding.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Onboarding.Contracts.v1.Migration;

/// <summary>
/// Port of <c>completeMigrationSession</c> plus the five <c>importOpening*</c>/<c>setOpeningCashOrBank</c>
/// functions combined: finalizes every category's saved draft lines by posting one balanced GL voucher
/// per non-empty category (Dr Cash/Bank/Inventory/AR, Cr Owner's Equity; Dr Owner's Equity / Cr AP for
/// suppliers) through <c>IVoucherPostingService</c>, creates the opening stock batches through
/// <c>IStockReceiptService</c>, and posts each supplier's AP subledger entry through
/// <c>ISupplierLedgerService</c> — then locks the session (<c>Status = Committed</c>). Rejected (409)
/// if the session is not found, doesn't match <paramref name="SessionId"/>, or was already committed —
/// the guard runs BEFORE any voucher/stock/ledger side effect, so a second commit attempt never
/// double-posts (mirrors the Postgres <c>status = 'draft'</c> guard in scripts/99).
/// </summary>
/// <param name="SessionId">The draft migration session to commit.</param>
/// <param name="BranchId">Branch the opening balances and stock belong to; null = the caller's current
/// branch. A caller without <c>Branches.ViewAll</c> may only name their own branch (403 otherwise).</param>
public sealed record CommitMigrationSessionCommand(Guid SessionId, Guid? BranchId = null) : ICommand<MigrationCommitResultDto>;
