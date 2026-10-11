using FSH.Framework.Web.Modules;

namespace FSH.Modules.Identity;

public sealed class IdentityModuleConstants : IModuleConstants
{
    public string ModuleId => "Identity";

    public string ModuleName => "Identity";

    public string ApiPrefix => "identity";
    public const string SchemaName = "identity";
    public const int PasswordLength = 10;

    /// <summary>
    /// How long the immediately-previous refresh token of a session stays valid after it was rotated.
    /// Covers concurrent refreshes (two tabs / a proxy and a page racing on the same token): the loser
    /// presents the just-rotated token and still gets a fresh pair instead of a forced logout.
    /// </summary>
    public static readonly TimeSpan RefreshTokenReuseGrace = TimeSpan.FromSeconds(30);
}