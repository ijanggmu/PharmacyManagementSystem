using Finbuckle.MultiTenant.Abstractions;
using FSH.Framework.Shared.Multitenancy;
using FSH.Modules.Identity.Domain;
using FSH.Modules.Multitenancy.Contracts;
using FSH.Modules.Multitenancy.Domain;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace FSH.Starter.DbMigrator.DemoSeed;

/// <summary>
/// Dev-only (<c>seed-pharmacy-users</c> verb): creates one test user per pharmacy role in the
/// <c>demo-pharmacy</c> tenant, except the owner. Users only — no sales, medicines or other business data.
///
/// Users are created the same way the owner is (<see cref="UserManager{TUser}"/> on <see cref="FshUser"/>),
/// get the tenant's default branch as their <see cref="FshUser.CurrentBranchId"/>, and are assigned the
/// matching pharmacy role. Password comes from <c>Seed:DemoPassword</c> (never hard-coded here).
/// Idempotent: existing users are skipped (a missing branch is back-filled if one now exists).
/// </summary>
internal static class PharmacyUsersSeeder
{
    private const string TenantId = "demo-pharmacy";

    // Mirrors PharmacyRoleSeedData.Roles in Modules.Identity (internal, so not referenced directly).
    // Admin (the owner) is intentionally absent.
    // (Role, username/email local-part). Lowercase literals avoid CA1308 (ToLowerInvariant).
    private static readonly (string Role, string UserName)[] PharmacyRoles =
    [
        ("Manager", "manager"),
        ("Pharmacist", "pharmacist"),
        ("Cashier", "cashier"),
        ("Staff", "staff"),
    ];

    public static async Task<int> RunAsync(IServiceProvider services, IConfiguration configuration, IHostEnvironment environment)
    {
        ArgumentNullException.ThrowIfNull(services);
        ArgumentNullException.ThrowIfNull(configuration);
        ArgumentNullException.ThrowIfNull(environment);

        if (!environment.IsDevelopment())
        {
            await Console.Error.WriteLineAsync(
                $"[seed-pharmacy-users] REFUSING to run - environment is '{environment.EnvironmentName}'. "
                + "seed-pharmacy-users is dev-only by design.")
                .ConfigureAwait(false);
            return 1;
        }

        var password = configuration["Seed:DemoPassword"];
        if (string.IsNullOrWhiteSpace(password))
        {
            await Console.Error.WriteLineAsync(
                "[seed-pharmacy-users] REFUSING to run - Seed:DemoPassword is not configured.")
                .ConfigureAwait(false);
            return 1;
        }

        using var scope = services.CreateScope();
        var tenantStore = scope.ServiceProvider.GetRequiredService<IMultiTenantStore<AppTenantInfo>>();
        var tenant = await tenantStore.GetAsync(TenantId).ConfigureAwait(false);
        if (tenant is null)
        {
            await Console.Error.WriteLineAsync(
                $"[seed-pharmacy-users] tenant '{TenantId}' does not exist - run seed-pharmacy first.")
                .ConfigureAwait(false);
            return 1;
        }

        scope.ServiceProvider.GetRequiredService<IMultiTenantContextSetter>()
            .MultiTenantContext = new MultiTenantContext<AppTenantInfo>(tenant);

        var branchService = scope.ServiceProvider.GetRequiredService<IBranchService>();
        var defaultBranchId = await branchService.GetDefaultBranchIdAsync().ConfigureAwait(false);
        if (defaultBranchId is null)
        {
            await Console.Out.WriteLineAsync(
                $"[seed-pharmacy-users] WARN: tenant '{TenantId}' has no branch yet - users will have no current branch.")
                .ConfigureAwait(false);
        }

        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<FshUser>>();
        var failures = 0;

        foreach (var (role, userName) in PharmacyRoles)
        {
            var email = $"{userName}@{TenantId}.test";

            var user = await userManager.FindByEmailAsync(email).ConfigureAwait(false);
            if (user is null)
            {
                user = new FshUser
                {
                    UserName = userName,
                    Email = email,
                    EmailConfirmed = true,
                    FirstName = "Test",
                    LastName = role,
                    IsActive = true,
                    CreatedAtUtc = DateTime.UtcNow,
                    CurrentBranchId = defaultBranchId,
                };

                var created = await userManager.CreateAsync(user, password).ConfigureAwait(false);
                if (!created.Succeeded)
                {
                    failures++;
                    await Console.Error.WriteLineAsync(
                        $"[seed-pharmacy-users] FAILED to create '{email}': "
                        + string.Join("; ", created.Errors.Select(e => e.Description)))
                        .ConfigureAwait(false);
                    continue;
                }

                await Console.Out.WriteLineAsync($"[seed-pharmacy-users] created '{email}' ({role}).")
                    .ConfigureAwait(false);
            }
            else
            {
                if (user.CurrentBranchId is null && defaultBranchId is not null)
                {
                    user.CurrentBranchId = defaultBranchId;
                    var updated = await userManager.UpdateAsync(user).ConfigureAwait(false);
                    if (!updated.Succeeded)
                    {
                        failures++;
                        await Console.Error.WriteLineAsync(
                            $"[seed-pharmacy-users] FAILED to set branch for '{email}': "
                            + string.Join("; ", updated.Errors.Select(e => e.Description)))
                            .ConfigureAwait(false);
                        continue;
                    }
                }

                await Console.Out.WriteLineAsync($"[seed-pharmacy-users] '{email}' already exists - skipped.")
                    .ConfigureAwait(false);
            }

            if (!await userManager.IsInRoleAsync(user, role).ConfigureAwait(false))
            {
                var roleResult = await userManager.AddToRoleAsync(user, role).ConfigureAwait(false);
                if (!roleResult.Succeeded)
                {
                    failures++;
                    await Console.Error.WriteLineAsync(
                        $"[seed-pharmacy-users] FAILED to assign role '{role}' to '{email}': "
                        + string.Join("; ", roleResult.Errors.Select(e => e.Description)))
                        .ConfigureAwait(false);
                }
            }
        }

        return failures == 0 ? 0 : 1;
    }
}
