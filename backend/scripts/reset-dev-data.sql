-- Reset dữ liệu DEV của SportHub: giữ tài khoản hệ thống và cấu hình, xóa mọi dữ liệu phát sinh.
--
-- CHƯA CHẠY TỰ ĐỘNG. Chỉ chạy bằng tay, trên đúng database dev, SAU KHI sao lưu:
--   "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe" -h localhost -p 5435 -U <user> -Fc -f sporthub-before-reset.dump sporthub
--   "C:\Program Files\PostgreSQL\17\bin\psql.exe"     -h localhost -p 5435 -U <user> -d sporthub -v ON_ERROR_STOP=1 -f backend/scripts/reset-dev-data.sql
--
-- GIỮ NGUYÊN (không bị sửa):
--   tài khoản:  user_accounts, user_credentials, user_profiles, user_external_logins,
--               user_sport_specialties, coach_profiles, coach_service_qualifications
--   cấu hình:   roles, system_settings, sports, sport_service_offerings, sport_room_types, service_room_types,
--               room_types, rooms, room_opening_hours, court_rates, membership_packages
--   lịch sử EF: __EFMigrationsHistory
-- XÓA: mọi bảng còn lại (lớp, buổi, ghi danh, hóa đơn, thanh toán, ví và sổ điểm, PT, lịch sân và thuê sân,
--      thông báo, OTP, nhật ký, báo cáo xuất, hồ sơ tập luyện, bảng legacy).
--
-- Sau reset: phiên đăng nhập cũ bị vô hiệu (security_stamp mới), mật khẩu và liên kết Google của tài khoản giữ nguyên.
-- DemoDataSeeder bỏ qua hoàn toàn khi DB đã có tài khoản, nên sau reset DB giữ rỗng cho tới khi chạy lệnh seed riêng (Cổng D).

BEGIN;

-- Không chờ khóa quá lâu nếu còn phiên khác đang giữ bảng; script sẽ lỗi và ROLLBACK thay vì treo.
SET LOCAL lock_timeout = '15s';

DO $$
BEGIN
    IF current_database() <> 'sporthub' THEN
        RAISE EXCEPTION 'Dung lai: database hien tai la %, script chi dung cho sporthub.', current_database();
    END IF;
END $$;

-- Sổ điểm là append-only bằng trigger (point_ledger_no_truncate). Tắt trigger TRUNCATE trong giao dịch này và bật lại ngay sau đó;
-- nếu có lỗi, ROLLBACK khôi phục luôn trạng thái trigger.
ALTER TABLE point_ledger_entries DISABLE TRIGGER point_ledger_no_truncate;

-- Một câu TRUNCATE liệt kê đủ mọi bảng bị xóa; không dùng CASCADE để nếu bảng được giữ trỏ vào bảng bị xóa thì lỗi rõ ràng.
TRUNCATE TABLE
    ai_logs,
    attendances,
    audit_logs,
    checkout_sessions,
    class_schedule_rules,
    class_sessions,
    class_threshold_responses,
    classes,
    coach_member_relationships,
    coach_occupancies,
    court_rentals,
    email_otps,
    enrollments,
    google_onboarding_tickets,
    gym_checkins,
    homework_assignment_items,
    homework_assignments,
    incident_notices,
    invoice_items,
    invoices,
    legacy_attendances,
    legacy_class_recurrences,
    legacy_class_sessions,
    legacy_classes,
    legacy_enrollments,
    legacy_relationship_class_links,
    member_packages,
    member_training_profiles,
    notifications,
    payment_adjustments,
    payment_attempts,
    payments,
    point_confirmations,
    point_ledger_entries,
    point_wallets,
    pt_coach_change_requests,
    pt_entitlements,
    pt_session_change_requests,
    pt_sessions,
    report_exports,
    room_blocks,
    room_occupancies,
    seat_holds,
    verified_gateway_events,
    workout_plan_items,
    workout_plans,
    workout_results
RESTART IDENTITY;

ALTER TABLE point_ledger_entries ENABLE TRIGGER point_ledger_no_truncate;

-- Vô hiệu mọi phiên đăng nhập và refresh token cũ của các tài khoản giữ lại.
UPDATE user_accounts SET security_stamp = gen_random_uuid();
UPDATE user_external_logins SET refresh_token = NULL;

COMMIT;
