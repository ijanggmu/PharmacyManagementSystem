namespace FSH.Modules.Accounting.Contracts.Events;

/// <summary>Reference types a pay-later expense's entries carry on the supplier AP ledger (the reference id is the
/// expense id): the bill itself, and the credit that voids it when the expense is deleted.</summary>
public static class ExpenseBillReference
{
    public const string ReferenceType = "Expense";
    public const string VoidReferenceType = "ExpenseVoid";
}
