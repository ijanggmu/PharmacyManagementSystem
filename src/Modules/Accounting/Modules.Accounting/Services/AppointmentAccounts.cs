using FSH.Modules.Accounting.Contracts.Services;
using FSH.Modules.Accounting.Data;
using FSH.Modules.Accounting.Domain;

namespace FSH.Modules.Accounting.Services;

/// <summary>
/// The doctor-appointment system accounts — Doctor Fees Payable 2850 and Consultation Fee Income 4810 — seeded by
/// <c>AccountingDbInitializer</c>, and created on first use for a tenant seeded before appointments existed, the same
/// way as <see cref="PayrollAccounts"/>.
/// </summary>
internal static class AppointmentAccounts
{
    public const string DoctorFeesPayableName = "Doctor Fees Payable";
    public const string ConsultationFeeIncomeName = "Consultation Fee Income";

    public static IReadOnlyList<(string Code, string Name, AccountingAccountType Type)> All { get; } =
    [
        (AccountingSystemAccountCodes.DoctorFeesPayable, DoctorFeesPayableName, AccountingAccountType.Liability),
        (AccountingSystemAccountCodes.ConsultationFeeIncome, ConsultationFeeIncomeName, AccountingAccountType.Revenue),
    ];

    public static ValueTask<Guid> GetOrCreateAsync(AccountingDbContext dbContext, string code, CancellationToken cancellationToken)
    {
        var (_, name, type) = All.First(a => a.Code == code);
        return PayrollAccounts.GetOrCreateAsync(dbContext, code, name, type, cancellationToken);
    }
}
