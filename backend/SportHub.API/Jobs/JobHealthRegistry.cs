using System.Collections.Concurrent;

namespace SportHub.API.Jobs;

/// <summary>
/// In-process record of what each background job last did, so a job that silently stopped (crashed loop, stuck run) is visible
/// to the manager instead of only in logs. Held in memory: it resets on restart, which the health report says explicitly.
/// </summary>
public sealed class JobHealthRegistry
{
    private readonly ConcurrentDictionary<string, JobState> jobs = new();
    public DateTime StartedAtUtc { get; } = DateTime.UtcNow;

    public void Register(string name, TimeSpan interval)
        => jobs.GetOrAdd(name, _ => new JobState { Name = name, Interval = interval });

    public void RunStarted(string name)
    {
        if (jobs.TryGetValue(name, out var state)) lock (state) state.RunningSinceUtc = DateTime.UtcNow;
    }

    public void RunSucceeded(string name)
    {
        if (!jobs.TryGetValue(name, out var state)) return;
        lock (state)
        {
            state.LastSuccessUtc = DateTime.UtcNow;
            state.RunningSinceUtc = null;
            state.ConsecutiveFailures = 0;
            state.RunCount++;
        }
    }

    public void RunFailed(string name, Exception ex)
    {
        if (!jobs.TryGetValue(name, out var state)) return;
        lock (state)
        {
            state.LastFailureUtc = DateTime.UtcNow;
            state.LastError = ex.GetType().Name + ": " + (ex.Message.Length > 300 ? ex.Message[..300] : ex.Message);
            state.RunningSinceUtc = null;
            state.ConsecutiveFailures++;
            state.RunCount++;
        }
    }

    public IReadOnlyList<JobSnapshot> Snapshot(DateTime nowUtc)
        => jobs.Values.OrderBy(x => x.Name).Select(state =>
        {
            lock (state)
            {
                // Silent for three intervals (or running far longer than one) means the loop is not making progress.
                var reference = state.LastSuccessUtc ?? StartedAtUtc;
                var overdue = nowUtc - reference > state.Interval * 3 + TimeSpan.FromSeconds(30);
                var stuck = state.RunningSinceUtc is DateTime since && nowUtc - since > state.Interval * 3 + TimeSpan.FromMinutes(1);
                return new JobSnapshot(state.Name, (int)state.Interval.TotalSeconds, state.LastSuccessUtc, state.LastFailureUtc,
                    state.LastError, state.ConsecutiveFailures, state.RunCount, state.RunningSinceUtc,
                    overdue || stuck || state.ConsecutiveFailures >= 3);
            }
        }).ToList();

    private sealed class JobState
    {
        public string Name { get; init; } = string.Empty;
        public TimeSpan Interval { get; init; }
        public DateTime? LastSuccessUtc { get; set; }
        public DateTime? LastFailureUtc { get; set; }
        public string? LastError { get; set; }
        public int ConsecutiveFailures { get; set; }
        public long RunCount { get; set; }
        public DateTime? RunningSinceUtc { get; set; }
    }
}

public sealed record JobSnapshot(string Name, int IntervalSeconds, DateTime? LastSuccessUtc, DateTime? LastFailureUtc,
    string? LastError, int ConsecutiveFailures, long RunCount, DateTime? RunningSinceUtc, bool Unhealthy);
