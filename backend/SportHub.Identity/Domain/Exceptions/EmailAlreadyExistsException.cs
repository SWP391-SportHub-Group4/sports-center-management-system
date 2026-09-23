using SportHub.BuildingBlocks.SharedKernel.Exceptions;

namespace SportHub.Identity.Domain.Exceptions;

public sealed class EmailAlreadyExistsException()
    : DomainException("Email is already in use")
{
}
