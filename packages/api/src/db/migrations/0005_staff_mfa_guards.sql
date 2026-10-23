-- Authenticator (TOTP) hardening for staff accounts.
--
-- totp_last_step: the 30-second step of the last authenticator code accepted, so a code seen over
-- someone's shoulder (or replayed from a log) cannot be used a second time within its window.
--
-- mfa_enrollment_expires_at: an enrollment a super admin opened for this person. Staff cannot add an
-- authenticator to their own account on their own (someone holding only their phone's SMS code could
-- otherwise attach an authenticator of their choosing); an administrator issues one with the
-- staff:create command, or opens a short enrollment window when granting a staff role in the hub.
ALTER TABLE users ADD COLUMN totp_last_step bigint;
ALTER TABLE users ADD COLUMN mfa_enrollment_expires_at timestamptz;
