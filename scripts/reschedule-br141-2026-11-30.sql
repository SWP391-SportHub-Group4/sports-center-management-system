\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
LOCK TABLE classes, class_sessions, class_schedule_rules, room_occupancies,
    coach_occupancies IN SHARE ROW EXCLUSIVE MODE;

-- One-time local demo reset. All four first lessons are on Monday 30 November;
-- the 02 cohorts move from Tue/Thu/Sat to Mon/Wed/Fri at 14:00.
CREATE TEMP TABLE br141_new_schedule ON COMMIT DROP AS
SELECT c.class_id, c.code, s.session_id, s.session_no, s.room_id, s.coach_id,
    (
        timestamp '2026-11-30 00:00:00'
        + ((s.session_no - 1) / 3 * 7
            + CASE (s.session_no - 1) % 3 WHEN 0 THEN 0 WHEN 1 THEN 2 ELSE 4 END)
            * interval '1 day'
        + CASE WHEN right(c.code, 2) = '01' THEN interval '7 hours'
            ELSE interval '14 hours' END
    ) AT TIME ZONE 'Asia/Ho_Chi_Minh' AS new_start
FROM classes c
JOIN class_sessions s ON s.class_id = c.class_id
WHERE c.code IN ('BR141-BONGRO-01', 'BR141-BONGRO-02',
                 'BR141-CAULONG-01', 'BR141-CAULONG-02');

DO $$
BEGIN
    IF (SELECT count(*) FROM br141_new_schedule) <> 48
        OR EXISTS (SELECT 1 FROM br141_new_schedule GROUP BY class_id HAVING count(*) <> 12)
        OR (SELECT count(DISTINCT class_id) FROM br141_new_schedule) <> 4 THEN
        RAISE EXCEPTION 'Expected exactly four BR-141 classes with 12 lessons each';
    END IF;
    IF EXISTS (
        SELECT 1 FROM classes c JOIN br141_new_schedule n ON n.class_id = c.class_id
        WHERE c.start_date >= date '2026-11-30' OR c.status NOT IN (1, 2)
    ) THEN
        RAISE EXCEPTION 'BR-141 classes have already moved or changed state';
    END IF;
    IF EXISTS (
        SELECT 1 FROM class_sessions s JOIN br141_new_schedule n ON n.session_id = s.session_id
        WHERE s.status NOT IN (0, 1) OR s.room_id <> (SELECT default_room_id FROM classes WHERE class_id = n.class_id)
    ) THEN
        RAISE EXCEPTION 'A BR-141 lesson was cancelled or changed room';
    END IF;
    IF EXISTS (SELECT 1 FROM enrollments e JOIN br141_new_schedule n ON n.class_id = e.class_id WHERE e.status = 0)
        OR EXISTS (SELECT 1 FROM seat_holds h JOIN br141_new_schedule n ON n.class_id = h.class_id)
        OR EXISTS (SELECT 1 FROM attendances a JOIN br141_new_schedule n ON n.session_id = a.session_id)
        OR EXISTS (SELECT 1 FROM class_teaching_records r JOIN br141_new_schedule n ON n.class_id = r.class_id)
        OR EXISTS (SELECT 1 FROM class_session_change_requests r JOIN br141_new_schedule n ON n.session_id = r.session_id)
        OR EXISTS (SELECT 1 FROM class_threshold_responses r JOIN br141_new_schedule n ON n.class_id = r.class_id)
        OR EXISTS (SELECT 1 FROM checkout_sessions x JOIN br141_new_schedule n ON n.class_id = x.class_id)
        OR EXISTS (SELECT 1 FROM invoice_items i JOIN br141_new_schedule n ON n.class_id = i.class_id) THEN
        RAISE EXCEPTION 'BR-141 has active or historical dependent data that needs manual review';
    END IF;
    IF EXISTS (
        SELECT 1 FROM br141_new_schedule n
        JOIN br141_new_schedule other ON n.session_id < other.session_id
            AND n.new_start < other.new_start + interval '2 hours'
            AND other.new_start < n.new_start + interval '2 hours'
            AND (n.room_id = other.room_id OR n.coach_id = other.coach_id)
    ) OR EXISTS (
        SELECT 1 FROM br141_new_schedule n JOIN room_occupancies o
            ON o.room_id = n.room_id AND o.is_active
            AND o.start_at_utc < n.new_start + interval '2 hours'
            AND n.new_start < o.end_at_utc
        WHERE o.source_id NOT IN (SELECT session_id FROM br141_new_schedule)
    ) OR EXISTS (
        SELECT 1 FROM br141_new_schedule n JOIN coach_occupancies o
            ON o.coach_id = n.coach_id AND o.is_active
            AND o.start_at_utc < n.new_start + interval '2 hours'
            AND n.new_start < o.end_at_utc
        WHERE o.source_id NOT IN (SELECT session_id FROM br141_new_schedule)
    ) OR EXISTS (
        SELECT 1 FROM br141_new_schedule n JOIN room_blocks b ON b.room_id = n.room_id
        WHERE b.start_at_utc < n.new_start + interval '2 hours' AND n.new_start < b.end_at_utc
    ) THEN
        RAISE EXCEPTION 'The new BR-141 schedule conflicts with a room or coach booking';
    END IF;
    IF EXISTS (
        SELECT 1 FROM br141_new_schedule n WHERE NOT EXISTS (
            SELECT 1 FROM room_opening_hours h WHERE h.room_id = n.room_id
                AND h.day_of_week = extract(dow FROM n.new_start AT TIME ZONE 'Asia/Ho_Chi_Minh')
                AND h.open_time_local <= (n.new_start AT TIME ZONE 'Asia/Ho_Chi_Minh')::time
                AND h.close_time_local >= ((n.new_start + interval '2 hours') AT TIME ZONE 'Asia/Ho_Chi_Minh')::time
        )
    ) THEN
        RAISE EXCEPTION 'A new BR-141 lesson falls outside room opening hours';
    END IF;
END $$;

UPDATE class_schedule_rules r
SET day_of_week = CASE r.day_of_week WHEN 2 THEN 1 WHEN 4 THEN 3 WHEN 6 THEN 5 END
FROM classes c
WHERE c.class_id = r.class_id
    AND c.code IN ('BR141-BONGRO-02', 'BR141-CAULONG-02');

UPDATE class_sessions s
SET start_at_utc = n.new_start, end_at_utc = n.new_start + interval '2 hours', status = 0
FROM br141_new_schedule n WHERE n.session_id = s.session_id;

UPDATE room_occupancies o
SET start_at_utc = n.new_start, end_at_utc = n.new_start + interval '2 hours'
FROM br141_new_schedule n WHERE n.session_id = o.source_id;

UPDATE coach_occupancies o
SET start_at_utc = n.new_start, end_at_utc = n.new_start + interval '2 hours'
FROM br141_new_schedule n WHERE n.session_id = o.source_id;

UPDATE classes c
SET start_date = date '2026-11-30', status = 1, enrollment_open = true,
    threshold_status = 0,
    threshold_deadline_utc = firsts.first_start - interval '3 days 10 minutes',
    threshold_response_deadline_utc = NULL,
    enrollment_closed_at_utc = NULL, enrollment_closed_reason = NULL,
    version = c.version + 1
FROM (SELECT class_id, min(new_start) AS first_start FROM br141_new_schedule GROUP BY class_id) firsts
WHERE c.class_id = firsts.class_id;

SELECT c.code, c.start_date, c.status, c.enrollment_open,
    count(s.session_id) AS sessions,
    min(s.start_at_utc AT TIME ZONE 'Asia/Ho_Chi_Minh') AS first_local,
    max(s.end_at_utc AT TIME ZONE 'Asia/Ho_Chi_Minh') AS last_local
FROM classes c JOIN class_sessions s ON s.class_id = c.class_id
WHERE c.code IN ('BR141-BONGRO-01', 'BR141-BONGRO-02',
                 'BR141-CAULONG-01', 'BR141-CAULONG-02')
GROUP BY c.class_id ORDER BY c.code;

\if :{?apply}
COMMIT;
\else
ROLLBACK;
\endif
