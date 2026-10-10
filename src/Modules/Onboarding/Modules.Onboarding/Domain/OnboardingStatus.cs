using System.Net;
using FSH.Framework.Core.Domain;
using FSH.Framework.Core.Exceptions;

namespace FSH.Modules.Onboarding.Domain;

/// <summary>
/// One row per tenant, created on first access (see <c>OnboardingDbInitializer</c>). Guards the
/// opening-balance entry against running twice — a second attempt would double-post the balance
/// sheet's opening position.
/// </summary>
public sealed class OnboardingStatus : AggregateRoot<Guid>
{
    public bool IsCompleted { get; private set; }
    public Guid? OpeningBalanceVoucherId { get; private set; }
    public DateTime? CompletedAtUtc { get; private set; }
    public string? CompletedBy { get; private set; }

    private OnboardingStatus() { }

    public static OnboardingStatus CreatePending()
    {
        return new OnboardingStatus
        {
            Id = Guid.CreateVersion7(),
            IsCompleted = false,
        };
    }

    public void Complete(Guid openingBalanceVoucherId, string completedBy)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(completedBy);

        if (IsCompleted)
        {
            throw new CustomException(
                "Onboarding has already been completed for this tenant.", (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        IsCompleted = true;
        OpeningBalanceVoucherId = openingBalanceVoucherId;
        CompletedAtUtc = DateTime.UtcNow;
        CompletedBy = completedBy.Trim();
    }
}
