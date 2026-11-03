using SportHub.AI.Application.DTOs.Manager;

namespace SportHub.AI.Application.Interfaces;

public interface IManagerScheduleSuggestionService
{
    Task<ManagerScheduleSuggestionResponse>
        SuggestAsync(
            Guid managerId,
            ManagerScheduleSuggestionRequest request,
            CancellationToken cancellationToken = default);
}