Requires SportHub_Flow6_Bilingual_Cases_Patch (120 cases). Only modifies Program.cs.
Default interval is 12 seconds between starts of .NET provider calls. Override with
--min-call-interval-seconds 0..60. The delay applies across cases and both role calls.
On rate limit, current case INFRA_ERROR and remaining selected cases NOT_RUN.
--resume-from PATH selects INFRA_ERROR and NOT_RUN IDs from one previous report;
use --role and --group as needed. Completed cases are not merged into new reports.
FAIL is not automatically retried. Resume from the latest report containing the
remaining cases, or choose an earlier report to retry its uncompleted cases again.
This limits .NET provider calls, not internal Python fallback HTTP requests or other
users/processes. It does not promise compliance with Google RPM/TPM/RPD.
No live API calls or .NET build were run in this environment.
