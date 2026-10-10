-- Local development only: six identifiable items in each Needs attention queue.
-- Run with psql -v ON_ERROR_STOP=1 -f this-file.sql. Re-running adds no duplicates.
-- Requests remain pending; this script does not approve refunds or change real members.
BEGIN;
DO $$
DECLARE
    manager_id uuid := (SELECT user_id FROM user_accounts WHERE email = 'manager@sporthub.vn');
    member_role int := (SELECT role_id FROM user_accounts WHERE email = 'an.member@sporthub.vn');
    risk_class classes%ROWTYPE;
    coach_request pt_coach_change_requests%ROWTYPE;
    entitlement pt_entitlements%ROWTYPE;
    package member_packages%ROWTYPE;
    demo_member uuid; demo_package uuid; demo_entitlement uuid;
    demo_invoice uuid; demo_item uuid; demo_enrollment uuid; demo_session uuid;
    demo_class int; slot_start timestamptz; label text; i int;
    names text[] := ARRAY['Nguyễn Minh Anh', 'Trần Gia Huy', 'Lê Bảo Ngọc', 'Phạm Quốc Bảo', 'Võ Thanh Trúc', 'Đặng Hoàng Nam'];
BEGIN
    SELECT * INTO risk_class FROM classes WHERE status = 1 AND threshold_status = 2 AND code NOT LIKE 'DEMO-SCROLL-%' ORDER BY class_id LIMIT 1;
    SELECT * INTO coach_request FROM pt_coach_change_requests WHERE status = 0 AND reason NOT LIKE 'DEMO-SCROLL:%' ORDER BY requested_at DESC LIMIT 1;
    SELECT * INTO entitlement FROM pt_entitlements WHERE entitlement_id = coach_request.entitlement_id;
    SELECT * INTO package FROM member_packages WHERE member_package_id = entitlement.origin_member_package_id;
    IF manager_id IS NULL OR member_role IS NULL OR risk_class.class_id IS NULL OR package.member_package_id IS NULL THEN
        RAISE EXCEPTION 'Required manager, member role, at-risk class or PT demo template is missing.';
    END IF;
    FOR i IN 1..6 LOOP
        label := 'DEMO-SCROLL-' || lpad(i::text, 2, '0');
        IF EXISTS (SELECT 1 FROM classes WHERE code = label) THEN
            RAISE NOTICE '% already exists; skipped.', label;
            CONTINUE;
        END IF;
        demo_member := gen_random_uuid(); demo_package := gen_random_uuid(); demo_entitlement := gen_random_uuid();
        demo_invoice := gen_random_uuid(); demo_item := gen_random_uuid();
        demo_enrollment := gen_random_uuid(); demo_session := gen_random_uuid();
        INSERT INTO user_accounts (user_id, email, role_id, status, created_at, security_stamp)
        VALUES (demo_member, 'scroll-demo-' || lpad(i::text, 2, '0') || '@sporthub.test', member_role, 0, now(), gen_random_uuid());
        INSERT INTO user_profiles (user_id, full_name)
        VALUES (demo_member, names[i] || ' (Demo cuộn)');
        INSERT INTO point_wallets (wallet_id, owner_user_id, available_points, held_points, created_at_utc)
        VALUES (gen_random_uuid(), demo_member, 0, 0, now());

        -- A future class with one confirmed demo enrollment, below its opening threshold.
        slot_start := ((CURRENT_DATE + 4 + i) + TIME '06:00') AT TIME ZONE 'UTC';
        WHILE EXISTS (SELECT 1 FROM room_occupancies WHERE room_id = risk_class.default_room_id AND is_active AND start_at_utc < slot_start + interval '90 minutes' AND end_at_utc > slot_start)
           OR EXISTS (SELECT 1 FROM coach_occupancies WHERE coach_id = risk_class.coach_id AND is_active AND start_at_utc < slot_start + interval '90 minutes' AND end_at_utc > slot_start) LOOP
            slot_start := slot_start + interval '1 day';
        END LOOP;
        INSERT INTO classes (code, name, sport_id, coach_id, default_room_id, start_date, num_sessions, capacity, price, cost_amount,
            break_even_threshold, threshold_status, threshold_deadline_utc, threshold_response_deadline_utc,
            status, confirmed_count, reserved_count, created_by_ai, version, created_at, published_at)
        VALUES (label, 'DEMO-SCROLL · Cầu lông cơ bản — Nhóm ' || lpad(i::text, 2, '0'), risk_class.sport_id, risk_class.coach_id,
            risk_class.default_room_id, (slot_start AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 1, 12, 600000, 2400000,
            4, 2, now() - interval '1 hour', now() + interval '48 hours', 1, 1, 1, false, 0, now() - i * interval '1 second', now())
        RETURNING class_id INTO demo_class;
        INSERT INTO class_schedule_rules (class_id, day_of_week, start_time_local)
        VALUES (demo_class, extract(dow FROM slot_start AT TIME ZONE 'Asia/Ho_Chi_Minh')::int, '13:00');
        INSERT INTO class_sessions (session_id, class_id, session_no, room_id, coach_id, start_at_utc, end_at_utc, status, is_makeup)
        VALUES (demo_session, demo_class, 1, risk_class.default_room_id, risk_class.coach_id, slot_start, slot_start + interval '90 minutes', 0, false);
        INSERT INTO room_occupancies (occupancy_id, room_id, source_type, source_id, start_at_utc, end_at_utc, is_active)
        VALUES (gen_random_uuid(), risk_class.default_room_id, 0, demo_session, slot_start, slot_start + interval '90 minutes', true);
        INSERT INTO coach_occupancies (occupancy_id, coach_id, source_type, source_id, start_at_utc, end_at_utc, is_active)
        VALUES (gen_random_uuid(), risk_class.coach_id, 0, demo_session, slot_start, slot_start + interval '90 minutes', true);

        -- Simulated paid course invoice and refund request: no external payment or payout.
        INSERT INTO invoices (invoice_id, invoice_number, member_id, issued_by_user_id, total_amount, status, issued_at,
            points_applied, cash_amount, paid_via, paid_at_utc, reconciliation_required)
        VALUES (demo_invoice, label, demo_member, manager_id, 600000, 2, now(), 0, 600000, 'Demo', now(), false);
        INSERT INTO invoice_items (item_id, invoice_id, description, unit_price, item_type, related_entity_id, quantity, line_amount, class_id, sport_id, sport_name_snapshot)
        VALUES (demo_item, demo_invoice, 'DEMO-SCROLL · Khóa học nhóm ' || i, 600000, 2, demo_enrollment, 1, 600000, demo_class, risk_class.sport_id, 'Cầu lông');
        INSERT INTO enrollments (enrollment_id, class_id, member_id, invoice_item_id, status, enrolled_at)
        VALUES (demo_enrollment, demo_class, demo_member, demo_item, 0, now());
        INSERT INTO payment_adjustments (adjustment_id, invoice_id, type, amount, reason, status, requested_by_user_id, created_at,
            requested_amount, approved_points, center_fault, invoice_item_id, system_calculated_points, legacy_payout_unverified)
        VALUES (gen_random_uuid(), demo_invoice, 0, 600000, 'DEMO-SCROLL: yêu cầu hoàn điểm để kiểm tra danh sách cuộn.', 0,
            demo_member, now() - i * interval '1 second', 600000, 0, false, demo_item, 600, false);

        -- Independent entitlement per demo member satisfies the pending-request uniqueness rule.
        INSERT INTO member_packages (member_package_id, member_id, package_id, start_date, end_date, remaining_sessions, status, version, duration_days_snapshot)
        VALUES (demo_package, demo_member, package.package_id, CURRENT_DATE, CURRENT_DATE + 30, package.remaining_sessions, 1, 0, 31);
        INSERT INTO pt_entitlements (entitlement_id, activation_reference, member_id, origin_member_package_id, current_member_package_id,
            coach_id, frequency_per_week, total_quota, reserved_sessions, consumed_sessions, validity_start_date, validity_end_date,
            carry_over_until_date, status, activated_at, version)
        VALUES (demo_entitlement, gen_random_uuid(), demo_member, demo_package, demo_package, coach_request.current_coach_id,
            entitlement.frequency_per_week, entitlement.total_quota, 0, 0, CURRENT_DATE, CURRENT_DATE + 30, CURRENT_DATE + 60, 1, now(), 0);
        INSERT INTO pt_coach_change_requests (request_id, entitlement_id, member_id, current_coach_id, requested_coach_id, reason, requested_at, status)
        VALUES (gen_random_uuid(), demo_entitlement, demo_member, coach_request.current_coach_id, coach_request.requested_coach_id,
            'DEMO-SCROLL: muốn đổi huấn luyện viên phù hợp lịch tập buổi sáng.', now() - i * interval '1 second', 0);
        RAISE NOTICE 'Created % in all three queues.', label;
    END LOOP;
END $$;
COMMIT;
