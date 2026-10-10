using System.Net;
using FSH.Framework.Core.Exceptions;

namespace FSH.Modules.Sales.Contracts.Safety;

/// <summary>
/// Thrown by <c>CreateSaleCommandHandler</c> when the cart triggers a drug interaction or a
/// customer-allergy match and the caller did not set <c>AcknowledgeWarnings</c>. Maps to 409
/// Conflict, mirroring the legacy <c>SAFETY_WARNING</c> response — the caller resubmits with
/// <c>AcknowledgeWarnings: true</c> to proceed.
/// </summary>
public sealed class SafetyWarningException : CustomException
{
    public IReadOnlyList<DrugInteractionWarning> Interactions { get; }
    public AllergyWarning? Allergy { get; }

    private const string DefaultMessage =
        "This cart triggered a drug interaction or allergy warning — review before completing the sale.";

    public SafetyWarningException()
        : this([], null)
    {
    }

    public SafetyWarningException(string message)
        : this(message, [], null)
    {
    }

    public SafetyWarningException(string message, Exception innerException)
        : base(message, innerException, BuildErrorMessages([], null), HttpStatusCode.Conflict)
    {
        Interactions = [];
        Allergy = null;
    }

    public SafetyWarningException(IReadOnlyList<DrugInteractionWarning> interactions, AllergyWarning? allergy)
        : this(DefaultMessage, interactions, allergy)
    {
    }

    private SafetyWarningException(string message, IReadOnlyList<DrugInteractionWarning> interactions, AllergyWarning? allergy)
        : base(message, BuildErrorMessages(interactions, allergy), HttpStatusCode.Conflict)
    {
        Interactions = interactions;
        Allergy = allergy;
    }

    private static IEnumerable<string> BuildErrorMessages(
        IReadOnlyList<DrugInteractionWarning> interactions, AllergyWarning? allergy)
    {
        foreach (var interaction in interactions)
        {
            yield return interaction.Description;
        }

        if (allergy is { MatchedMedicines.Count: > 0 })
        {
            yield return
                $"Customer has a recorded allergy to: {string.Join(", ", allergy.Allergies)} — cart includes {string.Join(", ", allergy.MatchedMedicines)}.";
        }
    }
}
