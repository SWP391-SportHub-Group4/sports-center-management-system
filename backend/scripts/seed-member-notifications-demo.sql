-- Local demo only; run after seed-member-pages-demo.sql. No email is queued.
-- Each notice points to an owned business record with an existing action screen.
-- Fixed IDs make reruns safe; completed work and read status are preserved.
BEGIN;
DO $$
DECLARE
    member uuid := (SELECT user_id FROM user_accounts WHERE email = 'an.member@sporthub.vn');
    coach uuid := (SELECT user_id FROM user_accounts WHERE email = 'coach.pt@sporthub.vn');
    relationship uuid;
    pt uuid;
    pt_start timestamptz;
    course classes%ROWTYPE;
    invoice uuid := 'a0300000-0000-4000-8000-000000000001';
    cycle uuid := 'a0300000-0000-4000-8000-000000000002';
    hold uuid := 'a0300000-0000-4000-8000-000000000003';
    homework uuid := 'a0300000-0000-4000-8000-000000000004';
    expiry timestamptz := now() + interval '15 minutes';
BEGIN
    SELECT relationship_id INTO relationship FROM coach_member_relationships
    WHERE member_id = member AND coach_id = coach AND status = 0 LIMIT 1;
    SELECT session_id, start_at_utc INTO pt, pt_start FROM pt_sessions
    WHERE member_id = member AND status = 0 AND start_at_utc > now()
    ORDER BY start_at_utc LIMIT 1;
    SELECT * INTO course FROM classes WHERE code = 'BR141-BONGRO-01' FOR UPDATE;
    IF member IS NULL OR relationship IS NULL OR pt IS NULL OR course.class_id IS NULL THEN
        RAISE EXCEPTION 'Run the Member pages demo seed first; a future PT session is required.';
    END IF;

    -- Remove only the three obsolete placeholders, including any already marked read.
    DELETE FROM notifications WHERE user_id = member AND channel = 0 AND source_event_type = 12
      AND message IN (
        '[Mẫu 1/3] Lịch tập tuần này đã sẵn sàng để xem.',
        '[Mẫu 2/3] Hãy kiểm tra khóa học của bạn trong mục Khóa học của tôi.',
        '[Mẫu 3/3] Đây là thông báo mẫu để thử tab Tất cả và Chưa đọc.');

    IF NOT EXISTS (SELECT 1 FROM invoices WHERE invoice_id = invoice) THEN
        IF course.status <> 1 OR course.reserved_count >= course.capacity OR EXISTS (
            SELECT 1 FROM enrollments WHERE member_id = member AND class_id = course.class_id AND status = 0
        ) THEN RAISE EXCEPTION 'The demo class is unavailable for checkout.'; END IF;
        expiry := least(expiry, (SELECT min(start_at_utc) - interval '1 second' FROM class_sessions WHERE class_id = course.class_id));
        IF expiry <= now() THEN RAISE EXCEPTION 'The demo class has already started.'; END IF;
        INSERT INTO invoices (invoice_id, invoice_number, member_id, issued_by_user_id, total_amount, status, issued_at,
            checkout_cycle_id, checkout_revision, hold_expires_at_utc, points_applied, cash_amount, reconciliation_required)
        VALUES (invoice, 'DEMO-NOTICE-001', member, member, course.price, 0, now(), cycle, 1, expiry, 0, course.price, false);
        INSERT INTO seat_holds (hold_id, class_id, member_id, invoice_id, expires_at_utc, status, created_at)
        VALUES (hold, course.class_id, member, invoice, expiry, 0, now());
        UPDATE classes SET reserved_count = reserved_count + 1, version = version + 1 WHERE class_id = course.class_id;
        INSERT INTO invoice_items (item_id, invoice_id, description, unit_price, item_type, related_entity_id, quantity,
            line_amount, class_id, sport_id, sport_name_snapshot)
        VALUES ('a0300000-0000-4000-8000-000000000005', invoice, course.name, course.price, 2, hold, 1, course.price,
            course.class_id, course.sport_id, 'Bóng rổ');
        INSERT INTO checkout_sessions (checkout_session_id, invoice_id, revision, idempotency_key, kind, state,
            created_at_utc, expires_at_utc, resource_hold_id, class_id)
        VALUES (cycle, invoice, 1, 'demo-actionable-notice-class-v1', 'Class', 'Active', now(), expiry, hold, course.class_id);
    END IF;

    INSERT INTO homework_assignments (assignment_id, member_id, coach_id, relationship_id, title, coach_note,
        assigned_at, due_at, status, version)
    VALUES (homework, member, coach, relationship, 'Ôn bài tập PT tại nhà',
        'Thực hiện theo hướng dẫn đã học trong buổi PT. Gửi phản hồi sau khi hoàn thành.', now(), now() + interval '7 days', 0, 0)
    ON CONFLICT (assignment_id) DO NOTHING;
    INSERT INTO homework_assignment_items (item_id, assignment_id, exercise, sets, reps, notes)
    VALUES ('a0300000-0000-4000-8000-000000000006', homework, 'Squat không tạ', 2, 10, 'Giữ kỹ thuật như buổi tập cùng HLV.')
    ON CONFLICT (item_id) DO NOTHING;

    INSERT INTO notifications (notification_id, user_id, channel, source_event_type, source_entity_id, message, status, retry_count, sent_at)
    VALUES
      ('a0300000-0000-4000-8000-000000000011', member, 0, 15, invoice,
        'Hóa đơn DEMO-NOTICE-001 cho khóa ' || course.name || ' đang chờ thanh toán. Mở hóa đơn để thanh toán hoặc tạo lại checkout nếu đã hết hạn.', 1, 0, now()),
      ('a0300000-0000-4000-8000-000000000012', member, 0, 4, homework,
        'Bạn có bài tập về nhà mới: Ôn bài tập PT tại nhà. Mở bài tập để xem hướng dẫn và gửi tiến độ cho huấn luyện viên.', 1, 0, now() - interval '1 minute'),
      ('a0300000-0000-4000-8000-000000000013', member, 0, 1, pt,
        'Lịch PT đã cập nhật: ' || to_char(pt_start AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM/YYYY') || '. Kiểm tra lịch mới hoặc gửi yêu cầu đổi/hủy nếu không phù hợp.', 1, 0, now() - interval '2 minutes')
    ON CONFLICT (notification_id) DO NOTHING;
END $$;
COMMIT;
