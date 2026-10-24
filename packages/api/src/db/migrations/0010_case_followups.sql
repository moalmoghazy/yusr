-- Follow-up after funding («متابعة ما بعد الصرف»). Donations reach the partner association directly and it
-- pays the institution; Yusr then checks, as an independent third party, that the help reached the
-- beneficiary, and keeps checking after the case closes. Each call or visit is logged here by staff with
-- cases:follow_up. The log is append-only, and only funded or closed cases take entries.
CREATE TABLE case_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases (id),
  kind text NOT NULL CHECK (kind IN ('partner_call', 'beneficiary_call', 'payee_check', 'field_visit')),
  outcome text NOT NULL CHECK (outcome IN ('confirmed', 'concern', 'unreachable')),
  note text NOT NULL CHECK (char_length(btrim(note)) BETWEEN 3 AND 1000),
  next_due_on date, -- when to check again; null when nothing more is planned
  recorded_by uuid NOT NULL REFERENCES users (id),
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX case_followups_case_idx ON case_followups (case_id, recorded_at DESC);

CREATE FUNCTION enforce_followup_case() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT status FROM cases WHERE id = NEW.case_id) NOT IN ('funded', 'closed') THEN
    RAISE EXCEPTION 'case % is not funded or closed', NEW.case_id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER case_followups_case_guard BEFORE INSERT ON case_followups FOR EACH ROW EXECUTE FUNCTION enforce_followup_case();
CREATE TRIGGER case_followups_append_only BEFORE UPDATE OR DELETE ON case_followups FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
