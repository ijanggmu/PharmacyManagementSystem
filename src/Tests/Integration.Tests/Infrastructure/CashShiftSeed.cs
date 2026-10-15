using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Integration.Tests.Infrastructure;

/// <summary>
/// A cash sale needs an open cash shift at its branch (CashDrawerGuard). Tests that sell for cash open one
/// first, in its own scope, so a failed insert never stays tracked on the context the sale then uses.
/// </summary>
internal static class CashShiftSeed
{
    /// <summary>Opens a shift at <paramref name="branchId"/> unless one is open. The scope's tenant must be set.</summary>
    public static async Task EnsureOpenAsync(IServiceProvider scopedServices, Guid branchId)
    {
        var db = scopedServices.GetRequiredService<SalesDbContext>();
        if (await db.CashShifts.AnyAsync(s => s.Status == CashShiftStatus.Open && s.BranchId == branchId))
        {
            return;
        }

        db.CashShifts.Add(CashShift.Open(branchId, "integration-test", 1000m, null));
        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException)
        {
            // Another test opened one at the same branch first (one open shift per branch).
        }
    }
}
