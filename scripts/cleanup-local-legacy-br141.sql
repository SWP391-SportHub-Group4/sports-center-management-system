-- LOCAL DEMO ONLY. Run against a backup of the local sporthub database.
-- Removes exactly the four obsolete BR141 course fixtures and their exclusive
-- checkout/payment/point histories. User accounts and other courses are kept.
BEGIN;

CREATE TEMP TABLE demo_old_classes ON COMMIT DROP AS
SELECT class_id FROM classes WHERE code IN
('BR141-BONGRO-01','BR141-BONGRO-02','BR141-CAULONG-01','BR141-CAULONG-02');
CREATE TEMP TABLE demo_old_items ON COMMIT DROP AS
SELECT item_id,invoice_id FROM invoice_items WHERE class_id IN
(SELECT class_id FROM demo_old_classes);
CREATE TEMP TABLE demo_old_invoices ON COMMIT DROP AS
SELECT DISTINCT invoice_id FROM demo_old_items;
CREATE TEMP TABLE demo_old_sessions ON COMMIT DROP AS
SELECT session_id FROM class_sessions WHERE class_id IN
(SELECT class_id FROM demo_old_classes);
CREATE TEMP TABLE demo_old_checkouts ON COMMIT DROP AS
SELECT checkout_session_id FROM checkout_sessions WHERE invoice_id IN
(SELECT invoice_id FROM demo_old_invoices);
CREATE TEMP TABLE demo_old_attempts ON COMMIT DROP AS
SELECT payment_attempt_id FROM payment_attempts WHERE invoice_id IN
(SELECT invoice_id FROM demo_old_invoices);
CREATE TEMP TABLE demo_old_ledger ON COMMIT DROP AS
SELECT ledger_entry_id,wallet_id,available_delta,held_delta FROM point_ledger_entries
WHERE invoice_item_id IN (SELECT item_id FROM demo_old_items)
   OR (reference_type='CheckoutSession' AND reference_id IN
       (SELECT checkout_session_id FROM demo_old_checkouts));

DO $$
BEGIN
  IF (SELECT count(*) FROM demo_old_classes) NOT IN (0,4) THEN
    RAISE EXCEPTION 'Expected zero or all four BR141 classes; cleanup stopped';
  END IF;
  IF EXISTS (SELECT 1 FROM invoice_items WHERE invoice_id IN
      (SELECT invoice_id FROM demo_old_invoices) AND item_id NOT IN
      (SELECT item_id FROM demo_old_items)) THEN
    RAISE EXCEPTION 'An invoice also contains a non-BR141 item; cleanup stopped';
  END IF;
  IF EXISTS (SELECT 1 FROM member_support_requests WHERE invoice_id IN
      (SELECT invoice_id FROM demo_old_invoices) OR invoice_item_id IN
      (SELECT item_id FROM demo_old_items)) THEN
    RAISE EXCEPTION 'A support request references a BR141 payment; cleanup stopped';
  END IF;
  IF EXISTS (SELECT 1 FROM member_packages WHERE invoice_item_id IN
      (SELECT item_id FROM demo_old_items)) OR EXISTS
      (SELECT 1 FROM court_rentals WHERE invoice_id IN
      (SELECT invoice_id FROM demo_old_invoices) OR invoice_item_id IN
      (SELECT item_id FROM demo_old_items)) THEN
    RAISE EXCEPTION 'Another entitlement references a BR141 payment; cleanup stopped';
  END IF;
  IF EXISTS (SELECT 1 FROM workout_plans WHERE relationship_id IN
      (SELECT relationship_id FROM coach_member_relationships WHERE class_id IN
      (SELECT class_id FROM demo_old_classes))) THEN
    RAISE EXCEPTION 'A workout plan references a BR141 class; cleanup stopped';
  END IF;
  IF EXISTS (SELECT 1 FROM point_credit_requests WHERE ledger_entry_id IN
      (SELECT ledger_entry_id FROM demo_old_ledger)) OR EXISTS
      (SELECT 1 FROM point_gifts WHERE ledger_entry_id IN
      (SELECT ledger_entry_id FROM demo_old_ledger)) THEN
    RAISE EXCEPTION 'A point gift/credit references BR141 ledger; cleanup stopped';
  END IF;
  IF EXISTS (SELECT 1 FROM point_wallets w JOIN
      (SELECT wallet_id,sum(available_delta) AS available_delta,
              sum(held_delta) AS held_delta FROM demo_old_ledger GROUP BY wallet_id) d
      ON d.wallet_id=w.wallet_id
      WHERE w.available_points-d.available_delta < 0
         OR w.held_points-d.held_delta < 0) THEN
    RAISE EXCEPTION 'Removing BR141 ledger would make a wallet negative; cleanup stopped';
  END IF;
END $$;

-- Reverse the selected ledger's effect before deleting its rows.
UPDATE point_wallets w SET
  available_points=w.available_points-d.available_delta,
  held_points=w.held_points-d.held_delta
FROM (SELECT wallet_id,sum(available_delta) AS available_delta,
             sum(held_delta) AS held_delta FROM demo_old_ledger GROUP BY wallet_id) d
WHERE w.wallet_id=d.wallet_id;

DELETE FROM class_session_reminders WHERE session_id IN (SELECT session_id FROM demo_old_sessions);
DELETE FROM class_session_change_requests WHERE session_id IN (SELECT session_id FROM demo_old_sessions)
  OR result_session_id IN (SELECT session_id FROM demo_old_sessions);
DELETE FROM attendances WHERE session_id IN (SELECT session_id FROM demo_old_sessions)
  OR enrollment_id IN (SELECT enrollment_id FROM enrollments WHERE class_id IN
      (SELECT class_id FROM demo_old_classes));
DELETE FROM class_teaching_records WHERE class_id IN (SELECT class_id FROM demo_old_classes);
DELETE FROM class_threshold_responses WHERE class_id IN (SELECT class_id FROM demo_old_classes)
  OR target_class_id IN (SELECT class_id FROM demo_old_classes);
DELETE FROM coach_member_relationships WHERE class_id IN (SELECT class_id FROM demo_old_classes);
DELETE FROM course_interest_subscriptions WHERE source_class_id IN (SELECT class_id FROM demo_old_classes);
DELETE FROM enrollments WHERE class_id IN (SELECT class_id FROM demo_old_classes);
DELETE FROM seat_holds WHERE class_id IN (SELECT class_id FROM demo_old_classes)
  OR invoice_id IN (SELECT invoice_id FROM demo_old_invoices);
DELETE FROM room_occupancies WHERE source_type=0 AND source_id IN (SELECT session_id FROM demo_old_sessions);
DELETE FROM coach_occupancies WHERE source_type=0 AND source_id IN (SELECT session_id FROM demo_old_sessions);
DELETE FROM class_sessions WHERE session_id IN (SELECT session_id FROM demo_old_sessions);
DELETE FROM class_schedule_rules WHERE class_id IN (SELECT class_id FROM demo_old_classes);

DELETE FROM verified_gateway_events WHERE payment_attempt_id IN (SELECT payment_attempt_id FROM demo_old_attempts);
DELETE FROM payment_adjustments WHERE invoice_id IN (SELECT invoice_id FROM demo_old_invoices)
  OR invoice_item_id IN (SELECT item_id FROM demo_old_items);
-- This is an explicitly scoped local fixture reset. The wallet effects were reversed above.
-- Disable only the append-only DELETE trigger inside this transaction, then restore it.
ALTER TABLE point_ledger_entries DISABLE TRIGGER point_ledger_append_only;
DELETE FROM point_ledger_entries WHERE ledger_entry_id IN (SELECT ledger_entry_id FROM demo_old_ledger);
ALTER TABLE point_ledger_entries ENABLE TRIGGER point_ledger_append_only;
DELETE FROM payments WHERE invoice_id IN (SELECT invoice_id FROM demo_old_invoices);
DELETE FROM payment_attempts WHERE payment_attempt_id IN (SELECT payment_attempt_id FROM demo_old_attempts);
DELETE FROM checkout_sessions WHERE checkout_session_id IN (SELECT checkout_session_id FROM demo_old_checkouts);
DELETE FROM invoice_items WHERE item_id IN (SELECT item_id FROM demo_old_items);
DELETE FROM invoices WHERE invoice_id IN (SELECT invoice_id FROM demo_old_invoices);
DELETE FROM classes WHERE class_id IN (SELECT class_id FROM demo_old_classes);

COMMIT;
