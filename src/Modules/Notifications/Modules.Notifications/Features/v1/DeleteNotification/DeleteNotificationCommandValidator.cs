using FluentValidation;
using FSH.Modules.Notifications.Contracts.v1.Commands;

namespace FSH.Modules.Notifications.Features.v1.DeleteNotification;

public sealed class DeleteNotificationCommandValidator : AbstractValidator<DeleteNotificationCommand>
{
    public DeleteNotificationCommandValidator()
    {
        RuleFor(x => x.NotificationId).NotEmpty();
    }
}
