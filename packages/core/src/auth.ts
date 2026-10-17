/**
 * Sign-in contract shared by the API, the SDK and the apps.
 * Access tokens are short-lived JWTs; refresh tokens are opaque and rotate on every use.
 */
import type { Locale, Role } from './types';

/** Returned when a sign-in code is sent (SMS/WhatsApp). */
export interface OtpChallenge {
  expiresInSeconds: number;
  /** The same phone can ask for a new code after this many seconds. */
  resendInSeconds: number;
  /** Public demo only (YUSR_DEMO): the code itself, since no SMS is sent. Never set on a real deployment. */
  demoCode?: string;
}

export interface AuthUser {
  id: string;
  name: string;
  roles: Role[];
  locale: Locale;
  /** This session passed the authenticator-app check; staff permissions require it. */
  mfa: boolean;
  /** The account has an authenticator app enrolled. */
  mfaEnrolled: boolean;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  /** Access-token lifetime in seconds. */
  expiresIn: number;
  user: AuthUser;
}

export type SignInProvider = 'google' | 'apple';
