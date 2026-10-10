namespace FSH.Modules.Sales.Contracts.Safety;

/// <summary>A pairwise drug interaction found in the cart. Mirrors legacy <c>DrugInteraction</c>.</summary>
public sealed record DrugInteractionWarning(
    string Severity,
    string Description,
    string FirstMedicine,
    string SecondMedicine);

/// <summary>A customer allergy match against the cart. Mirrors legacy <c>AllergyMatch</c>.</summary>
public sealed record AllergyWarning(
    IReadOnlyList<string> MatchedMedicines,
    IReadOnlyList<string> Allergies);
