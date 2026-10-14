-- Local audit visibility fixtures. These rows describe simulated operations only.
-- Replay-safe: deterministic IDs prevent duplicates; existing logs are untouched.
\set ON_ERROR_STOP on
BEGIN;
CREATE TEMP TABLE audit_demo_actors ON COMMIT DROP AS
SELECT spec.*, picked.user_id FROM (VALUES
  (1, 'SYSTEM_ADMINISTRATOR', 5, 'admin@sporthub.vn', 'UserAccount'),
  (2, 'CENTER_MANAGER', 1, 'manager@sporthub.vn', 'Sport'),
  (3, 'COACH', 2, 'coach.bongro@sporthub.vn', 'Class'),
  (4, 'RECEPTIONIST', 4, 'letan@sporthub.vn', 'Invoice'),
  (5, 'MEMBER', 3, 'an.member@sporthub.vn', 'ClassRegistration'),
  (6, 'SYSTEM', 5, 'admin@sporthub.vn', 'Class')
) spec(role_order, actor_role, role_id, preferred_email, target_entity)
LEFT JOIN LATERAL (
  SELECT u.user_id FROM user_accounts u WHERE u.role_id=spec.role_id
  ORDER BY (u.email=spec.preferred_email) DESC, (u.status=0) DESC, u.email LIMIT 1
) picked ON true;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM audit_demo_actors WHERE user_id IS NULL) THEN
    RAISE EXCEPTION 'Audit demo requires an existing account for each of the five account roles.';
  END IF;
END $$;
INSERT INTO audit_logs(audit_id,user_id,actor_role,action,target_entity,target_id,old_value,new_value,ip_address,"timestamp")
SELECT md5('sporthub-audit-role-demo-v1:'||a.actor_role||':'||e.event_order)::uuid,
  a.user_id,a.actor_role,e.action,a.target_entity,
  CASE WHEN a.target_entity='UserAccount' THEN a.user_id::text
    ELSE md5('sporthub-audit-role-demo-target:'||a.actor_role)::uuid::text END,
  CASE WHEN e.event_order=1 THEN NULL ELSE jsonb_build_object(
    'value',jsonb_build_object('targetName','AUDIT DEMO · '||a.actor_role,
      'name','AUDIT DEMO · '||a.actor_role,'description','Old demo description','status','ACTIVE'),
    'reason','[AUDIT DEMO] Simulated event for role visibility testing; no real operation.') END,
  CASE WHEN e.event_order=3 THEN NULL ELSE jsonb_build_object(
    'value',jsonb_build_object('targetName','AUDIT DEMO · '||a.actor_role,
      'name','AUDIT DEMO · '||a.actor_role,
      'description',CASE WHEN e.event_order=1 THEN 'Created demo record' ELSE NULL END,
      'status',CASE WHEN e.event_order=1 THEN 'ACTIVE' ELSE 'INACTIVE' END),
    'reason','[AUDIT DEMO] Simulated event for role visibility testing; no real operation.') END,
  CASE WHEN a.actor_role='SYSTEM' THEN '' ELSE '127.0.0.1' END,
  now() - make_interval(secs => a.role_order*10+e.event_order)
FROM audit_demo_actors a CROSS JOIN (VALUES
  (1,'CREATE_AUDIT_DEMO'),(2,'UPDATE_AUDIT_DEMO'),(3,'DELETE_AUDIT_DEMO')
) e(event_order,action)
ON CONFLICT (audit_id) DO NOTHING;
COMMIT;
SELECT actor_role,count(*) AS demo_logs FROM audit_logs
WHERE action IN ('CREATE_AUDIT_DEMO','UPDATE_AUDIT_DEMO','DELETE_AUDIT_DEMO')
GROUP BY actor_role ORDER BY actor_role;
