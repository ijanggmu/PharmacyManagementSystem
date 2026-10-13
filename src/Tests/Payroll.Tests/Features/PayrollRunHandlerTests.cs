using Finbuckle.MultiTenant;
using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Framework.Shared.Multitenancy;
using FSH.Framework.Shared.Persistence;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Payroll.Contracts.Dtos;
using FSH.Modules.Payroll.Contracts.Events;
using FSH.Modules.Payroll.Contracts.v1;
using FSH.Modules.Payroll.Data;
using FSH.Modules.Payroll.Domain;
using FSH.Modules.Payroll.Features.v1.Employees;
using FSH.Modules.Payroll.Features.v1.Reports;
using FSH.Modules.Payroll.Features.v1.Runs;
using FSH.Modules.Payroll.Features.v1.Settings;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using NSubstitute;

namespace Payroll.Tests.Features;

/// <summary>The run lifecycle through the handlers over an InMemory context: create (computed lines), approve, post
/// (accrual event, balanced), pay (payment event), year-to-date carried into the next month, and the reports.</summary>
public sealed class PayrollRunHandlerTests : IDisposable
{
    private static readonly DateTime Now = new(2025, 8, 20, 6, 0, 0, DateTimeKind.Utc);

    private readonly PayrollDbContext _db = CreateContext();
    private readonly IBranchService _branches = Substitute.For<IBranchService>();
    private readonly ICurrentBranch _currentBranch = Substitute.For<ICurrentBranch>();
    private readonly ICurrentUser _user = Substitute.For<ICurrentUser>();
    private readonly IOutboxWriter _outbox = Substitute.For<IOutboxWriter>();
    private readonly TimeProvider _clock = new FixedClock(Now);
    private readonly Guid _branchId = Guid.CreateVersion7();

    public PayrollRunHandlerTests()
    {
        _branches.IsActiveBranchOfCurrentTenantAsync(_branchId, Arg.Any<CancellationToken>()).Returns(true);
        _user.Name.Returns("accountant@pharmacy");
        _user.GetTenant().Returns("test-tenant");
    }

    public void Dispose() => _db.Dispose();

    private static PayrollDbContext CreateContext()
    {
        var accessor = Substitute.For<IMultiTenantContextAccessor<AppTenantInfo>>();
        accessor.MultiTenantContext.Returns(new MultiTenantContext<AppTenantInfo>(new AppTenantInfo("test-tenant", "test-tenant")));
        var options = new DbContextOptionsBuilder<PayrollDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        var settings = Options.Create(new DatabaseOptions
        {
            Provider = "postgresql",
            ConnectionString = string.Empty,
            MigrationsAssembly = "FSH.Starter.Migrations.PostgreSQL",
        });
        var environment = Substitute.For<IHostEnvironment>();
        environment.EnvironmentName.Returns("Production");
        return new PayrollDbContext(accessor, options, settings, environment);
    }

    private async Task<Guid> HireAsync(string name, decimal basic, bool ssf, string marital, DateOnly joined, decimal cit = 0m)
    {
        var employee = await new CreateEmployeeCommandHandler(_db, _branches, _currentBranch, _clock).Handle(
            new CreateEmployeeCommand(name, _branchId, "Staff", joined, null, ssf ? "SSF-1" : null, ssf, "NIC Asia", "0011", marital),
            CancellationToken.None);
        await new AddSalaryStructureCommandHandler(_db, _currentBranch, _clock).Handle(
            new AddSalaryStructureCommand(employee.Id, new DateOnly(2025, 1, 1), basic, 0m, 0m, 0m, 0m, cit, null),
            CancellationToken.None);
        return employee.Id;
    }

    private CreatePayrollRunCommandHandler Create() =>
        new(_db, _branches, _currentBranch, _user, _clock, NullLogger<CreatePayrollRunCommandHandler>.Instance);

    private PostPayrollRunCommandHandler Post() =>
        new(_db, _outbox, _currentBranch, _user, _clock, NullLogger<PostPayrollRunCommandHandler>.Instance);

    private PayPayrollRunCommandHandler Pay() =>
        new(_db, _outbox, _currentBranch, _user, _clock, NullLogger<PayPayrollRunCommandHandler>.Instance);

    private async Task<PayrollRunDto> RunToPaidAsync(int bsYear, int bsMonth)
    {
        var run = await Create().Handle(new CreatePayrollRunCommand(_branchId, bsYear, bsMonth), CancellationToken.None);
        await new ApprovePayrollRunCommandHandler(_db, _currentBranch, _user, _clock).Handle(new ApprovePayrollRunCommand(run.Id), CancellationToken.None);
        await Post().Handle(new PostPayrollRunCommand(run.Id), CancellationToken.None);
        return await Pay().Handle(new PayPayrollRunCommand(run.Id, "bank"), CancellationToken.None);
    }

    [Fact]
    public async Task Lifecycle_Should_ComputeLines_And_PublishBalancedPostingThenPayment()
    {
        await HireAsync("Ram", 60_000m, ssf: true, PayrollMaritalStatus.Married, new DateOnly(2024, 1, 1), cit: 5_000m);
        await HireAsync("Sita", 100_000m, ssf: false, PayrollMaritalStatus.SinglePerson, new DateOnly(2024, 1, 1));

        var preview = await new PreviewPayrollRunQueryHandler(_db, _branches, _currentBranch)
            .Handle(new PreviewPayrollRunQuery(_branchId, 2082, 4), CancellationToken.None);
        preview.Lines.Count.ShouldBe(2);
        (await _db.Runs.CountAsync()).ShouldBe(0); // preview saves nothing

        var run = await Create().Handle(new CreatePayrollRunCommand(_branchId, 2082, 4), CancellationToken.None);
        run.Status.ShouldBe(PayrollRunStatuses.Draft);
        run.Totals.EmployeeCount.ShouldBe(2);
        run.Totals.Gross.ShouldBe(160_000m);
        run.Totals.EmployeeSsf.ShouldBe(6_600m);
        run.Totals.EmployerSsf.ShouldBe(12_000m);
        run.Totals.Net.ShouldBe(preview.Totals.Net);
        run.Lines.Single(l => l.EmployeeName == "Sita").Tds.ShouldBe(12_083.33m);

        await Should.ThrowAsync<CustomException>(() =>
            Post().Handle(new PostPayrollRunCommand(run.Id), CancellationToken.None).AsTask()); // not approved yet

        await new ApprovePayrollRunCommandHandler(_db, _currentBranch, _user, _clock).Handle(new ApprovePayrollRunCommand(run.Id), CancellationToken.None);
        var posted = await Post().Handle(new PostPayrollRunCommand(run.Id), CancellationToken.None);
        posted.Status.ShouldBe(PayrollRunStatuses.Posted);

        await _outbox.Received(1).AddAsync(
            Arg.Is<PayrollRunPostedIntegrationEvent>(e =>
                e.RunId == run.Id && e.BranchId == _branchId && e.TotalGross == 160_000m
                && e.TotalGross + e.TotalEmployerSsf
                   == e.TotalNet + e.TotalEmployeeSsf + e.TotalEmployerSsf + e.TotalTds + e.TotalCit + e.TotalOtherDeductions
                && e.PostingDateUtc == DateTime.SpecifyKind(run.PeriodEnd.ToDateTime(TimeOnly.MinValue), DateTimeKind.Utc)),
            Arg.Any<CancellationToken>());

        var paid = await Pay().Handle(new PayPayrollRunCommand(run.Id, "bank"), CancellationToken.None);
        paid.Status.ShouldBe(PayrollRunStatuses.Paid);
        await _outbox.Received(1).AddAsync(
            Arg.Is<PayrollRunPaidIntegrationEvent>(e => e.RunId == run.Id && e.Amount == run.Totals.Net && e.PaymentMethod == "bank"),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task NextMonth_Should_CarryYearToDate_From_RecordedRuns()
    {
        await HireAsync("Sita", 100_000m, ssf: false, PayrollMaritalStatus.SinglePerson, new DateOnly(2024, 1, 1));
        await RunToPaidAsync(2082, 4);

        // Raise from Bhadra: 150,000 for 11 months after one month at 100,000.
        var employeeId = await _db.Employees.Select(e => e.Id).SingleAsync();
        await new AddSalaryStructureCommandHandler(_db, _currentBranch, _clock).Handle(
            new AddSalaryStructureCommand(employeeId, new DateOnly(2025, 8, 1), 150_000m, 0m, 0m, 0m, 0m, 0m, "Raise"),
            CancellationToken.None);

        var bhadra = await Create().Handle(new CreatePayrollRunCommand(_branchId, 2082, 5), CancellationToken.None);

        // Year: 100,000 + 11 × 150,000 = 1,750,000 → 5,000 + 20,000 + 60,000 + 7.5L @30% = 225,000 → 310,000.
        var line = bhadra.Lines.Single();
        line.ProjectedAnnualIncome.ShouldBe(1_750_000m);
        line.AnnualTax.ShouldBe(310_000m);
        line.Tds.ShouldBe(Math.Round((310_000m - 12_083.33m) / 11m, 2, MidpointRounding.AwayFromZero));
    }

    [Fact]
    public async Task Create_Should_SkipEmployees_WithoutStructure_Or_NotYetJoined_And_ProrateJoiningMonth()
    {
        await HireAsync("Hari", 31_000m, ssf: false, PayrollMaritalStatus.SinglePerson, new DateOnly(2025, 8, 1)); // joins mid-Shrawan
        await HireAsync("Later", 31_000m, ssf: false, PayrollMaritalStatus.SinglePerson, new DateOnly(2026, 1, 1));
        await new CreateEmployeeCommandHandler(_db, _branches, _currentBranch, _clock).Handle(
            new CreateEmployeeCommand("NoPay", _branchId, null, new DateOnly(2024, 1, 1), null, null, false, null, null, PayrollMaritalStatus.SinglePerson),
            CancellationToken.None);

        var preview = await new PreviewPayrollRunQueryHandler(_db, _branches, _currentBranch)
            .Handle(new PreviewPayrollRunQuery(_branchId, 2082, 4), CancellationToken.None);

        preview.Skipped.Select(s => s.EmployeeName).ShouldBe(["Later", "NoPay"], ignoreOrder: true);
        var hari = preview.Lines.Single();
        hari.DaysWorked.ShouldBe(preview.PeriodEnd.DayNumber - new DateOnly(2025, 8, 1).DayNumber + 1);
        hari.DaysWorked.ShouldBeLessThan(hari.DaysInMonth);
        hari.Basic.ShouldBeLessThan(31_000m);
    }

    [Fact]
    public async Task Create_Should_Refuse_SecondRunForSameBranchAndMonth_And_DeleteOnlyDrafts()
    {
        await HireAsync("Sita", 50_000m, ssf: false, PayrollMaritalStatus.SinglePerson, new DateOnly(2024, 1, 1));
        var run = await Create().Handle(new CreatePayrollRunCommand(_branchId, 2082, 4), CancellationToken.None);

        await Should.ThrowAsync<CustomException>(() =>
            Create().Handle(new CreatePayrollRunCommand(_branchId, 2082, 4), CancellationToken.None).AsTask());

        var recalculated = await new RecalculatePayrollRunCommandHandler(_db, _currentBranch, _clock)
            .Handle(new RecalculatePayrollRunCommand(run.Id), CancellationToken.None);
        recalculated.Lines.Count.ShouldBe(1);

        await new ApprovePayrollRunCommandHandler(_db, _currentBranch, _user, _clock).Handle(new ApprovePayrollRunCommand(run.Id), CancellationToken.None);
        await Should.ThrowAsync<CustomException>(() =>
            new DeletePayrollRunCommandHandler(_db, _currentBranch).Handle(new DeletePayrollRunCommand(run.Id), CancellationToken.None).AsTask());
    }

    [Fact]
    public async Task Reports_Should_ListPostedRuns_SsfAndTds()
    {
        await HireAsync("Ram", 60_000m, ssf: true, PayrollMaritalStatus.Married, new DateOnly(2024, 1, 1));
        await HireAsync("Sita", 100_000m, ssf: false, PayrollMaritalStatus.SinglePerson, new DateOnly(2024, 1, 1));
        await RunToPaidAsync(2082, 4);

        var ssf = await new GetSsfReportQueryHandler(_db, _currentBranch).Handle(new GetSsfReportQuery(2082, 4), CancellationToken.None);
        ssf.Rows.Count.ShouldBe(1);
        ssf.TotalEmployeeSsf.ShouldBe(6_600m);
        ssf.TotalEmployerSsf.ShouldBe(12_000m);
        ssf.Total.ShouldBe(18_600m);

        var tds = await new GetSalaryTdsReportQueryHandler(_db, _currentBranch).Handle(new GetSalaryTdsReportQuery(2082, 4), CancellationToken.None);
        tds.Rows.Count.ShouldBe(2);
        tds.Rows.Single(r => r.EmployeeName == "Sita").Tds.ShouldBe(12_083.33m);
        tds.TotalTds.ShouldBe(tds.TotalSocialSecurityTax + tds.TotalIncomeTax);

        var runs = await new ListPayrollRunsQueryHandler(_db, _currentBranch).Handle(new ListPayrollRunsQuery(), CancellationToken.None);
        runs.Single().Totals.EmployeeCount.ShouldBe(2);
    }

    [Fact]
    public async Task Settings_Should_ReturnDefaults_Then_SaveEdits()
    {
        var defaults = await new GetPayrollSettingsQueryHandler(_db, _clock).Handle(new GetPayrollSettingsQuery(), CancellationToken.None);
        defaults.EmployeeSsfRatePercent.ShouldBe(11m);
        defaults.TaxSlabs.SingleSlabs[0].ShouldBe(new PayrollTaxBandDto(500_000m, 1m));
        defaults.TaxSlabs.SingleSlabs[^1].UpTo.ShouldBeNull();

        var saved = await new UpdatePayrollSettingsCommandHandler(_db, _clock)
            .Handle(new UpdatePayrollSettingsCommand(10m, 20m, 450_000m), CancellationToken.None);
        saved.EmployeeSsfRatePercent.ShouldBe(10m);
        (await _db.Settings.CountAsync()).ShouldBe(1);
    }

    private sealed class FixedClock(DateTime utc) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => new(utc);
    }
}
