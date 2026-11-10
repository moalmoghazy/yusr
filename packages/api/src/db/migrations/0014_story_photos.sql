-- Real photos for «قصص نجاح» on the home page: one per closed case, uploaded by staff with cases:edit
-- (faces blurred before upload, shrunk to WebP or JPEG in the browser). A case without one shows the
-- illustrated scene instead. Kept apart from cases so the case row's rules stay untouched.
CREATE TABLE case_story_photos (
  case_id uuid PRIMARY KEY REFERENCES cases (id),
  photo bytea NOT NULL CHECK (octet_length(photo) BETWEEN 1 AND 460800),
  photo_type text NOT NULL CHECK (photo_type IN ('image/webp', 'image/jpeg')),
  uploaded_by uuid NOT NULL REFERENCES users (id),
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
