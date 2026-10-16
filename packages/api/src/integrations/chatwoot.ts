import { hmacHex } from '../common/crypto';

/**
 * Chatwoot live chat (web widget + mobile SDK). For signed-in users the API returns an
 * identifier hash so Chatwoot can trust who is chatting (HMAC identity validation),
 * and support agents see the conversation linked to the right donor.
 */
export function chatwootIdentity(userId: string, hmacToken: string | null): { identifier: string; identifierHash: string } | null {
  if (!hmacToken) return null;
  return { identifier: userId, identifierHash: hmacHex('sha256', hmacToken, userId) };
}
