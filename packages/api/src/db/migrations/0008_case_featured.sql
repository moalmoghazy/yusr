-- «يحدث الآن»: content moderators choose which published cases the home page's live card shows.
-- NULL = not chosen; the timestamp orders the chosen cases (most recently chosen first).
ALTER TABLE cases ADD COLUMN featured_at timestamptz;

CREATE INDEX cases_featured_idx ON cases (featured_at DESC) WHERE featured_at IS NOT NULL;
