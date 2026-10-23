-- Associations that want to join Yusr apply from the website («انضم كجمعية شريكة»), with no account.
-- Content moderators read the requests in the control hub, contact the association and mark each one;
-- an approved association is then added to the registry (partners) after the contract is signed.
-- The contact's phone and email are staff only.
CREATE TABLE partner_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 3 AND 120),
  registration_number text NOT NULL CHECK (registration_number ~ '^[0-9A-Z/-]{1,40}$'), -- رقم الإشهار, normalized
  region text NOT NULL CHECK (region ~ '^[A-Z]{2}-[A-Z0-9]{1,3}$'),
  contact_name text NOT NULL CHECK (char_length(btrim(contact_name)) BETWEEN 2 AND 80),
  contact_phone text NOT NULL CHECK (contact_phone ~ '^\+[1-9][0-9]{7,14}$'),
  contact_email text CHECK (contact_email IS NULL OR char_length(contact_email) <= 200),
  message text CHECK (message IS NULL OR char_length(message) <= 1000),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'approved', 'rejected')),
  handled_by uuid REFERENCES users (id),
  handled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_applications_handled CHECK ((status = 'new') = (handled_at IS NULL))
);

CREATE INDEX partner_applications_inbox_idx ON partner_applications (created_at DESC);
