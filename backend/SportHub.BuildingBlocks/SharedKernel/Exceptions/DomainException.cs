namespace SportHub.BuildingBlocks.SharedKernel.Exceptions;

public abstract class DomainException(string message) : Exception(message)
{
}
