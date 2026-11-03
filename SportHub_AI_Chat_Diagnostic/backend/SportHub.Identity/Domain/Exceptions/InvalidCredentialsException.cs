using SportHub.BuildingBlocks.SharedKernel.Exceptions;

namespace SportHub.Identity.Domain.Exceptions;

public sealed class InvalidCredentialsException()
    : DomainException("Invalid email or password")
{
}
