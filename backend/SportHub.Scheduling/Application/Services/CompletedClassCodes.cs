namespace SportHub.Scheduling.Application.Services;

/// <summary>Archive completed codes using the last delivered session's Vietnam date.</summary>
public static class CompletedClassCodes
{
    public const string ArchiveSql = """
        WITH completed_codes AS (
            SELECT c.class_id,
                regexp_replace(c.code, ' Complete [0-9][0-9]/[0-9][0-9]/[0-9][0-9]$', '', 'i')
                || ' Complete '
                || to_char(max(s.end_at_utc) AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM/YY') AS code
            FROM classes c
            JOIN class_sessions s ON s.class_id = c.class_id AND s.status = 1
            WHERE c.status = 3
            GROUP BY c.class_id, c.code
        )
        UPDATE classes c SET code = completed_codes.code, version = c.version + 1
        FROM completed_codes
        WHERE c.class_id = completed_codes.class_id AND c.code <> completed_codes.code;
        """;
}
