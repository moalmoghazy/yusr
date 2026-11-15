-- «قسم المراجعة والتدقيق على العمل»: the super admin's verdicts on the team's work (a case, a field
-- verification, or a case's follow-up after payout). Append-only: a new verdict is a new row, so the
-- whole history of reviews stays.
CREATE TABLE oversight_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area text NOT NULL CHECK (area IN ('cases', 'verification', 'followups')),
  subject_id uuid NOT NULL, -- the case id, or the verification task id
  case_id uuid NOT NULL REFERENCES cases (id),
  verdict text NOT NULL CHECK (verdict IN ('approved', 'needs_action', 'escalated')),
  note text NOT NULL CHECK (char_length(note) <= 1000),
  reviewer_id uuid NOT NULL REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX oversight_reviews_subject_idx ON oversight_reviews (area, subject_id, created_at DESC);

CREATE TRIGGER oversight_reviews_append_only BEFORE UPDATE OR DELETE ON oversight_reviews FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
