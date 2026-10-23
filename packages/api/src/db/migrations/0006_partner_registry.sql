-- The approved-partner registry. Yusr lists cases only from جمعيات أهلية it has approved, coordinated
-- with and signed a contract with; a content moderator adds each one after signature. Every partner
-- holds a «كود يُسر»: with its رقم الإشهار it lets anyone from the association submit a case, without a
-- donor account. The code is kept twice: as an HMAC (code_hash: compared in constant time, and unique)
-- and AES-256-GCM encrypted (code_cipher) so staff can read it again to hand it over. It is never public.
CREATE TABLE partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 3 AND 120),
  registration_number text NOT NULL UNIQUE CHECK (registration_number ~ '^[0-9A-Z/-]{1,40}$'), -- رقم الإشهار, normalized
  region text NOT NULL CHECK (region ~ '^[A-Z]{2}-[A-Z0-9]{1,3}$'),
  contract_signed_on date NOT NULL,
  contact_name text NOT NULL CHECK (char_length(btrim(contact_name)) BETWEEN 2 AND 80),
  contact_phone text NOT NULL CHECK (contact_phone ~ '^\+[1-9][0-9]{7,14}$'), -- staff only
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  suspended_at timestamptz,
  code_hash text NOT NULL UNIQUE CHECK (code_hash ~ '^[a-f0-9]{64}$'),
  code_cipher bytea NOT NULL,
  code_issued_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partners_suspended_at CHECK ((status = 'suspended') = (suspended_at IS NOT NULL))
);

-- A case names the registry entry it came from. Partners submit without an account, so the submitter
-- (and the uploader of its documents) may be the partner alone.
ALTER TABLE cases ADD COLUMN partner_id uuid REFERENCES partners (id);
CREATE INDEX cases_partner_idx ON cases (partner_id) WHERE partner_id IS NOT NULL;
ALTER TABLE cases ALTER COLUMN submitted_by DROP NOT NULL;
ALTER TABLE cases ADD CONSTRAINT cases_submitter_known CHECK (submitted_by IS NOT NULL OR partner_id IS NOT NULL);
ALTER TABLE cases ADD CONSTRAINT cases_partner_is_association CHECK (partner_id IS NULL OR submitter_relation = 'association');
ALTER TABLE case_documents ALTER COLUMN uploaded_by DROP NOT NULL;

-- New association cases must come from an active partner, and what the public sees of the partner
-- (name and رقم الإشهار) is taken from the registry, whatever the request said. Cases from before the
-- registry keep their free-text association.
CREATE FUNCTION enforce_case_partner() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  partner partners%ROWTYPE;
BEGIN
  IF NEW.submitter_relation <> 'association' THEN
    RETURN NEW;
  END IF;
  IF NEW.partner_id IS NULL THEN
    RAISE EXCEPTION 'association cases need a partner from the registry' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO partner FROM partners WHERE id = NEW.partner_id;
  IF partner.status <> 'active' THEN
    RAISE EXCEPTION 'partner % is suspended', partner.registration_number USING ERRCODE = 'check_violation';
  END IF;
  NEW.association := coalesce(NEW.association, '{}'::jsonb)
    || jsonb_build_object('name', partner.name, 'registrationNumber', partner.registration_number);
  RETURN NEW;
END $$;

CREATE TRIGGER cases_partner_guard BEFORE INSERT ON cases FOR EACH ROW EXECUTE FUNCTION enforce_case_partner();

-- A partner renamed (or its number corrected) in the registry is renamed on its cases too.
CREATE FUNCTION sync_partner_on_cases() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE cases
     SET association = association || jsonb_build_object('name', NEW.name, 'registrationNumber', NEW.registration_number)
   WHERE partner_id = NEW.id;
  RETURN NEW;
END $$;

CREATE TRIGGER partners_sync_cases AFTER UPDATE OF name, registration_number ON partners
  FOR EACH ROW WHEN (OLD.name IS DISTINCT FROM NEW.name OR OLD.registration_number IS DISTINCT FROM NEW.registration_number)
  EXECUTE FUNCTION sync_partner_on_cases();
