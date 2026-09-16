using SportHub.BuildingBlocks.SharedKernel.Exceptions;

namespace SportHub.Identity.Domain.Exceptions;

public sealed class PhoneAlreadyExistsException()
    : DomainException("Phone number is already in use")
{
}
