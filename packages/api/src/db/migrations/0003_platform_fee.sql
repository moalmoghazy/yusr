-- Yusr's fee: 10% added on top of what the partner association asks for (VAT included). A case's
-- goal_minor is what donors are asked to give; platform_fee_minor is Yusr's part of it, and the
-- disbursement plan adds up to the rest. The fee leaves the case fund for revenue:platform_fees in
-- one 'platform_fee' journal entry when the case is fully funded. Older cases keep a fee of 0.
ALTER TABLE cases ADD COLUMN platform_fee_minor bigint NOT NULL DEFAULT 0;
ALTER TABLE cases ADD CONSTRAINT cases_platform_fee_range CHECK (platform_fee_minor >= 0 AND platform_fee_minor < goal_minor);

ALTER TYPE entry_kind ADD VALUE 'platform_fee';

-- The new enum value can't be used as a literal in this transaction, so compare its text.
ALTER TABLE journal_entries DROP CONSTRAINT journal_entries_source;
ALTER TABLE journal_entries ADD CONSTRAINT journal_entries_source CHECK (
  (kind = 'donation' AND donation_id IS NOT NULL) OR
  (kind = 'refund' AND refund_id IS NOT NULL) OR
  (kind = 'payout' AND payout_id IS NOT NULL) OR
  kind::text IN ('settlement', 'adjustment', 'platform_fee')
);

INSERT INTO ledger_accounts (code, type, currency) VALUES ('revenue:platform_fees', 'revenue', NULL);
