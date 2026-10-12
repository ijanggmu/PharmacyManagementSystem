using FluentValidation;
using FSH.Modules.Accounting.Contracts.v1.PostingLock;
using FSH.Modules.Accounting.Services;

namespace FSH.Modules.Accounting.Features.v1.PostingLock.SetPostingLock;

/// <summary>
/// The lock date may be cleared (null) or set to a day strictly before today's Nepal date. Locking today or
/// a future day would leave no open day to post on: every sale, payment and receipt event would have
/// nowhere to be booked, and a voucher must never be dated in the future.
/// </summary>
public sealed class SetPostingLockCommandValidator : AbstractValidator<SetPostingLockCommand>
{
    public SetPostingLockCommandValidator()
    {
        RuleFor(x => x.LockDate)
            .Must(date => date is not { } d || d < NepalDate.FromUtc(DateTime.UtcNow))
            .WithMessage("The posting-lock date must be before today (Nepal time). Today and future days can't be locked.");
    }
}
