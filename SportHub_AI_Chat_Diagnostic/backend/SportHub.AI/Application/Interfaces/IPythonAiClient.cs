using SportHub.AI.Application.DTOs.Manager;

namespace SportHub.AI.Application.Interfaces;

public interface IPythonAiClient
{
    Task<PythonManagerScheduleResponse>
        SuggestManagerScheduleAsync(
            ManagerSchedulePythonRequest request,
            CancellationToken cancellationToken = default);
}