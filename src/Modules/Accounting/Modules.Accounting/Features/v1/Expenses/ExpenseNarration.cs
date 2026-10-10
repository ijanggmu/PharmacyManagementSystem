using FSH.Modules.Accounting.Domain;

namespace FSH.Modules.Accounting.Features.v1.Expenses;

/// <summary>Narration of an expense's GL voucher: category, then description and receipt reference when present.
/// Capped at the voucher narration column length (1024).</summary>
internal static class ExpenseNarration
{
    private const int MaxLength = 1024;

    public static string Build(Expense expense)
    {
        ArgumentNullException.ThrowIfNull(expense);
        string text = "Expense: " + expense.Category;
        if (!string.IsNullOrWhiteSpace(expense.Description))
        {
            text += " — " + expense.Description;
        }

        if (!string.IsNullOrWhiteSpace(expense.ReceiptReference))
        {
            text += " (receipt " + expense.ReceiptReference + ")";
        }

        return text.Length <= MaxLength ? text : text[..MaxLength];
    }
}
