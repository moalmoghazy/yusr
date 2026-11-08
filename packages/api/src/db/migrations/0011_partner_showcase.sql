-- «شركاء يُسر» on the home page: each approved partner can carry a logo, can be hidden from the row,
-- and can wear a small «جديد» badge. Staff with partners:manage set all three in the control hub.
-- Logos are small images (SVG, WebP, PNG or JPEG, up to 150 KB) stored in the row.
ALTER TABLE partners
  ADD COLUMN logo bytea CHECK (logo IS NULL OR octet_length(logo) BETWEEN 1 AND 153600),
  ADD COLUMN logo_type text CHECK (logo_type IN ('image/svg+xml', 'image/webp', 'image/png', 'image/jpeg')),
  ADD COLUMN logo_updated_at timestamptz,
  ADD COLUMN showcased boolean NOT NULL DEFAULT true,
  ADD COLUMN new_badge boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT partners_logo_complete CHECK ((logo IS NULL) = (logo_type IS NULL) AND (logo IS NULL) = (logo_updated_at IS NULL));
