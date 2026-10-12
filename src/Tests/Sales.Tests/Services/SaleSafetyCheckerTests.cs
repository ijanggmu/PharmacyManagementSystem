using FSH.Modules.Sales.Services;

namespace Sales.Tests.Services;

public sealed class SaleSafetyCheckerTests
{
    private static AllergyCheckMedicine Med(string name, string? generic = null) => new(generic ?? name, name, generic);

    [Theory]
    [InlineData("Penicillin", "Augmentin 625", "Amoxicillin + Clavulanic Acid")]
    [InlineData("penicillin allergy", "Novamox 500", "Amoxicillin")]
    [InlineData("PENICILLINS", "Ampilox", "Ampicillin + Cloxacillin")]
    [InlineData("Amoxicillin", "Ampicillin 250", null)]
    [InlineData("Augmentin", "Moxclav 625", "Co-Amoxiclav")]
    [InlineData("co-amoxiclav", "Clavam 375", "Coamoxiclav")]
    [InlineData("Sulfa", "Septran DS", "Sulfamethoxazole + Trimethoprim")]
    [InlineData("sulfa drugs", "Bactrim", "Co-trimoxazole")]
    [InlineData("NSAIDs", "Flexon", "Ibuprofen + Paracetamol")]
    [InlineData("NSAID", "Voveran 50", "Diclofenac Sodium")]
    [InlineData("Aspirin", "Brufen 400", "Ibuprofen")]
    [InlineData("ibuprofen", "Naprosyn", "Naproxen")]
    [InlineData("Cephalosporins", "Zifi 200", "Cefixime")]
    [InlineData("Quinolones", "Cifran 500", "Ciprofloxacin")]
    [InlineData("Acetaminophen", "Cetamol 500", "Paracetamol")]
    [InlineData("Metronidazole", "Tiniba", "Tinidazole")]
    public void Should_Match_An_Allergy_By_Class_Synonym_Brand_Or_Generic(string allergy, string name, string? generic)
    {
        var result = SaleSafetyChecker.FindAllergyMatch([Med(name, generic)], [allergy]);

        result.ShouldNotBeNull();
        result.MatchedMedicines.ShouldHaveSingleItem();
    }

    [Fact]
    public void Should_Match_The_Brand_Name_Even_When_The_Label_Is_The_Generic()
    {
        // The allergy is recorded by brand; the cart labels the medicine by its generic name.
        var result = SaleSafetyChecker.FindAllergyMatch(
            [new AllergyCheckMedicine("Diclofenac", Name: "Voltaren 50", GenericName: "Diclofenac")], ["voltaren"]);

        result.ShouldNotBeNull();
        result.MatchedMedicines.ShouldBe(["Diclofenac"]);
    }

    [Theory]
    [InlineData("Sulfa", "Ferrous Sulfate 200", "Ferrous Sulfate")]
    [InlineData("Sulfa", "Salbutamol", "Salbutamol Sulphate")]
    [InlineData("Penicillin", "Azithral 500", "Azithromycin")]
    [InlineData("NSAIDs", "Cetamol 500", "Paracetamol")]
    [InlineData("Magnesium sulfate", "Septran", "Sulfamethoxazole + Trimethoprim")]
    [InlineData("Peanuts", "Augmentin", "Amoxicillin + Clavulanic Acid")]
    [InlineData("a", "Augmentin", "Amoxicillin")]
    public void Should_Not_Match_Unrelated_Medicines(string allergy, string name, string? generic)
    {
        SaleSafetyChecker.FindAllergyMatch([Med(name, generic)], [allergy]).ShouldBeNull();
    }

    [Fact]
    public void Label_Overload_Should_Still_Match_Through_The_Class_Table()
    {
        var result = SaleSafetyChecker.FindAllergyMatch(["Amoxicillin", "Paracetamol"], ["Penicillin"]);

        result.ShouldNotBeNull();
        result.MatchedMedicines.ShouldBe(["Amoxicillin"]);
        result.Allergies.ShouldBe(["Penicillin"]);
    }

    [Fact]
    public void No_Allergies_Should_Match_Nothing()
    {
        SaleSafetyChecker.FindAllergyMatch(["Amoxicillin"], []).ShouldBeNull();
    }

    [Fact]
    public void Interactions_Should_Still_Be_Found()
    {
        SaleSafetyChecker.FindInteractions(["Warfarin", "Aspirin"]).ShouldHaveSingleItem().Severity.ShouldBe("severe");
    }
}
