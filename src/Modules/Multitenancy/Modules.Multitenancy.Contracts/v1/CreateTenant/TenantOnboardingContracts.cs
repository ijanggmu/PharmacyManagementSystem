using Mediator;

namespace FSH.Modules.Multitenancy.Contracts.v1.CreateTenant;

/// <summary>The tenant code a create with this name would get, and whether the name is still free.</summary>
public sealed record SuggestTenantCodeQuery(string? Name) : IQuery<TenantCodeSuggestionDto>;

public sealed record TenantCodeSuggestionDto(string Code, bool NameAvailable, string? NameMessage);

/// <summary>What the create-tenant success screen can offer (email needs mail settings on the server).</summary>
public sealed record GetTenantOnboardingOptionsQuery : IQuery<TenantOnboardingOptionsDto>;

/// <param name="WelcomeEmailAvailable">False until MailOptions (SMTP host + From, or a SendGrid key) is configured.</param>
public sealed record TenantOnboardingOptionsDto(bool WelcomeEmailAvailable);

/// <summary>
/// Emails the tenant's admin a PharmaCare welcome with the sign-in details. The password is the one the
/// operator just set at creation: it is used for this one email and never stored. The recipient is always
/// the tenant's admin email on record, not a caller-supplied address.
/// </summary>
public sealed record SendTenantWelcomeEmailCommand(string TenantId, string AdminPassword) : ICommand<Unit>;
