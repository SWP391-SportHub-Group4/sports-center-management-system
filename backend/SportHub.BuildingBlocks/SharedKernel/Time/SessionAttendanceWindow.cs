namespace SportHub.BuildingBlocks.SharedKernel.Time;

public static class SessionAttendanceWindow
{
    public static readonly TimeSpan EarlyWindow = TimeSpan.FromMinutes(5);
    public static readonly TimeSpan CorrectionWindow = TimeSpan.FromHours(24);
    public static DateTime OpensAt(DateTime startAtUtc) => startAtUtc - EarlyWindow;
    public static DateTime ClosesAt(DateTime endAtUtc) => endAtUtc + CorrectionWindow;
}
