-- Seed demo cho ba trang Member: Khám phá, Lịch của tôi, Khóa học của tôi (tài khoản an.member@sporthub.vn).
--
-- Chạy tay trên DB dev, SAU KHI đã seed bốn lớp BR-141 (dotnet run --project backend/SportHub.API -- --seed-br141=true):
--   docker exec -i -e PGPASSWORD=... sporthub-postgres psql -U sporthub -d sporthub -v ON_ERROR_STOP=1 < backend/scripts/seed-member-pages-demo.sql
--
-- Tạo (idempotent, dựa vào mã lớp DEMO3P-*):
--   - 2 lớp phụ để có trạng thái "Đang học" và "Đã kết thúc" (lớp BR-141 đều khai giảng trong tương lai nên chỉ cho "Sắp học")
--   - ghi danh của An: Sắp học (Cầu lông 01 chuyển từ Cầu lông 02, Bóng rổ 02), Đang học, Đã kết thúc, Đã chuyển lớp
--   - Membership Gym & PT còn hiệu lực, quyền PT, buổi PT (đã học + sắp tới), lượt thuê sân (sắp tới, đã dùng, đã hủy)
-- Ghi chú: ghi danh/thuê sân tạo trực tiếp, không kèm hóa đơn/thanh toán (đủ cho các trang xem lịch và khóa học).
-- Xóa dữ liệu demo này: backend/scripts/unseed-member-pages-demo.sql

BEGIN;

DO $$
DECLARE
    an        uuid := (SELECT user_id FROM user_accounts WHERE email = 'an.member@sporthub.vn');
    mgr       uuid := (SELECT user_id FROM user_accounts WHERE email = 'manager@sporthub.vn');
    coach_cl  uuid := (SELECT user_id FROM user_accounts WHERE email = 'coach.caulong@sporthub.vn');
    coach_br  uuid := (SELECT user_id FROM user_accounts WHERE email = 'coach.bongro@sporthub.vn');
    coach_pt  uuid := (SELECT user_id FROM user_accounts WHERE email = 'coach.pt@sporthub.vn');
    c_cl01 int := (SELECT class_id FROM classes WHERE code = 'BR141-CAULONG-01');
    c_cl02 int := (SELECT class_id FROM classes WHERE code = 'BR141-CAULONG-02');
    c_br02 int := (SELECT class_id FROM classes WHERE code = 'BR141-BONGRO-02');
    c_going int; c_done int;
    e_old uuid; e_going uuid; e_done uuid;
    s uuid; n int; d date; t0 timestamptz;
    mp uuid; ent uuid; ps uuid; cr uuid;
BEGIN
    IF an IS NULL OR coach_cl IS NULL OR coach_br IS NULL OR coach_pt IS NULL OR c_cl01 IS NULL OR c_br02 IS NULL THEN
        RAISE EXCEPTION 'Thiếu tài khoản demo hoặc lớp BR-141 (chạy --seed-br141=true trước).';
    END IF;
    IF EXISTS (SELECT 1 FROM classes WHERE code = 'DEMO3P-CAULONG-DANGHOC') THEN
        RAISE NOTICE 'Đã seed trước đó, bỏ qua.';
        RETURN;
    END IF;

    ---------------------------------------------------------------- Lớp đang học: Cầu lông cơ bản, T3/T5 18:00 (giờ VN), từ 22/09
    INSERT INTO classes (code, name, sport_id, coach_id, default_room_id, start_date, num_sessions, capacity, price, cost_amount,
                         break_even_threshold, threshold_status, status, confirmed_count, reserved_count, created_by_ai, version,
                         created_at, published_at)
    VALUES ('DEMO3P-CAULONG-DANGHOC', 'Cầu lông cơ bản', 3, coach_cl, 7, DATE '2026-09-22', 12, 12, 900000, 4500000,
            5, 0, 2, 1, 1, false, 1, TIMESTAMPTZ '2026-09-10 03:00+00', TIMESTAMPTZ '2026-09-10 03:05+00')
    RETURNING class_id INTO c_going;
    INSERT INTO class_schedule_rules (class_id, day_of_week, start_time_local) VALUES (c_going, 2, '18:00'), (c_going, 4, '18:00');

    FOR n IN 1..12 LOOP
        d := DATE '2026-09-22' + ((n - 1) / 2) * 7 + CASE WHEN (n - 1) % 2 = 0 THEN 0 ELSE 2 END;   -- T3 rồi T5 mỗi tuần
        t0 := (d + TIME '11:00') AT TIME ZONE 'UTC';                                                   -- 18:00 giờ VN
        s := gen_random_uuid();
        INSERT INTO class_sessions (session_id, class_id, session_no, room_id, coach_id, start_at_utc, end_at_utc, status, is_makeup)
        VALUES (s, c_going, n, 7, coach_cl, t0, t0 + INTERVAL '2 hours', CASE WHEN t0 + INTERVAL '2 hours' <= now() THEN 1 ELSE 0 END, false);
        INSERT INTO room_occupancies (occupancy_id, room_id, source_type, source_id, start_at_utc, end_at_utc, is_active)
        VALUES (gen_random_uuid(), 7, 0, s, t0, t0 + INTERVAL '2 hours', true);
        INSERT INTO coach_occupancies (occupancy_id, coach_id, source_type, source_id, start_at_utc, end_at_utc, is_active)
        VALUES (gen_random_uuid(), coach_cl, 0, s, t0, t0 + INTERVAL '2 hours', true);
    END LOOP;

    ---------------------------------------------------------------- Lớp đã kết thúc: Bóng rổ cơ bản, T2/T4/T6 07:00, 03/08 – 28/08
    INSERT INTO classes (code, name, sport_id, coach_id, default_room_id, start_date, num_sessions, capacity, price, cost_amount,
                         break_even_threshold, threshold_status, status, confirmed_count, reserved_count, created_by_ai, version,
                         created_at, published_at)
    VALUES ('DEMO3P-BONGRO-KETTHUC', 'Bóng rổ cơ bản', 4, coach_br, 8, DATE '2026-08-03', 12, 20, 1200000, 9600000,
            8, 0, 3, 1, 1, false, 1, TIMESTAMPTZ '2026-07-20 03:00+00', TIMESTAMPTZ '2026-07-20 03:05+00')
    RETURNING class_id INTO c_done;
    INSERT INTO class_schedule_rules (class_id, day_of_week, start_time_local) VALUES (c_done, 1, '07:00'), (c_done, 3, '07:00'), (c_done, 5, '07:00');

    FOR n IN 1..12 LOOP
        d := DATE '2026-08-03' + ((n - 1) / 3) * 7 + ((n - 1) % 3) * 2;                                -- T2, T4, T6
        t0 := d::timestamp AT TIME ZONE 'UTC';                                                         -- 07:00 giờ VN = 00:00 UTC
        s := gen_random_uuid();
        INSERT INTO class_sessions (session_id, class_id, session_no, room_id, coach_id, start_at_utc, end_at_utc, status, is_makeup)
        VALUES (s, c_done, n, 8, coach_br, t0, t0 + INTERVAL '2 hours', 1, false);
        INSERT INTO room_occupancies (occupancy_id, room_id, source_type, source_id, start_at_utc, end_at_utc, is_active)
        VALUES (gen_random_uuid(), 8, 0, s, t0, t0 + INTERVAL '2 hours', true);
        INSERT INTO coach_occupancies (occupancy_id, coach_id, source_type, source_id, start_at_utc, end_at_utc, is_active)
        VALUES (gen_random_uuid(), coach_br, 0, s, t0, t0 + INTERVAL '2 hours', true);
    END LOOP;

    ---------------------------------------------------------------- Ghi danh của An
    -- Đã chuyển lớp: Cầu lông 02 -> Cầu lông 01
    e_old := gen_random_uuid();
    INSERT INTO enrollments (enrollment_id, class_id, member_id, status, enrolled_at, ended_at)
    VALUES (e_old, c_cl02, an, 1, now() - INTERVAL '6 days', now() - INTERVAL '3 days');
    INSERT INTO enrollments (enrollment_id, class_id, member_id, status, enrolled_at, source_enrollment_id)
    VALUES (gen_random_uuid(), c_cl01, an, 0, now() - INTERVAL '3 days', e_old);
    -- Sắp học: Bóng rổ 02
    INSERT INTO enrollments (enrollment_id, class_id, member_id, status, enrolled_at)
    VALUES (gen_random_uuid(), c_br02, an, 0, now() - INTERVAL '2 days');
    -- Đang học và Đã kết thúc
    e_going := gen_random_uuid(); e_done := gen_random_uuid();
    INSERT INTO enrollments (enrollment_id, class_id, member_id, status, enrolled_at) VALUES
        (e_going, c_going, an, 0, TIMESTAMPTZ '2026-09-12 03:00+00'),
        (e_done,  c_done,  an, 0, TIMESTAMPTZ '2026-07-25 03:00+00');
    UPDATE classes SET confirmed_count = confirmed_count + 1, reserved_count = reserved_count + 1 WHERE class_id IN (c_cl01, c_br02);

    -- Điểm danh: lớp đang học (có một buổi vắng), lớp đã kết thúc (có mặt đủ)
    INSERT INTO attendances (attendance_id, enrollment_id, session_id, status, recorded_by_user_id, recorded_at)
    SELECT gen_random_uuid(), e_going, session_id, CASE WHEN session_no = 3 THEN 1 ELSE 0 END, mgr, end_at_utc
    FROM class_sessions WHERE class_id = c_going AND status = 1;
    INSERT INTO attendances (attendance_id, enrollment_id, session_id, status, recorded_by_user_id, recorded_at)
    SELECT gen_random_uuid(), e_done, session_id, 0, mgr, end_at_utc FROM class_sessions WHERE class_id = c_done;

    INSERT INTO coach_member_relationships (relationship_id, coach_id, member_id, source_type, class_id, status, started_at)
    VALUES (gen_random_uuid(), coach_cl, an, 0, c_going, 0, TIMESTAMPTZ '2026-09-22 11:00+00');

    ---------------------------------------------------------------- Membership Gym & PT (còn hiệu lực) + quyền PT + buổi PT
    mp := gen_random_uuid(); ent := gen_random_uuid();
    INSERT INTO member_packages (member_package_id, member_id, package_id, start_date, end_date, remaining_sessions, status, version, duration_days_snapshot)
    VALUES (mp, an, 6, DATE '2026-10-01', DATE '2026-10-31', NULL, 1, 1, 31);
    INSERT INTO pt_entitlements (entitlement_id, member_id, origin_member_package_id, current_member_package_id, coach_id, frequency_per_week,
                                 total_quota, reserved_sessions, consumed_sessions, validity_start_date, validity_end_date, carry_over_until_date,
                                 status, activated_at, version)
    VALUES (ent, an, mp, mp, coach_pt, 2, 8, 2, 1, DATE '2026-10-01', DATE '2026-10-31', DATE '2026-11-30', 1, TIMESTAMPTZ '2026-10-01 02:00+00', 1);
    INSERT INTO coach_member_relationships (relationship_id, coach_id, member_id, source_type, status, started_at)
    VALUES (gen_random_uuid(), coach_pt, an, 1, 0, TIMESTAMPTZ '2026-10-01 02:00+00');

    -- Đã học 06/10 18:00; sắp tới 10/10 17:00 và 14/10 17:00 (giờ VN), phòng PT 1, 90 phút
    FOR t0, n IN SELECT * FROM (VALUES (TIMESTAMPTZ '2026-10-06 11:00+00', 1), (TIMESTAMPTZ '2026-10-10 10:00+00', 0), (TIMESTAMPTZ '2026-10-14 10:00+00', 0)) v(t, st)
    LOOP
        ps := gen_random_uuid();
        INSERT INTO pt_sessions (session_id, entitlement_id, member_id, coach_id, start_at_utc, end_at_utc, status, quota_state,
                                 created_by_user_id, completed_at, version, room_id)
        VALUES (ps, ent, an, coach_pt, t0, t0 + INTERVAL '90 minutes', n, CASE WHEN n = 1 THEN 1 ELSE 0 END, an,
                CASE WHEN n = 1 THEN t0 + INTERVAL '90 minutes' END, 1, 3);
        INSERT INTO room_occupancies (occupancy_id, room_id, source_type, source_id, start_at_utc, end_at_utc, is_active)
        VALUES (gen_random_uuid(), 3, 1, ps, t0, t0 + INTERVAL '90 minutes', true);
        INSERT INTO coach_occupancies (occupancy_id, coach_id, source_type, source_id, start_at_utc, end_at_utc, is_active)
        VALUES (gen_random_uuid(), coach_pt, 1, ps, t0, t0 + INTERVAL '90 minutes', true);
    END LOOP;

    ---------------------------------------------------------------- Thuê sân: sắp tới (cầu lông, bóng rổ), đã dùng, đã hủy
    FOR t0, n IN SELECT * FROM (VALUES
        (TIMESTAMPTZ '2026-10-09 11:00+00', 1), (TIMESTAMPTZ '2026-10-11 02:00+00', 1),
        (TIMESTAMPTZ '2026-10-03 10:00+00', 3), (TIMESTAMPTZ '2026-10-05 12:00+00', 2)) v(t, st)
    LOOP
        cr := gen_random_uuid();
        INSERT INTO court_rentals (court_rental_id, member_id, sport_id, room_id, start_at_utc, end_at_utc, total_price, price_snapshot_json,
                                   status, created_at_utc, cancelled_at_utc, cancel_reason)
        VALUES (cr, an,
                CASE WHEN t0 = TIMESTAMPTZ '2026-10-11 02:00+00' THEN 4 ELSE 3 END,
                CASE WHEN t0 = TIMESTAMPTZ '2026-10-11 02:00+00' THEN 9 ELSE 6 END,
                t0, t0 + CASE WHEN t0 = TIMESTAMPTZ '2026-10-09 11:00+00' THEN INTERVAL '2 hours' ELSE INTERVAL '1 hour' END,
                CASE WHEN t0 = TIMESTAMPTZ '2026-10-11 02:00+00' THEN 200000
                     WHEN t0 = TIMESTAMPTZ '2026-10-09 11:00+00' THEN 200000 ELSE 100000 END,
                '[]'::jsonb, n, now() - INTERVAL '5 days',
                CASE WHEN n = 2 THEN now() - INTERVAL '4 days' END, CASE WHEN n = 2 THEN 'Member tự hủy' END);
        IF n <> 2 THEN
            INSERT INTO room_occupancies (occupancy_id, room_id, source_type, source_id, start_at_utc, end_at_utc, is_active)
            SELECT gen_random_uuid(), room_id, 2, court_rental_id, start_at_utc, end_at_utc, true FROM court_rentals WHERE court_rental_id = cr;
        END IF;
    END LOOP;
END $$;

COMMIT;
