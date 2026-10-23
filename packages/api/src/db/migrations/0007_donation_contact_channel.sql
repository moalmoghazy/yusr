-- «طريقة التواصل المفضلة»: the channel a donor chose for every message about a gift (receipt, case
-- funded, payout proof, case closed). The contact itself stays in guest_contact, which now also holds
-- a signed-in donor's chosen number or address ({"name", "email" | "phone"}). Gifts made before the
-- question was asked keep NULL and are messaged as before (email first, else SMS/WhatsApp).
ALTER TABLE donations ADD COLUMN contact_channel text;

ALTER TABLE donations ADD CONSTRAINT donations_contact_channel CHECK (contact_channel IN ('whatsapp', 'email'));

-- The contact for the chosen channel is required: a WhatsApp number (E.164) or an email address.
ALTER TABLE donations ADD CONSTRAINT donations_contact_for_channel CHECK (
  contact_channel IS NULL
  OR (contact_channel = 'whatsapp' AND coalesce(guest_contact ->> 'phone', '') ~ '^\+[1-9][0-9]{7,14}$')
  OR (contact_channel = 'email' AND coalesce(guest_contact ->> 'email', '') LIKE '%_@_%')
);
