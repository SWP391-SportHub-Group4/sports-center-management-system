-- Local demo only; run after seed-member-pages-demo.sql. No email is queued.
-- Each notice points to an owned business record with an existing action screen.
-- Fixed IDs make reruns safe; completed work and read status are preserved.
BEGIN;
DO $$
DECLARE
    member uuid := (SELECT user_id FROM user_accounts WHERE email = 'an.member@sporthub.vn');
    pt uuid;
    pt_start timestamptz;
    package_id uuid;
    package_end date;
    course classes%ROWTYPE;
    invoice uuid := 'a0300000-0000-4000-8000-000000000001';
    cycle uuid := 'a0300000-0000-4000-8000-000000000002';
    hold uuid := 'a0300000-0000-4000-8000-000000000003';
    expiry timestamptz := now() + interval '15 minutes';
BEGIN
    SELECT member_package_id, end_date INTO package_id, package_end FROM member_packages
    WHERE member_id = member AND status = 1 AND end_date >= CURRENT_DATE
    ORDER BY end_date LIMIT 1;
    SELECT session_id, start_at_utc INTO pt, pt_start FROM pt_sessions
    WHERE member_id = member AND status = 0 AND start_at_utc > now()
    ORDER BY start_at_utc LIMIT 1;
    SELECT * INTO course FROM classes WHERE code = 'BR141-BONGRO-01' FOR UPDATE;
    IF member IS NULL OR package_id IS NULL OR pt IS NULL OR course.class_id IS NULL THEN
        RAISE EXCEPTION 'Run the Member pages demo seed first; an active package and future PT session are required.';
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

    -- Retire the previous homework demo notice before inserting its replacement.
    DELETE FROM notifications WHERE notification_id = 'a0300000-0000-4000-8000-000000000012'
      AND user_id = member AND source_event_type = 4;

    INSERT INTO notifications (notification_id, user_id, channel, source_event_type, source_entity_id, message, status, retry_count, sent_at)
    VALUES
      ('a0300000-0000-4000-8000-000000000011', member, 0, 15, invoice,
        'Hóa đơn DEMO-NOTICE-001 cho khóa ' || course.name || ' đang chờ thanh toán. Mở hóa đơn để thanh toán hoặc tạo lại checkout nếu đã hết hạn.', 1, 0, now()),
      ('a0300000-0000-4000-8000-000000000012', member, 0, 2, package_id,
        'Gói tập của bạn sẽ hết hạn vào ' || to_char(package_end, 'DD/MM/YYYY') || '. Mở Gym & PT để xem quyền lợi và gia hạn tại quầy lễ tân.', 1, 0, now() - interval '1 minute'),
      ('a0300000-0000-4000-8000-000000000013', member, 0, 1, pt,
        'Lịch PT đã cập nhật: ' || to_char(pt_start AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM/YYYY') || '. Kiểm tra lịch mới hoặc gửi yêu cầu đổi/hủy nếu không phù hợp.', 1, 0, now() - interval '2 minutes')
    ON CONFLICT (notification_id) DO NOTHING;
END $$;
COMMIT;
