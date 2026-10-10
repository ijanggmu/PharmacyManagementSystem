using FluentValidation;
using FSH.Modules.Accounting.Contracts.v1.PostingLock;

namespace FSH.Modules.Accounting.Features.v1.PostingLock.SetPostingLock;

public sealed class SetPostingLockCommandValidator : AbstractValidator<SetPostingLockCommand>
{
    public SetPostingLockCommandValidator()
    {
        // LockDate is intentionally nullable (clears the lock) — nothing else to validate.
    }
}
