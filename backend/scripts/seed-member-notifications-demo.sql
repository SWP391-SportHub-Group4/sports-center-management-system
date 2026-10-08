-- Three clearly labeled, unread in-app notices for the local demo Member.
-- Safe to rerun: matching messages for this user are inserted only once.
WITH member AS (
    SELECT user_id FROM user_accounts WHERE email = 'an.member@sporthub.vn'
), samples(message, sent_at) AS (
    VALUES
        ('[Mẫu 1/3] Lịch tập tuần này đã sẵn sàng để xem.', now() - interval '2 minutes'),
        ('[Mẫu 2/3] Hãy kiểm tra khóa học của bạn trong mục Khóa học của tôi.', now() - interval '1 minute'),
        ('[Mẫu 3/3] Đây là thông báo mẫu để thử tab Tất cả và Chưa đọc.', now())
)
INSERT INTO notifications (notification_id, user_id, channel, source_event_type,
                           source_entity_id, message, status, retry_count, sent_at)
SELECT gen_random_uuid(), member.user_id, 0, 12, NULL, samples.message, 1, 0, samples.sent_at
FROM member CROSS JOIN samples
WHERE NOT EXISTS (
    SELECT 1 FROM notifications n
    WHERE n.user_id = member.user_id AND n.channel = 0 AND n.message = samples.message
);
