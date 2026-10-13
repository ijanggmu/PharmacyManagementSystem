using System.Net;
using FluentValidation;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Payroll.Contracts.Dtos;
using FSH.Modules.Payroll.Contracts.v1;
using FSH.Modules.Payroll.Data;
using FSH.Modules.Payroll.Domain;
using FSH.Modules.Payroll.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Payroll.Features.v1.Employees;

public sealed class CreateEmployeeCommandHandler(
    PayrollDbContext dbContext,
    IBranchService branchService,
    ICurrentBranch currentBranch,
    TimeProvider timeProvider) : ICommandHandler<CreateEmployeeCommand, EmployeeDto>
{
    public async ValueTask<EmployeeDto> Handle(CreateEmployeeCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);
        await EmployeeBranches.EnsureUsableAsync(branchService, currentBranch, command.BranchId, cancellationToken).ConfigureAwait(false);

        var employee = Employee.Create(
            new EmployeeDetails(command.FullName, command.BranchId, command.Designation, command.JoiningDate, command.Pan,
                command.SsfNumber, command.SsfEnrolled, command.BankName, command.BankAccountNumber, command.MaritalStatus, command.UserId),
            timeProvider.GetUtcNow().UtcDateTime);
        dbContext.Employees.Add(employee);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return employee.ToDto(current: null);
    }
}

public sealed class UpdateEmployeeCommandHandler(
    PayrollDbContext dbContext,
    IBranchService branchService,
    ICurrentBranch currentBranch,
    TimeProvider timeProvider) : ICommandHandler<UpdateEmployeeCommand, EmployeeDto>
{
    public async ValueTask<EmployeeDto> Handle(UpdateEmployeeCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);
        var employee = await dbContext.Employees
            .FirstOrDefaultAsync(e => e.Id == command.Id, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Employee {command.Id} not found.");
        await currentBranch.ResolveListBranchFilterAsync(employee.BranchId, cancellationToken).ConfigureAwait(false);
        if (command.BranchId != employee.BranchId)
        {
            await EmployeeBranches.EnsureUsableAsync(branchService, currentBranch, command.BranchId, cancellationToken).ConfigureAwait(false);
        }

        employee.Update(
            new EmployeeDetails(command.FullName, command.BranchId, command.Designation, command.JoiningDate, command.Pan,
                command.SsfNumber, command.SsfEnrolled, command.BankName, command.BankAccountNumber, command.MaritalStatus, command.UserId),
            command.IsActive,
            timeProvider.GetUtcNow().UtcDateTime);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        var current = await EmployeeBranches.CurrentStructureAsync(dbContext, employee.Id, cancellationToken).ConfigureAwait(false);
        return employee.ToDto(current);
    }
}

public sealed class ListEmployeesQueryHandler(PayrollDbContext dbContext, ICurrentBranch currentBranch)
    : IQueryHandler<ListEmployeesQuery, IReadOnlyList<EmployeeDto>>
{
    public async ValueTask<IReadOnlyList<EmployeeDto>> Handle(ListEmployeesQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);
        Guid? branchId = await currentBranch.ResolveListBranchFilterAsync(query.BranchId, cancellationToken).ConfigureAwait(false);

        var employees = dbContext.Employees.AsNoTracking();
        if (branchId is { } branch)
        {
            employees = employees.Where(e => e.BranchId == branch);
        }

        if (!query.IncludeInactive)
        {
            employees = employees.Where(e => e.IsActive);
        }

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            string pattern = $"%{query.Search.Trim()}%";
            employees = employees.Where(e => EF.Functions.ILike(e.FullName, pattern)
                || (e.Designation != null && EF.Functions.ILike(e.Designation, pattern))
                || (e.Pan != null && EF.Functions.ILike(e.Pan, pattern)));
        }

        var list = await employees.OrderBy(e => e.FullName).Take(1000).ToListAsync(cancellationToken).ConfigureAwait(false);
        var ids = list.Select(e => e.Id).ToList();
        DateOnly today = DateOnly.FromDateTime(DateTime.UtcNow);
        var structures = await dbContext.SalaryStructures
            .AsNoTracking()
            .Where(s => ids.Contains(s.EmployeeId))
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
        var current = structures
            .GroupBy(s => s.EmployeeId)
            .ToDictionary(g => g.Key, g => EmployeeBranches.Current(g, today));

        return list.Select(e => e.ToDto(current.GetValueOrDefault(e.Id))).ToList();
    }
}

public sealed class GetEmployeeQueryHandler(PayrollDbContext dbContext, ICurrentBranch currentBranch)
    : IQueryHandler<GetEmployeeQuery, EmployeeDto>
{
    public async ValueTask<EmployeeDto> Handle(GetEmployeeQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);
        var employee = await dbContext.Employees
            .AsNoTracking()
            .FirstOrDefaultAsync(e => e.Id == query.Id, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Employee {query.Id} not found.");
        await currentBranch.ResolveListBranchFilterAsync(employee.BranchId, cancellationToken).ConfigureAwait(false);
        var current = await EmployeeBranches.CurrentStructureAsync(dbContext, employee.Id, cancellationToken).ConfigureAwait(false);
        return employee.ToDto(current);
    }
}

public sealed class ListSalaryStructuresQueryHandler(PayrollDbContext dbContext, ICurrentBranch currentBranch)
    : IQueryHandler<ListSalaryStructuresQuery, IReadOnlyList<SalaryStructureDto>>
{
    public async ValueTask<IReadOnlyList<SalaryStructureDto>> Handle(ListSalaryStructuresQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);
        var branchId = await dbContext.Employees
            .AsNoTracking()
            .Where(e => e.Id == query.EmployeeId)
            .Select(e => (Guid?)e.BranchId)
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Employee {query.EmployeeId} not found.");
        await currentBranch.ResolveListBranchFilterAsync(branchId, cancellationToken).ConfigureAwait(false);

        var structures = await dbContext.SalaryStructures
            .AsNoTracking()
            .Where(s => s.EmployeeId == query.EmployeeId)
            .OrderByDescending(s => s.EffectiveFrom)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
        return structures.Select(s => s.ToDto()).ToList();
    }
}

public sealed class AddSalaryStructureCommandHandler(
    PayrollDbContext dbContext,
    ICurrentBranch currentBranch,
    TimeProvider timeProvider) : ICommandHandler<AddSalaryStructureCommand, SalaryStructureDto>
{
    public async ValueTask<SalaryStructureDto> Handle(AddSalaryStructureCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);
        var branchId = await dbContext.Employees
            .AsNoTracking()
            .Where(e => e.Id == command.EmployeeId)
            .Select(e => (Guid?)e.BranchId)
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Employee {command.EmployeeId} not found.");
        await currentBranch.ResolveListBranchFilterAsync(branchId, cancellationToken).ConfigureAwait(false);

        bool clash = await dbContext.SalaryStructures
            .AnyAsync(s => s.EmployeeId == command.EmployeeId && s.EffectiveFrom == command.EffectiveFrom, cancellationToken)
            .ConfigureAwait(false);
        if (clash)
        {
            throw new CustomException(
                $"A salary structure effective from {command.EffectiveFrom:yyyy-MM-dd} already exists. Pick another date.",
                (IEnumerable<string>?)null, HttpStatusCode.Conflict);
        }

        var structure = SalaryStructure.Create(
            command.EmployeeId, command.EffectiveFrom, command.Basic, command.Grade, command.DearnessAllowance,
            command.OtherAllowance, command.OtherDeduction, command.CitContribution, command.Notes,
            timeProvider.GetUtcNow().UtcDateTime);
        dbContext.SalaryStructures.Add(structure);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        return structure.ToDto();
    }
}

internal static class EmployeeBranches
{
    /// <summary>The branch must be an active branch of the tenant that the caller may act for.</summary>
    public static async Task EnsureUsableAsync(
        IBranchService branchService, ICurrentBranch currentBranch, Guid branchId, CancellationToken cancellationToken)
    {
        if (!await branchService.IsActiveBranchOfCurrentTenantAsync(branchId, cancellationToken).ConfigureAwait(false))
        {
            throw new NotFoundException($"Branch {branchId} not found.");
        }

        await currentBranch.ResolveListBranchFilterAsync(branchId, cancellationToken).ConfigureAwait(false);
    }

    public static SalaryStructure Current(IEnumerable<SalaryStructure> structures, DateOnly asOf)
    {
        var list = structures.OrderByDescending(s => s.EffectiveFrom).ToList();
        // The structure in force today, else (all start later) the earliest upcoming one.
        return list.FirstOrDefault(s => s.EffectiveFrom <= asOf) ?? list[^1];
    }

    public static async Task<SalaryStructure?> CurrentStructureAsync(PayrollDbContext dbContext, Guid employeeId, CancellationToken cancellationToken)
    {
        var structures = await dbContext.SalaryStructures
            .AsNoTracking()
            .Where(s => s.EmployeeId == employeeId)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);
        return structures.Count == 0 ? null : Current(structures, DateOnly.FromDateTime(DateTime.UtcNow));
    }
}

public sealed class CreateEmployeeCommandValidator : AbstractValidator<CreateEmployeeCommand>
{
    public CreateEmployeeCommandValidator()
    {
        RuleFor(x => x.FullName).NotEmpty().MaximumLength(Employee.NameMaxLength);
        RuleFor(x => x.BranchId).NotEmpty();
        RuleFor(x => x.JoiningDate).NotEmpty();
        RuleFor(x => x.Designation).MaximumLength(Employee.TextMaxLength);
        RuleFor(x => x.Pan).MaximumLength(32).Matches("^[0-9]{9}$").When(x => !string.IsNullOrWhiteSpace(x.Pan))
            .WithMessage("PAN is 9 digits.");
        RuleFor(x => x.SsfNumber).MaximumLength(64);
        RuleFor(x => x.BankName).MaximumLength(Employee.TextMaxLength);
        RuleFor(x => x.BankAccountNumber).MaximumLength(64);
        RuleFor(x => x.MaritalStatus).Must(PayrollMaritalStatus.IsValid)
            .WithMessage($"Marital status must be '{PayrollMaritalStatus.SinglePerson}' or '{PayrollMaritalStatus.Married}'.");
    }
}

public sealed class UpdateEmployeeCommandValidator : AbstractValidator<UpdateEmployeeCommand>
{
    public UpdateEmployeeCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.FullName).NotEmpty().MaximumLength(Employee.NameMaxLength);
        RuleFor(x => x.BranchId).NotEmpty();
        RuleFor(x => x.JoiningDate).NotEmpty();
        RuleFor(x => x.Designation).MaximumLength(Employee.TextMaxLength);
        RuleFor(x => x.Pan).MaximumLength(32).Matches("^[0-9]{9}$").When(x => !string.IsNullOrWhiteSpace(x.Pan))
            .WithMessage("PAN is 9 digits.");
        RuleFor(x => x.SsfNumber).MaximumLength(64);
        RuleFor(x => x.BankName).MaximumLength(Employee.TextMaxLength);
        RuleFor(x => x.BankAccountNumber).MaximumLength(64);
        RuleFor(x => x.MaritalStatus).Must(PayrollMaritalStatus.IsValid)
            .WithMessage($"Marital status must be '{PayrollMaritalStatus.SinglePerson}' or '{PayrollMaritalStatus.Married}'.");
    }
}

public sealed class AddSalaryStructureCommandValidator : AbstractValidator<AddSalaryStructureCommand>
{
    public AddSalaryStructureCommandValidator()
    {
        RuleFor(x => x.EmployeeId).NotEmpty();
        RuleFor(x => x.EffectiveFrom).NotEmpty();
        RuleFor(x => x.Basic).GreaterThan(0m).LessThan(100_000_000m);
        RuleFor(x => x.Grade).GreaterThanOrEqualTo(0m).LessThan(100_000_000m);
        RuleFor(x => x.DearnessAllowance).GreaterThanOrEqualTo(0m).LessThan(100_000_000m);
        RuleFor(x => x.OtherAllowance).GreaterThanOrEqualTo(0m).LessThan(100_000_000m);
        RuleFor(x => x.OtherDeduction).GreaterThanOrEqualTo(0m).LessThan(100_000_000m);
        RuleFor(x => x.CitContribution).GreaterThanOrEqualTo(0m).LessThan(100_000_000m);
        RuleFor(x => x.Notes).MaximumLength(SalaryStructure.NotesMaxLength);
    }
}
