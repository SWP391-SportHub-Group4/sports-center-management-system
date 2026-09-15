using SportHub.BuildingBlocks.SharedKernel.Exceptions;

namespace SportHub.Identity.Domain.Exceptions;

public sealed class EmailAlreadyExistsException()
    : DomainException("Email đã được sử dụng")
{
}
