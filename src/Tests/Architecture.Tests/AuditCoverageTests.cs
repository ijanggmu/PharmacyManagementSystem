using System.Text;
using System.Text.RegularExpressions;
using Shouldly;
using Xunit;

namespace Architecture.Tests;

/// <summary>
/// Architecture-style audit coverage check, in the same source-scanning style as <c>ApiVersioningTests</c>.
///
/// Coverage model (see .agents/rules/modules/auditing.md):
/// <list type="bullet">
/// <item><b>HTTP activity</b>: <c>AuditHttpMiddleware</c> is registered once in <c>AuditingModule.ConfigureMiddleware</c>
/// and wraps every request in the pipeline, so every mutating endpoint gets an activity record unless it is under
/// <c>ExcludePathStartsWith</c> or opted out with <c>[NoAudit]</c>.</item>
/// <item><b>Entity changes via SaveChanges</b>: <c>AuditingSaveChangesInterceptor</c> is attached to every context
/// created by <c>AddHeroDbContext</c> (BuildingBlocks), so a module's context is covered when its module registers
/// one through <c>AddHeroDbContext</c>.</item>
/// <item><b>Set-based writes (ExecuteUpdate / ExecuteDelete / raw SQL)</b>: these bypass SaveChanges. They are
/// covered by <c>BulkMutationAuditInterceptor</c>, attached centrally by the open-generic
/// <c>IDbContextOptionsConfiguration&lt;&gt;</c> registration in <c>AuditingModule</c>.</item>
/// </list>
/// </summary>
public sealed partial class AuditCoverageTests
{
    private static readonly string ModulesRoot = Path.Combine(ModuleArchitectureTestsFixture.SolutionRoot, "src", "Modules");
    private static readonly string AuditingModuleFile = Path.Combine(ModulesRoot, "Auditing", "Modules.Auditing", "AuditingModule.cs");

    [GeneratedRegex(@"\.Map(Post|Put|Patch|Delete)\(")]
    private static partial Regex MutatingEndpointRegex();

    [GeneratedRegex(@"\bExecute(Update|Delete)(Async)?\(")]
    private static partial Regex BulkMutationRegex();

    [Fact]
    public void Mutating_Endpoints_Should_Not_Opt_Out_Of_Audit()
    {
        var violations = new List<string>();

        foreach (var file in ModuleSourceFiles())
        {
            string text = File.ReadAllText(file);
            if (MutatingEndpointRegex().IsMatch(text) && text.Contains("NoAudit", StringComparison.Ordinal))
            {
                violations.Add(Relative(file));
            }
        }

        violations.ShouldBeEmpty(
            "Mutating endpoints must produce an audit record. Remove [NoAudit] / .NoAudit() from: " +
            string.Join(", ", violations));
    }

    [Fact]
    public void Modules_With_Mutating_Endpoints_Should_Register_A_DbContext_Through_AddHeroDbContext()
    {
        var matrix = BuildMatrix();
        var uncovered = matrix
            .Where(row => row.MutatingEndpoints > 0 && !row.HasAddHeroDbContext)
            .Select(row => row.Module)
            .ToList();

        uncovered.ShouldBeEmpty(
            "Modules with mutating endpoints must register their DbContext via AddHeroDbContext so the " +
            "AuditingSaveChangesInterceptor is attached. Matrix:\n" + FormatMatrix(matrix) +
            "\nUncovered: " + string.Join(", ", uncovered));
    }

    [Fact]
    public void Auditing_Should_Attach_Bulk_Mutation_Interceptor_Centrally_To_All_DbContexts()
    {
        string text = File.ReadAllText(AuditingModuleFile);

        text.ShouldContain("typeof(IDbContextOptionsConfiguration<>)",
            customMessage: "AuditingModule must register an open-generic IDbContextOptionsConfiguration<> so every " +
                           "DbContext gets the bulk-mutation interceptor (ExecuteUpdate/ExecuteDelete bypass SaveChanges).");
        text.ShouldContain("typeof(BulkMutationAuditOptionsConfiguration<>)",
            customMessage: "AuditingModule must register BulkMutationAuditOptionsConfiguration<> as that open generic.");
    }

    [Fact]
    public void Auditing_Should_Record_Http_Activity_For_All_Requests_And_Entity_Changes_On_SaveChanges()
    {
        string text = File.ReadAllText(AuditingModuleFile);

        text.ShouldContain("app.UseMiddleware<AuditHttpMiddleware>()",
            customMessage: "AuditHttpMiddleware must be registered in ConfigureMiddleware to audit HTTP activity globally.");
        text.ShouldContain("ISaveChangesInterceptor, AuditingSaveChangesInterceptor>",
            customMessage: "AuditingSaveChangesInterceptor must be registered to audit entity changes on SaveChanges.");
    }

    [Fact]
    public void Coverage_Matrix_Should_Be_Reported()
    {
        // Always passes; it exists so the matrix is produced by the test suite and can be read from the report.
        var matrix = BuildMatrix();
        matrix.ShouldNotBeEmpty(FormatMatrix(matrix));
    }

    private static List<MatrixRow> BuildMatrix()
    {
        bool centralBulkRegistered = File.ReadAllText(AuditingModuleFile)
            .Contains("typeof(BulkMutationAuditOptionsConfiguration<>)", StringComparison.Ordinal);

        var rows = new List<MatrixRow>();
        foreach (var moduleDir in Directory.GetDirectories(ModulesRoot).OrderBy(d => d, StringComparer.Ordinal))
        {
            string name = Path.GetFileName(moduleDir);
            string runtime = Path.Combine(moduleDir, "Modules." + name);
            if (!Directory.Exists(runtime))
            {
                continue;
            }

            var files = SourceFiles(runtime).ToArray();
            int mutating = files.Sum(f => MutatingEndpointRegex().Count(File.ReadAllText(f)));
            bool addHeroDbContext = files.Any(f => File.ReadAllText(f).Contains("AddHeroDbContext<", StringComparison.Ordinal));
            int bulkSites = files.Sum(f => BulkMutationRegex().Count(File.ReadAllText(f)));

            rows.Add(new MatrixRow(
                Module: name,
                MutatingEndpoints: mutating,
                HasAddHeroDbContext: addHeroDbContext,
                EntityAuditViaSaveChanges: addHeroDbContext,
                BulkMutationSites: bulkSites,
                BulkMutationAudited: addHeroDbContext && centralBulkRegistered));
        }

        return rows;
    }

    private static string FormatMatrix(IEnumerable<MatrixRow> rows)
    {
        var sb = new StringBuilder();
        sb.AppendLine("Module | MutatingEndpoints | EntityAudit(SaveChanges) | BulkSites | BulkAudited");
        foreach (var row in rows)
        {
            sb.Append(row.Module).Append(" | ")
                .Append(row.MutatingEndpoints).Append(" | ")
                .Append(row.EntityAuditViaSaveChanges ? "yes" : "NO").Append(" | ")
                .Append(row.BulkMutationSites).Append(" | ")
                .Append(BulkStatus(row))
                .AppendLine();
        }

        return sb.ToString();
    }

    private static string BulkStatus(MatrixRow row)
    {
        if (row.BulkMutationSites == 0)
        {
            return "n/a";
        }

        return row.BulkMutationAudited ? "yes" : "NO";
    }

    private static IEnumerable<string> ModuleSourceFiles() =>
        Directory.GetDirectories(ModulesRoot)
            .Select(moduleDir => Path.Combine(moduleDir, "Modules." + Path.GetFileName(moduleDir)))
            .Where(Directory.Exists)
            .SelectMany(SourceFiles);

    private static IEnumerable<string> SourceFiles(string root) =>
        Directory.EnumerateFiles(root, "*.cs", SearchOption.AllDirectories)
            .Where(f => !f.Contains($"{Path.DirectorySeparatorChar}obj{Path.DirectorySeparatorChar}", StringComparison.OrdinalIgnoreCase)
                     && !f.Contains($"{Path.DirectorySeparatorChar}bin{Path.DirectorySeparatorChar}", StringComparison.OrdinalIgnoreCase));

    private static string Relative(string file) => Path.GetRelativePath(ModuleArchitectureTestsFixture.SolutionRoot, file);

    private sealed record MatrixRow(
        string Module,
        int MutatingEndpoints,
        bool HasAddHeroDbContext,
        bool EntityAuditViaSaveChanges,
        int BulkMutationSites,
        bool BulkMutationAudited);
}
