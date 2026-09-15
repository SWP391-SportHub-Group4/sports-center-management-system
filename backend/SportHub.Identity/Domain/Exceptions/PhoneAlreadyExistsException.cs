using SportHub.BuildingBlocks.SharedKernel.Exceptions;

namespace SportHub.Identity.Domain.Exceptions;

public sealed class PhoneAlreadyExistsException()
    : DomainException("Số điện thoại đã được sử dụng")
{
}
