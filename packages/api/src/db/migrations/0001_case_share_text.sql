-- A short, warm line written for sharing a case on social platforms («نص المشاركة»), in Arabic and
-- English: who the case helps and what the money completes, e.g. «تبرعك يقرّبنا من إنقاذ إيناس من
-- حروق الدرجة الثانية، وتقدر تساهم في اكتمال تكاليف علاجها». The platform appends its promise
-- («مع يُسر: تبرع آمن، موثوق، ويصل للمستحق»). Optional: without it the share line is composed from
-- the case title and category.
ALTER TABLE cases ADD COLUMN share_text jsonb;

ALTER TABLE cases ADD CONSTRAINT cases_share_text_shape CHECK (
  share_text IS NULL OR (jsonb_typeof(share_text -> 'ar') = 'string' AND jsonb_typeof(share_text -> 'en') = 'string')
);
