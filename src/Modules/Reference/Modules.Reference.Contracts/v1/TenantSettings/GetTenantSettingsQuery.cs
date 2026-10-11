using Mediator;

namespace FSH.Modules.Reference.Contracts.v1.TenantSettings;

/// <summary>
/// All tenant setting key/value pairs. <see cref="Category"/> optionally narrows them to one group:
/// a setting's category is the part of its key before the first '.' (<c>pharmacy.receipt_footer</c> is
/// in <c>pharmacy</c>); a key with no '.' is in <c>general</c>. Matching ignores case.
/// </summary>
public sealed record GetTenantSettingsQuery(string? Category = null) : IQuery<Dictionary<string, string>>;
