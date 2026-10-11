using Shouldly;
using Xunit;

namespace Architecture.Tests;

/// <summary>
/// Guards the trash/restore class of cross-tenant leak: a bare <c>.IgnoreQueryFilters()</c> drops the
/// Finbuckle tenant filter together with the soft-delete filter, so a "show deleted rows" query in a
/// shared database returns (or mutates) every tenant's rows. Feature handlers in tenant-scoped modules
/// must use the named overload <c>.IgnoreQueryFilters([QueryFilters.SoftDelete])</c> instead.
/// Deliberately cross-tenant, root-only handlers are allowlisted by file name.
/// </summary>
public sealed class SoftDeleteFilterBypassTests
{
    private static readonly string[] ScopedModules = ["Files", "Chat", "Tickets"];

    /// <summary>Root-operator handlers that intentionally read across tenants (and re-apply soft-delete).</summary>
    private static readonly string[] Allowlist =
    [
        "GetTicketAcrossTenantsQueryHandlers.cs",
        "ListTicketsAcrossTenantsQueryHandler.cs",
    ];

    [Fact]
    public void Feature_Handlers_Should_Not_Use_Bare_IgnoreQueryFilters()
    {
        string modulesRoot = Path.Combine(ModuleArchitectureTestsFixture.SolutionRoot, "src", "Modules");
        if (!Directory.Exists(modulesRoot))
        {
            return;
        }

        var violations = new List<string>();
        foreach (string module in ScopedModules)
        {
            string featuresDir = Path.Combine(modulesRoot, module, $"Modules.{module}", "Features");
            if (!Directory.Exists(featuresDir))
            {
                continue;
            }

            foreach (string file in Directory.EnumerateFiles(featuresDir, "*.cs", SearchOption.AllDirectories))
            {
                if (Allowlist.Contains(Path.GetFileName(file), StringComparer.Ordinal))
                {
                    continue;
                }

                if (File.ReadAllText(file).Contains(".IgnoreQueryFilters()", StringComparison.Ordinal))
                {
                    violations.Add(Path.GetRelativePath(ModuleArchitectureTestsFixture.SolutionRoot, file));
                }
            }
        }

        violations.ShouldBeEmpty(
            "Use .IgnoreQueryFilters([QueryFilters.SoftDelete]) so the tenant filter stays on. Violations:\n  "
            + string.Join("\n  ", violations));
    }
}
