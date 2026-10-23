-- One-time cleanup: delete member support requests whose data no longer matches the current rules.
-- Valid states: OPEN (unassigned, no owner), ASSIGNED / IN_PROGRESS (have an owner),
-- DONE / REJECTED (have an owner and a closed_at). Anything else, including the retired CLOSED
-- status, is removed together with its events, attachments and notifications.
-- Review the preview output first; the whole script runs in one transaction.
-- Run:  psql -f scripts/cleanup-support-requests.sql
\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE invalid_support_requests ON COMMIT DROP AS
SELECT request_id, status, assigned_to_user_id, closed_at
FROM member_support_requests
WHERE status NOT IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'DONE', 'REJECTED')
   OR (status = 'OPEN' AND assigned_to_user_id IS NOT NULL)
   OR (status IN ('ASSIGNED', 'IN_PROGRESS', 'DONE', 'REJECTED') AND assigned_to_user_id IS NULL)
   OR (status IN ('DONE', 'REJECTED') AND closed_at IS NULL)
   OR (status IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS') AND closed_at IS NOT NULL);

-- Preview of what will be deleted.
SELECT * FROM invalid_support_requests ORDER BY status;

DELETE FROM member_support_attachments
WHERE request_id IN (SELECT request_id FROM invalid_support_requests);
DELETE FROM member_support_events
WHERE request_id IN (SELECT request_id FROM invalid_support_requests);
DELETE FROM member_support_requests
WHERE request_id IN (SELECT request_id FROM invalid_support_requests);

COMMIT;
