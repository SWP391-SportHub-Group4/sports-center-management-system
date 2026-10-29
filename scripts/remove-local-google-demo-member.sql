-- Local sporthub DB only. Backup before running. Frees one email for a fresh
-- Google sign-in and password-reset demo without touching other accounts.
\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE demo_target ON COMMIT DROP AS
SELECT user_id FROM user_accounts WHERE email = 'holethienan2006@gmail.com';
CREATE TEMP TABLE demo_invoices ON COMMIT DROP AS
SELECT invoice_id FROM invoices WHERE member_id IN (SELECT user_id FROM demo_target);
CREATE TEMP TABLE demo_items ON COMMIT DROP AS
SELECT item_id FROM invoice_items WHERE invoice_id IN (SELECT invoice_id FROM demo_invoices);
CREATE TEMP TABLE demo_attempts ON COMMIT DROP AS
SELECT payment_attempt_id FROM payment_attempts WHERE invoice_id IN (SELECT invoice_id FROM demo_invoices);
CREATE TEMP TABLE demo_checkouts ON COMMIT DROP AS
SELECT checkout_session_id FROM checkout_sessions WHERE invoice_id IN (SELECT invoice_id FROM demo_invoices);
CREATE TEMP TABLE demo_enrollments ON COMMIT DROP AS
SELECT enrollment_id, class_id, status FROM enrollments WHERE member_id IN (SELECT user_id FROM demo_target);
CREATE TEMP TABLE demo_support ON COMMIT DROP AS
SELECT request_id FROM member_support_requests WHERE member_id IN (SELECT user_id FROM demo_target);

DO $guard$
BEGIN
    IF current_database() <> 'sporthub' OR (SELECT count(*) FROM demo_target) <> 1 THEN
        RAISE EXCEPTION 'Expected exactly one target account in local sporthub';
    END IF;
    IF (SELECT count(*) FROM demo_invoices) <> 1
       OR (SELECT count(*) FROM demo_enrollments) <> 1
       OR (SELECT count(*) FROM demo_support) <> 2 THEN
        RAISE EXCEPTION 'Target data changed; review dependencies before deletion';
    END IF;
    IF EXISTS (SELECT 1 FROM enrollments WHERE source_enrollment_id IN
               (SELECT enrollment_id FROM demo_enrollments))
       OR EXISTS (SELECT 1 FROM invoice_items WHERE source_invoice_item_id IN
                  (SELECT item_id FROM demo_items))
       OR EXISTS (SELECT 1 FROM workout_plans WHERE relationship_id IN
                  (SELECT relationship_id FROM coach_member_relationships
                   WHERE member_id IN (SELECT user_id FROM demo_target)))
       OR EXISTS (SELECT 1 FROM point_ledger_entries WHERE wallet_id IN
                  (SELECT wallet_id FROM point_wallets
                   WHERE owner_user_id IN (SELECT user_id FROM demo_target))
                  OR invoice_item_id IN (SELECT item_id FROM demo_items)
                  OR (reference_type = 'CheckoutSession' AND reference_id IN
                      (SELECT checkout_session_id FROM demo_checkouts))) THEN
        RAISE EXCEPTION 'Unexpected dependent history; deletion stopped';
    END IF;
END $guard$;

-- Confirmed enrollment occupies one seat even though its hold is converted.
UPDATE classes c SET confirmed_count = c.confirmed_count - e.n,
                     reserved_count = c.reserved_count - e.n,
                     version = c.version + 1
FROM (SELECT class_id, count(*)::integer AS n FROM demo_enrollments
      WHERE status = 0 GROUP BY class_id) e
WHERE c.class_id = e.class_id
  AND c.confirmed_count >= e.n AND c.reserved_count >= e.n;
DO $guard$
BEGIN
    IF EXISTS (SELECT 1 FROM demo_enrollments e JOIN classes c USING(class_id)
               WHERE e.status = 0 AND c.confirmed_count <> 0) THEN
        RAISE EXCEPTION 'Unexpected class seat counters; deletion stopped';
    END IF;
END $guard$;

DELETE FROM email_otps WHERE email = 'holethienan2006@gmail.com';
DELETE FROM notifications WHERE user_id IN (SELECT user_id FROM demo_target);
DELETE FROM member_support_requests WHERE request_id IN (SELECT request_id FROM demo_support);
DELETE FROM coach_member_relationships WHERE member_id IN (SELECT user_id FROM demo_target);
DELETE FROM enrollments WHERE enrollment_id IN (SELECT enrollment_id FROM demo_enrollments);
DELETE FROM seat_holds WHERE member_id IN (SELECT user_id FROM demo_target)
    OR invoice_id IN (SELECT invoice_id FROM demo_invoices);
DELETE FROM verified_gateway_events WHERE payment_attempt_id IN (SELECT payment_attempt_id FROM demo_attempts);
DELETE FROM payments WHERE invoice_id IN (SELECT invoice_id FROM demo_invoices);
DELETE FROM payment_attempts WHERE payment_attempt_id IN (SELECT payment_attempt_id FROM demo_attempts);
DELETE FROM checkout_sessions WHERE checkout_session_id IN (SELECT checkout_session_id FROM demo_checkouts);
DELETE FROM invoice_items WHERE item_id IN (SELECT item_id FROM demo_items);
DELETE FROM invoices WHERE invoice_id IN (SELECT invoice_id FROM demo_invoices);
DELETE FROM point_wallets WHERE owner_user_id IN (SELECT user_id FROM demo_target);
DELETE FROM user_accounts WHERE user_id IN (SELECT user_id FROM demo_target);

COMMIT;
