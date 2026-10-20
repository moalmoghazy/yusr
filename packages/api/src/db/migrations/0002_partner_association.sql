-- Cases now come from partner associations: جمعيات أهلية registered with the Ministry of Social
-- Solidarity, which own the case, verify it in the field and receive its funds. A case records which
-- association submitted it (name, رقم الإشهار, and a contact person). Submissions by individuals
-- (self / family / volunteer) are paused on the website but stay valid here.
ALTER TABLE cases DROP CONSTRAINT IF EXISTS cases_submitter_relation_check;
ALTER TABLE cases ADD CONSTRAINT cases_submitter_relation_check
  CHECK (submitter_relation IN ('association', 'self', 'family', 'volunteer'));

ALTER TABLE cases ADD COLUMN association jsonb;

ALTER TABLE cases ADD CONSTRAINT cases_association_shape CHECK (
  association IS NULL OR (
    jsonb_typeof(association -> 'name') = 'string'
    AND jsonb_typeof(association -> 'registrationNumber') = 'string'
    AND jsonb_typeof(association -> 'contactName') = 'string'
    AND jsonb_typeof(association -> 'contactPhone') = 'string'
  )
);

ALTER TABLE cases ADD CONSTRAINT cases_association_when_partner CHECK (
  submitter_relation <> 'association' OR association IS NOT NULL
);
