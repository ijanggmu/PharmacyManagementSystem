using FSH.Framework.Core.Domain;
using FSH.Modules.Payroll.Contracts.Dtos;

namespace FSH.Modules.Payroll.Domain;

/// <summary>
/// A person on the payroll. Not tied to a login: <see cref="UserId"/> optionally links the employee to an app user.
/// <see cref="MaritalStatus"/> selects the single or couple tax slabs; <see cref="SsfEnrolled"/> turns on the SSF
/// contributions (and waives the 1% social security tax on the first slab).
/// </summary>
public sealed class Employee : AggregateRoot<Guid>
{
    public const int NameMaxLength = 200;
    public const int TextMaxLength = 100;

    public string FullName { get; private set; } = default!;
    public Guid BranchId { get; private set; }
    public string? Designation { get; private set; }
    public DateOnly JoiningDate { get; private set; }
    public string? Pan { get; private set; }
    public string? SsfNumber { get; private set; }
    public bool SsfEnrolled { get; private set; }
    public string? BankName { get; private set; }
    public string? BankAccountNumber { get; private set; }
    public string MaritalStatus { get; private set; } = PayrollMaritalStatus.SinglePerson;
    public bool IsActive { get; private set; } = true;
    public Guid? UserId { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }
    public DateTime? UpdatedAtUtc { get; private set; }

    private Employee() { }

    public static Employee Create(EmployeeDetails details, DateTime nowUtc)
    {
        ArgumentNullException.ThrowIfNull(details);
        var employee = new Employee { Id = Guid.CreateVersion7(), CreatedAtUtc = nowUtc, IsActive = true };
        employee.Apply(details);
        return employee;
    }

    public void Update(EmployeeDetails details, bool isActive, DateTime nowUtc)
    {
        ArgumentNullException.ThrowIfNull(details);
        Apply(details);
        IsActive = isActive;
        UpdatedAtUtc = nowUtc;
    }

    private void Apply(EmployeeDetails d)
    {
        if (!PayrollMaritalStatus.IsValid(d.MaritalStatus))
        {
            throw new ArgumentException($"Marital status must be '{PayrollMaritalStatus.SinglePerson}' or '{PayrollMaritalStatus.Married}'.", nameof(d));
        }

        FullName = d.FullName.Trim();
        BranchId = d.BranchId;
        Designation = Clean(d.Designation);
        JoiningDate = d.JoiningDate;
        Pan = Clean(d.Pan);
        SsfNumber = Clean(d.SsfNumber);
        SsfEnrolled = d.SsfEnrolled;
        BankName = Clean(d.BankName);
        BankAccountNumber = Clean(d.BankAccountNumber);
        MaritalStatus = d.MaritalStatus;
        UserId = d.UserId;
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}

/// <summary>The editable fields of an <see cref="Employee"/>.</summary>
public sealed record EmployeeDetails(
    string FullName,
    Guid BranchId,
    string? Designation,
    DateOnly JoiningDate,
    string? Pan,
    string? SsfNumber,
    bool SsfEnrolled,
    string? BankName,
    string? BankAccountNumber,
    string MaritalStatus,
    Guid? UserId);
