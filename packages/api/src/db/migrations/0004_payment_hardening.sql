-- Payment hardening.
--
-- 1. Paymob callbacks are matched to a donation through the Paymob order created with the checkout
--    (stored here when the checkout is created), never through the unsigned merchant reference.
ALTER TABLE payment_attempts ADD COLUMN provider_order_ref text;
CREATE UNIQUE INDEX payment_attempts_order_ref ON payment_attempts (provider, provider_order_ref) WHERE provider_order_ref IS NOT NULL;

-- 2. Refunds: 'sending' is taken under the row lock before the provider is called, so a refund is
--    sent at most once; the provider's reference is saved before the ledger entry, and a refund can
--    be posted only once.
ALTER TYPE refund_status ADD VALUE 'sending' AFTER 'approved';
CREATE UNIQUE INDEX journal_one_entry_per_refund ON journal_entries (refund_id) WHERE kind = 'refund';

-- 3. Payouts: whoever records the bank transfer is not the officer who requested it.
ALTER TABLE payouts ADD COLUMN paid_by uuid REFERENCES users (id);
ALTER TABLE payouts DROP CONSTRAINT payouts_four_eyes;
ALTER TABLE payouts ADD CONSTRAINT payouts_four_eyes CHECK (
  (approved_by IS NULL OR approved_by <> requested_by) AND (paid_by IS NULL OR paid_by <> requested_by)
);
