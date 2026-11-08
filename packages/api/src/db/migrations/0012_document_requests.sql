-- «اطلب الاطلاع على الوثائق». Public pages show case documents with personal details hidden, but donors
-- keep the full right to see them: anyone may ask from the case page, no account, with a WhatsApp number.
-- Staff with documents:share send the documents there as view-once images and mark the request.
-- The number is staff only: never on a public page and never in the audit log.
CREATE TABLE document_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases (id),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 80),
  whatsapp text NOT NULL CHECK (whatsapp ~ '^\+[1-9][0-9]{7,14}$'),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'sent', 'declined')),
  handled_by uuid REFERENCES users (id),
  handled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_requests_handled CHECK ((status = 'new') = (handled_at IS NULL))
);

CREATE INDEX document_requests_inbox_idx ON document_requests (created_at DESC);
-- One open request per number and case: asking again while one waits adds nothing.
CREATE UNIQUE INDEX document_requests_open_idx ON document_requests (case_id, whatsapp) WHERE status = 'new';
