using FSH.Modules.Sales.Contracts.Safety;
using FSH.Modules.Sales.Services;

namespace Sales.Tests.Services;

/// <summary>Interaction matching works on the ingredients a product label names, not the exact generic name.</summary>
public sealed class DrugInteractionReferenceTests
{
    [Theory]
    [InlineData("Warfarin Sodium", "Ibuprofen 400mg", "severe")]
    [InlineData("Warfarin Sodium 5 mg Tablet", "Aspirin 75mg", "severe")]
    [InlineData("WARFARIN", "Naproxen Sodium 500 mg", "severe")]
    [InlineData("Paracetamol 500mg + Ibuprofen 400mg", "Warfarin", "severe")]
    [InlineData("Ibuprofen and Paracetamol Suspension", "Warfarin Sodium", "severe")]
    [InlineData("Acetylsalicylic Acid 150 mg", "Warfarin", "severe")]
    [InlineData("Aspirin/Dipyridamole", "Ibuprofen", "moderate")]
    [InlineData("Simvastatin 20mg", "Clarithromycin 500 mg ER", "severe")]
    [InlineData("Sildenafil Citrate 50mg", "Glyceryl Trinitrate Spray", "severe")]
    [InlineData("Metformin Hydrochloride SR 500", "Iohexol injection", "severe")]
    [InlineData("Phenelzine", "Sertraline HCl 50mg", "severe")]
    public void FindInteraction_Should_Match_Real_Product_Labels(string cartLabel, string otherLabel, string severity)
    {
        DrugInteractionReference.FindInteraction(cartLabel, otherLabel).ShouldNotBeNull().Severity.ShouldBe(severity);
        DrugInteractionReference.FindInteraction(otherLabel, cartLabel).ShouldNotBeNull();
    }

    [Theory]
    [InlineData("Paracetamol 500mg", "Ibuprofen 400mg")]
    [InlineData("Warfarin Sodium", "Paracetamol")]
    [InlineData("Sodium Chloride 0.9%", "Potassium Chloride")]
    [InlineData("Amoxicillin", "Metformin")]
    public void FindInteraction_Should_Not_Flag_Unrelated_Products(string first, string second)
    {
        DrugInteractionReference.FindInteraction(first, second).ShouldBeNull();
    }

    [Fact]
    public void IngredientsOf_Should_Drop_Strengths_Forms_And_Salts_And_Split_Combinations()
    {
        var ingredients = DrugInteractionReference.IngredientsOf("Paracetamol 325 mg + Ibuprofen Sodium 400mg Tablets");

        ingredients.ShouldContain("paracetamol");
        ingredients.ShouldContain("ibuprofen");
        ingredients.ShouldNotContain("sodium");
        ingredients.ShouldNotContain("mg");
        ingredients.ShouldNotContain("tablets");
    }

    [Fact]
    public void EntriesFor_Should_Find_The_Table_Entries_Of_A_Salt_Form()
    {
        DrugInteractionReference.EntriesFor("Warfarin Sodium 5mg").Select(e => e.With).ShouldContain("ibuprofen");
        DrugInteractionReference.EntriesFor("Paracetamol").ShouldBeEmpty();
    }

    [Fact]
    public void FindInteractions_Should_Check_The_Customers_Current_Medications()
    {
        var warnings = SaleSafetyChecker.FindInteractions(["Aspirin 75mg", "Paracetamol"], ["Warfarin Sodium 5 mg", " "]);

        var warning = warnings.ShouldHaveSingleItem();
        warning.FirstMedicine.ShouldBe("Aspirin 75mg");
        warning.SecondMedicine.ShouldBe("Warfarin Sodium 5 mg (current medication)");
        warning.Severity.ShouldBe("severe");
    }

    [Fact]
    public void FindInteractions_Should_Find_Real_Products_In_The_Cart()
    {
        SaleSafetyChecker.FindInteractions(["Warfarin Sodium", "Ibuprofen 400mg"]).ShouldHaveSingleItem().Severity.ShouldBe("severe");
    }
}
