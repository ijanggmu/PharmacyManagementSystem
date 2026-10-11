using FSH.Modules.Inventory.Domain;

namespace Inventory.Tests.Domain;

public sealed class Ean13AndBatchNoTests
{
    [Theory]
    [InlineData("400638133393", '1')] // 4006381333931 — published GS1 example
    [InlineData("590123412345", '7')] // 5901234123457
    [InlineData("200000000000", '8')]
    public void CheckDigit_Should_Match_Gs1(string twelve, char expected) =>
        Ean13.CheckDigit(twelve).ShouldBe(expected);

    [Fact]
    public void NewInStoreCode_Should_Be_A_Valid_Ean13_With_Prefix_2()
    {
        for (int i = 0; i < 200; i++)
        {
            string code = Ean13.NewInStoreCode();
            code.Length.ShouldBe(13);
            code[0].ShouldBe('2');
            Ean13.IsValid(code).ShouldBeTrue(code);
        }
    }

    [Theory]
    [InlineData("4006381333932")] // wrong check digit
    [InlineData("400638133393")]  // 12 digits
    [InlineData("40063813339a1")]
    [InlineData(null)]
    public void IsValid_Should_Reject_Malformed_Codes(string? code) =>
        Ean13.IsValid(code).ShouldBeFalse();

    [Theory]
    [InlineData("pcm2401", "PCM2401")]
    [InlineData("  PCM 2401 ", "PCM 2401")]
    [InlineData("pcm \t 2401", "PCM 2401")]
    public void NormalizeBatchNo_Should_Trim_Collapse_And_Uppercase(string input, string expected) =>
        MedicineBatch.NormalizeBatchNo(input).ShouldBe(expected);

    [Fact]
    public void Create_Should_Store_The_Normalized_BatchNo()
    {
        var batch = MedicineBatch.Create(
            Guid.CreateVersion7(), Guid.CreateVersion7(), " ab 12 ", DateOnly.FromDateTime(DateTime.UtcNow.AddYears(1)),
            1m, 1m, 2m, null);

        batch.BatchNo.ShouldBe("AB 12");
    }

    [Theory]
    [InlineData("  ", null)]
    [InlineData("", null)]
    [InlineData(" 8901234567890 ", "8901234567890")]
    public void NormalizeBarcode_Should_Turn_Blank_Into_Null(string input, string? expected) =>
        Medicine.NormalizeBarcode(input).ShouldBe(expected);
}
