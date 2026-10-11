using SportHub.AI.Application.DTOs.Manager;

namespace SportHub.AI.Application.Interfaces;

public interface IManagerScheduleContextBuilder
{
    Task<string> BuildAsync(
        Guid managerId,
        ManagerScheduleSuggestionRequest request,
        CancellationToken cancellationToken = default);
}