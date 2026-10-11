using System.Net;
using System.Security.Cryptography;
using FluentValidation;
using FSH.Framework.Core.Exceptions;
using FSH.Modules.Sales.Contracts.v1.Payments;
using FSH.Modules.Sales.Data;
using FSH.Modules.Sales.Domain;
using FSH.Modules.Sales.Services;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace FSH.Modules.Sales.Features.v1.Payments;

public sealed class CreateFonepayQrCommandHandler(SalesDbContext dbContext, PaymentSecrets secrets, IFonepayClient fonepay)
    : ICommandHandler<CreateFonepayQrCommand, FonepayQrDto>
{
    public async ValueTask<FonepayQrDto> Handle(CreateFonepayQrCommand command, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(command);

        var settings = await dbContext.PaymentSettings.AsNoTracking()
            .FirstOrDefaultAsync(cancellationToken)
            .ConfigureAwait(false);
        if (settings is null || !settings.IsFonepayConfigured)
        {
            throw new CustomException(
                "Fonepay dynamic QR is not set up. Add the merchant credentials in Settings → Payments.",
                Array.Empty<string>(),
                HttpStatusCode.Conflict);
        }

        decimal amount = Math.Round(command.Amount, 2, MidpointRounding.AwayFromZero);
        string prn = FonepayPrn.New();
        string remarks1 = string.IsNullOrWhiteSpace(command.Remarks1) ? "POS sale" : command.Remarks1.Trim();
        string remarks2 = string.IsNullOrWhiteSpace(command.Remarks2) ? prn : command.Remarks2.Trim();

        var result = await fonepay
            .CreateQrAsync(secrets.CredentialsFor(settings), prn, amount, remarks1, remarks2, cancellationToken)
            .ConfigureAwait(false);
        if (!result.Success)
        {
            throw new CustomException(
                result.Error ?? "Fonepay could not create the QR.",
                Array.Empty<string>(),
                HttpStatusCode.BadGateway);
        }

        var request = FonepayQrRequest.Create(prn, amount, settings.FonepayEnvironment);
        dbContext.FonepayQrRequests.Add(request);
        await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        return new FonepayQrDto(prn, result.QrMessage!, amount, result.WebSocketUrl, request.CreatedAtUtc);
    }
}

public sealed class CreateFonepayQrCommandValidator : AbstractValidator<CreateFonepayQrCommand>
{
    public CreateFonepayQrCommandValidator()
    {
        RuleFor(x => x.Amount).GreaterThan(0m).LessThanOrEqualTo(10_000_000m);
        RuleFor(x => x.Amount)
            .Must(a => decimal.Round(a, 2) == a)
            .WithMessage("Amount can have at most two decimal places.");
        RuleFor(x => x.Remarks1).MaximumLength(50);
        RuleFor(x => x.Remarks2).MaximumLength(50);
    }
}

public sealed class GetFonepayQrStatusQueryHandler(SalesDbContext dbContext, PaymentSecrets secrets, IFonepayClient fonepay)
    : IQueryHandler<GetFonepayQrStatusQuery, FonepayQrStatusDto>
{
    public async ValueTask<FonepayQrStatusDto> Handle(GetFonepayQrStatusQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);

        // Tenant-filtered: a PRN from another tenant is simply not found.
        var request = await dbContext.FonepayQrRequests
            .FirstOrDefaultAsync(r => r.Prn == query.Prn, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new NotFoundException($"Fonepay QR {query.Prn} not found.");

        if (request.Status == FonepayQrStatus.Pending)
        {
            var settings = await dbContext.PaymentSettings.AsNoTracking()
                .FirstOrDefaultAsync(cancellationToken)
                .ConfigureAwait(false);
            if (settings is not null && settings.IsFonepayConfigured)
            {
                var result = await fonepay
                    .GetStatusAsync(secrets.CredentialsFor(settings), request.Prn, cancellationToken)
                    .ConfigureAwait(false);
                if (result.Reached)
                {
                    request.RecordCheck(FonepayPrn.ParseStatus(result.PaymentStatus), result.TraceId, result.Error);
                    await dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
                }
                else
                {
                    // Gateway unreachable: report pending with the reason, try again on the next poll.
                    return new FonepayQrStatusDto(request.Prn, "pending", result.Error, request.TraceId);
                }
            }
        }

        return new FonepayQrStatusDto(
            request.Prn,
            FonepayPrn.StatusName(request.Status),
            request.Message,
            request.TraceId);
    }
}

public static class FonepayPrn
{
    /// <summary>"PC" + UTC yyMMddHHmmss + 6 random hex characters: unique, sortable, 20 characters.</summary>
    public static string New() =>
        $"PC{DateTime.UtcNow:yyMMddHHmmss}{Convert.ToHexString(RandomNumberGenerator.GetBytes(3))}";

    public static string StatusName(FonepayQrStatus status) => status switch
    {
        FonepayQrStatus.Success => "success",
        FonepayQrStatus.Failed => "failed",
        _ => "pending",
    };

    public static FonepayQrStatus ParseStatus(string? paymentStatus) => paymentStatus?.Trim().ToUpperInvariant() switch
    {
        "SUCCESS" or "PAID" or "COMPLETED" => FonepayQrStatus.Success,
        "FAILED" or "FAILURE" or "CANCELLED" or "EXPIRED" => FonepayQrStatus.Failed,
        _ => FonepayQrStatus.Pending,
    };
}
