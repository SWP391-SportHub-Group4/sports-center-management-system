-- Xóa sạch dữ liệu DEV, chỉ giữ 6 tài khoản mẫu + cấu hình, dựng lại 4 gói Gym 1/3/6/12 tháng.
-- Chạy tay trên database sporthub, SAU KHI sao lưu (xem reset-dev-data.sql). Sau đó chạy:
--   dotnet run --project backend/SportHub.API -- --seed-br141=true   (dựng lại lịch cầu lông T2/4/6 + T3/5/7, bóng rổ T2/4/6 + T3/5/7)
-- GIỮ: admin, manager, letan, coach.pt, coach.caulong, an.member; roles, sports, rooms, court_rates, system_settings...
-- XÓA: mọi tài khoản khác, mọi lớp/ghi danh/hóa đơn/thanh toán/ví/PT/thuê sân/thông báo...
BEGIN;
SET LOCAL lock_timeout = '15s';

DO $$
BEGIN
    IF current_database() <> 'sporthub' THEN
        RAISE EXCEPTION 'Dung lai: database hien tai la %, script chi dung cho sporthub.', current_database();
    END IF;
END $$;

ALTER TABLE point_ledger_entries DISABLE TRIGGER point_ledger_no_truncate;

TRUNCATE TABLE
    ai_logs, attendances, audit_logs, checkout_sessions, class_schedule_rules, class_sessions,
    class_threshold_responses, classes, coach_member_relationships, coach_occupancies,
    course_interest_subscriptions, court_rentals, email_otps, enrollments,
    gym_checkins, incident_notices, invoice_items, invoices, legacy_attendances, legacy_class_recurrences,
    legacy_class_sessions, legacy_classes, legacy_enrollments, legacy_relationship_class_links,
    member_bmi_profiles, member_packages, member_training_profiles, membership_packages, notifications,
    payment_adjustments, payment_attempts, payments, point_confirmations, point_ledger_entries, point_wallets,
    pt_coach_change_requests, pt_entitlements, pt_session_change_requests, pt_sessions, report_exports,
    room_blocks, room_occupancies, seat_holds, verified_gateway_events, workout_plan_items, workout_plans,
    workout_results
RESTART IDENTITY;

ALTER TABLE point_ledger_entries ENABLE TRIGGER point_ledger_no_truncate;

-- Dữ liệu con của tài khoản bị xóa (xóa tường minh, không dựa vào cascade).
DELETE FROM user_external_logins WHERE user_id IN (SELECT user_id FROM user_accounts WHERE email NOT IN
  ('admin@sporthub.vn','manager@sporthub.vn','letan@sporthub.vn','coach.pt@sporthub.vn','coach.caulong@sporthub.vn','an.member@sporthub.vn'));
DELETE FROM coach_service_qualifications WHERE user_id IN (SELECT user_id FROM user_accounts WHERE email NOT IN
  ('admin@sporthub.vn','manager@sporthub.vn','letan@sporthub.vn','coach.pt@sporthub.vn','coach.caulong@sporthub.vn','an.member@sporthub.vn'));
DELETE FROM user_sport_specialties WHERE user_id IN (SELECT user_id FROM user_accounts WHERE email NOT IN
  ('admin@sporthub.vn','manager@sporthub.vn','letan@sporthub.vn','coach.pt@sporthub.vn','coach.caulong@sporthub.vn','an.member@sporthub.vn'));
DELETE FROM coach_profiles WHERE user_id IN (SELECT user_id FROM user_accounts WHERE email NOT IN
  ('admin@sporthub.vn','manager@sporthub.vn','letan@sporthub.vn','coach.pt@sporthub.vn','coach.caulong@sporthub.vn','an.member@sporthub.vn'));
DELETE FROM user_credentials WHERE user_id IN (SELECT user_id FROM user_accounts WHERE email NOT IN
  ('admin@sporthub.vn','manager@sporthub.vn','letan@sporthub.vn','coach.pt@sporthub.vn','coach.caulong@sporthub.vn','an.member@sporthub.vn'));
DELETE FROM user_profiles WHERE user_id IN (SELECT user_id FROM user_accounts WHERE email NOT IN
  ('admin@sporthub.vn','manager@sporthub.vn','letan@sporthub.vn','coach.pt@sporthub.vn','coach.caulong@sporthub.vn','an.member@sporthub.vn'));
DELETE FROM user_accounts WHERE email NOT IN
  ('admin@sporthub.vn','manager@sporthub.vn','letan@sporthub.vn','coach.pt@sporthub.vn','coach.caulong@sporthub.vn','an.member@sporthub.vn');

-- Đảm bảo 6 tài khoản đang Active, vô hiệu mọi phiên cũ.
UPDATE user_accounts SET status = 0, security_stamp = gen_random_uuid();
UPDATE user_external_logins SET refresh_token = NULL;

-- Membership: 4 gói Gym 1/3/6/12 tháng; hạn tính từ ngày mua (start = ngày mua, end = start + DurationDays - 1).
INSERT INTO membership_packages (name, price, duration_days, session_limit, description, is_active) VALUES
 ('Gym 1 tháng',  600000,  30,  NULL, 'Tập Gym tự do trong 30 ngày kể từ ngày mua, không giới hạn check-in. Cần Membership Gym còn hiệu lực để mua PT riêng.', true),
 ('Gym 3 tháng',  1800000, 90,  NULL, 'Tập Gym tự do trong 90 ngày kể từ ngày mua. Cần Membership Gym còn hiệu lực để mua PT riêng.', true),
 ('Gym 6 tháng',  2400000, 180, NULL, 'Tập Gym tự do trong 180 ngày kể từ ngày mua. Cần Membership Gym còn hiệu lực để mua PT riêng.', true),
 ('Gym 12 tháng', 6000000, 365, NULL, 'Tập Gym tự do trong 365 ngày kể từ ngày mua. Cần Membership Gym còn hiệu lực để mua PT riêng.', true);

SELECT email FROM user_accounts ORDER BY 1;
SELECT package_id, name, duration_days FROM membership_packages ORDER BY 1;
COMMIT;
