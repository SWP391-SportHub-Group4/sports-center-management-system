namespace SportHub.Scheduling.Threshold.Domain;

public enum ThresholdResponseChoice
{
    Refund,
    Transfer,
    // Keep the value already deployed by develop; waiting refunds and follows a new cohort instead.
    KeepPlace = 2,
    WaitNextCourse = 3
}
