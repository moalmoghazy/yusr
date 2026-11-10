-- «قصص نجاح» edited from the hub's «قصص النجاح» page: the title, story and outcome the home page tells
-- for a closed case (instead of the case's own text), and whether it shows on the site at all. A closed
-- case without a row shows with its own text, as before.
CREATE TABLE case_stories (
  case_id uuid PRIMARY KEY REFERENCES cases (id),
  title jsonb NOT NULL,
  story jsonb NOT NULL,
  outcome jsonb NOT NULL,
  published boolean NOT NULL DEFAULT true,
  updated_by uuid NOT NULL REFERENCES users (id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
