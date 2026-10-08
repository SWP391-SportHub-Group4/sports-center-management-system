-- Gỡ dữ liệu do seed-member-pages-demo.sql tạo cho an.member@sporthub.vn. Không đụng bốn lớp BR-141.
BEGIN;

DO $$
DECLARE
    an uuid := (SELECT user_id FROM user_accounts WHERE email = 'an.member@sporthub.vn');
    demo_classes int[] := ARRAY(SELECT class_id FROM classes WHERE code LIKE 'DEMO3P-%');
BEGIN
    -- Lượt thuê sân và buổi PT của An
    DELETE FROM room_occupancies WHERE source_id IN (SELECT court_rental_id FROM court_rentals WHERE member_id = an)
                                     OR source_id IN (SELECT session_id FROM pt_sessions WHERE member_id = an);
    DELETE FROM coach_occupancies WHERE source_id IN (SELECT session_id FROM pt_sessions WHERE member_id = an);
    DELETE FROM court_rentals WHERE member_id = an;
    DELETE FROM pt_sessions WHERE member_id = an;
    DELETE FROM pt_entitlements WHERE member_id = an;
    DELETE FROM member_packages WHERE member_id = an;
    DELETE FROM coach_member_relationships WHERE member_id = an;

    -- Ghi danh của An (kể cả hai ghi danh vào lớp BR-141) và hai lớp phụ
    DELETE FROM attendances WHERE enrollment_id IN (SELECT enrollment_id FROM enrollments WHERE member_id = an);
    UPDATE classes SET confirmed_count = GREATEST(confirmed_count - 1, 0), reserved_count = GREATEST(reserved_count - 1, 0)
        WHERE class_id IN (SELECT class_id FROM enrollments WHERE member_id = an AND status = 0 AND class_id <> ALL (demo_classes));
    UPDATE enrollments SET source_enrollment_id = NULL WHERE member_id = an;
    DELETE FROM enrollments WHERE member_id = an;

    DELETE FROM room_occupancies WHERE source_id IN (SELECT session_id FROM class_sessions WHERE class_id = ANY (demo_classes));
    DELETE FROM coach_occupancies WHERE source_id IN (SELECT session_id FROM class_sessions WHERE class_id = ANY (demo_classes));
    DELETE FROM class_sessions WHERE class_id = ANY (demo_classes);
    DELETE FROM class_schedule_rules WHERE class_id = ANY (demo_classes);
    DELETE FROM classes WHERE class_id = ANY (demo_classes);
END $$;

COMMIT;
