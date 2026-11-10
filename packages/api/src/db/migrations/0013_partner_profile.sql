-- A partner's card on the website: clicking it in «شركاء يُسر» opens its logo, «نبذة عن الجمعية» and
-- «عطاؤها». Staff with partners:manage write both texts (Arabic, optionally English) in the control hub
-- («شركاء الموقع»); the card shows as soon as it is saved. Null until written.
ALTER TABLE partners
  ADD COLUMN profile jsonb CHECK (profile IS NULL OR (jsonb_typeof(profile -> 'about') = 'object' AND jsonb_typeof(profile -> 'giving') = 'object'));
