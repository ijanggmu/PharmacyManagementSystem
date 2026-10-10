using FSH.Modules.Accounting.Contracts.Dtos;
using Mediator;

namespace FSH.Modules.Accounting.Contracts.v1.PostingLock;

/// <summary>Sets (or clears, with <c>null</c>) the tenant's posting-lock date: no voucher may be
/// posted with a voucher date on or before it.</summary>
public sealed record SetPostingLockCommand(DateOnly? LockDate) : ICommand<PostingLockDto>;
