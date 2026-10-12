using FSH.Framework.Core.Context;
using FSH.Framework.Core.Exceptions;
using FSH.Framework.Eventing.Abstractions;
using FSH.Modules.Customers.Contracts.v1.Customers;
using FSH.Modules.Customers.Data;
using FSH.Modules.Customers.Domain;
using FSH.Modules.Customers.Features.v1.Customers.CreateCustomer;
using FSH.Modules.Customers.Features.v1.Customers.GetCustomerByCode;
using FSH.Modules.Customers.Features.v1.Customers.GetCustomerById;
using FSH.Modules.Customers.Features.v1.Customers.GetCustomerCreditStatus;
using FSH.Modules.Customers.Features.v1.Customers.UpdateCustomer;
using FSH.Modules.Customers.Services;
using FSH.Modules.Multitenancy.Contracts;
using NSubstitute;

namespace Customers.Tests.Features;

/// <summary>Customer numbers (card codes) and credit limits.</summary>
public sealed class CustomerCodeAndCreditTests : IDisposable
{
    private readonly CustomersDbContext _db = CustomersDbContextFactory.Create();

    [Fact]
    public void CustomerCodeService_Should_Format_Six_Digit_Numbers() =>
        CustomerCodeService.Format(123).ShouldBe("C-000123");

    [Fact]
    public async Task Create_Should_Assign_The_Next_Code_And_The_Credit_Limit()
    {
        var codes = Substitute.For<ICustomerCodeService>();
        codes.NextAsync(Arg.Any<CancellationToken>()).Returns("C-000042");

        var id = await new CreateCustomerCommandHandler(_db, codes, Substitute.For<ICustomerCreditPermissionGuard>(), Substitute.For<IOutboxWriter>(), Substitute.For<ICurrentUser>(), Substitute.For<ICurrentBranch>())
            .Handle(new CreateCustomerCommand("Sita Rai", CreditLimit: 5000m), CancellationToken.None);

        var dto = await new GetCustomerByIdQueryHandler(_db).Handle(new GetCustomerByIdQuery(id), CancellationToken.None);
        dto.Code.ShouldBe("C-000042");
        dto.CreditLimit.ShouldBe(5000m);
        dto.AvailableCredit.ShouldBe(5000m);
    }

    [Fact]
    public async Task GetByCode_Should_Ignore_Case_And_Spaces()
    {
        var customer = await SeedAsync("C-000007", balance: 0m);

        var dto = await new GetCustomerByCodeQueryHandler(_db).Handle(new GetCustomerByCodeQuery(" c-000007 "), CancellationToken.None);

        dto.Id.ShouldBe(customer.Id);
    }

    [Fact]
    public async Task GetByCode_Should_404_For_An_Unknown_Code()
    {
        await Should.ThrowAsync<NotFoundException>(() =>
            new GetCustomerByCodeQueryHandler(_db).Handle(new GetCustomerByCodeQuery("C-999999"), CancellationToken.None).AsTask());
    }

    [Fact]
    public async Task Update_Should_Keep_Set_And_Clear_The_Credit_Limit()
    {
        var customer = await SeedAsync("C-000001", balance: 0m, creditLimit: 1000m);
        var sut = new UpdateCustomerCommandHandler(_db, Substitute.For<ICustomerCreditPermissionGuard>());

        await sut.Handle(new UpdateCustomerCommand(customer.Id, "Ram"), CancellationToken.None);
        customer.CreditLimit.ShouldBe(1000m);

        await sut.Handle(new UpdateCustomerCommand(customer.Id, "Ram", CreditLimit: 2500m), CancellationToken.None);
        customer.CreditLimit.ShouldBe(2500m);

        await sut.Handle(new UpdateCustomerCommand(customer.Id, "Ram", ClearCreditLimit: true), CancellationToken.None);
        customer.CreditLimit.ShouldBeNull();
    }

    [Fact]
    public async Task CreditStatus_Should_Report_Balance_And_Limit()
    {
        var customer = await SeedAsync("C-000003", balance: 300m, creditLimit: 1000m);

        var status = await new GetCustomerCreditStatusQueryHandler(_db)
            .Handle(new GetCustomerCreditStatusQuery(customer.Id), CancellationToken.None);

        status.ShouldNotBeNull();
        status!.CurrentBalance.ShouldBe(300m);
        status.CreditLimit.ShouldBe(1000m);
        customer.AvailableCredit.ShouldBe(700m);
    }

    [Fact]
    public void Negative_Credit_Limit_Should_Be_Rejected() =>
        Should.Throw<ArgumentOutOfRangeException>(() => Customer.Create("Ram", null, null, null, 0m, "C-000001", creditLimit: -1m));

    private async Task<Customer> SeedAsync(string code, decimal balance, decimal? creditLimit = null)
    {
        var customer = Customer.Create("Ram", null, null, null, balance, code, creditLimit);
        _db.Customers.Add(customer);
        await _db.SaveChangesAsync();
        return customer;
    }

    public void Dispose() => _db.Dispose();
}
