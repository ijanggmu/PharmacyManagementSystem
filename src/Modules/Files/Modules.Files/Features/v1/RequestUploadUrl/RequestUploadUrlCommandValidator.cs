using FluentValidation;
using FSH.Modules.Files.Contracts.v1.Commands;
using FSH.Modules.Files.Services;

namespace FSH.Modules.Files.Features.v1.RequestUploadUrl;

public sealed class RequestUploadUrlCommandValidator : AbstractValidator<RequestUploadUrlCommand>
{
    public RequestUploadUrlCommandValidator()
    {
        RuleFor(x => x.OwnerType).NotEmpty().MaximumLength(64);
        RuleFor(x => x.FileName).NotEmpty().MaximumLength(260);
        RuleFor(x => x.ContentType).NotEmpty().MaximumLength(128);
        // The client picks the Content-Type that storage will serve back, so it must match the extension
        // (e.g. a ".pdf" declared as text/html would render as a page from the storage origin).
        RuleFor(x => x.ContentType)
            .Must((cmd, contentType) => FileContentTypes.IsAllowed(Path.GetExtension(cmd.FileName), contentType))
            .When(x => !string.IsNullOrWhiteSpace(x.FileName) && !string.IsNullOrWhiteSpace(x.ContentType))
            .WithMessage(x => $"Content type '{x.ContentType}' does not match the file extension '{Path.GetExtension(x.FileName)}'.");
        RuleFor(x => x.SizeBytes).GreaterThan(0);
        RuleFor(x => x.Category).NotEmpty();
        RuleFor(x => x.Visibility).IsInEnum();
    }
}
