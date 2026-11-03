namespace SportHub.Scheduling.Application.Services;

internal static class ClassCancellationSessions
{
    public static (int Total, int Remaining) Count(IEnumerable<ClassSession> sessions)
    {
        var all = sessions.ToList();
        var originals = all.Where(s => !s.IsMakeup).ToList();
        var byId = all.ToDictionary(s => s.SessionId);
        var providedByMakeup = new HashSet<Guid>();
        foreach (var makeup in all.Where(s => s.IsMakeup && s.Status == ClassSessionStatus.Completed))
        {
            var source = makeup.RescheduledFromSessionId;
            var visited = new HashSet<Guid>();
            while (source is Guid id && visited.Add(id) && byId.TryGetValue(id, out var session))
            {
                if (!session.IsMakeup) { providedByMakeup.Add(id); break; }
                source = session.RescheduledFromSessionId;
            }
        }
        return (originals.Count, originals.Count(s => s.Status != ClassSessionStatus.Completed
            && !providedByMakeup.Contains(s.SessionId)));
    }
}
