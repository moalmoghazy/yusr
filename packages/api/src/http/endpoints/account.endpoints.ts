/** Sign-in (phone OTP, Google, Apple), sessions, two-factor enrollment and the signed-in person's own data. */
import { DomainError } from '@yusr/core';
import { listQuerySchema, markNotificationsReadSchema, mfaCodeSchema, oauthSchema, otpRequestSchema, otpVerifySchema, refreshSchema } from '@yusr/core/schemas';
import { endpoint, header, reply } from '../endpoint';

const SIGN_IN_LIMIT = { name: 'auth:sign-in', limit: 30, windowSeconds: 900, by: 'ip' } as const;

export const accountEndpoints = [
  endpoint({
    id: 'auth.requestOtp',
    method: 'POST',
    path: '/auth/otp',
    version: '1',
    access: 'public',
    tag: 'Auth',
    summary: 'Send a 6-digit sign-in code by SMS/WhatsApp',
    description: 'Codes expire after 5 minutes and allow 5 attempts; a phone can ask again after 60 seconds (Retry-After on 429).',
    body: otpRequestSchema,
    status: 202,
    returns: '{ expiresInSeconds, resendInSeconds }',
    handle: ({ services, ctx, body }) => services.auth.requestOtp(body.phone, { ip: ctx.ip ?? null, locale: body.locale }),
  }),

  endpoint({
    id: 'auth.verifyOtp',
    method: 'POST',
    path: '/auth/otp/verify',
    version: '1',
    access: 'public',
    tag: 'Auth',
    summary: 'Exchange the code for a session (staff add their authenticator code)',
    body: otpVerifySchema,
    returns: 'Session',
    rateLimit: SIGN_IN_LIMIT,
    handle: ({ services, ctx, body, request }) => services.auth.verifyOtp({ ...body, userAgent: header(request, 'user-agent'), ip: ctx.ip ?? null }),
  }),

  endpoint({
    id: 'auth.oauth',
    method: 'POST',
    path: '/auth/oauth/:provider',
    version: '1',
    access: 'public',
    tag: 'Auth',
    summary: 'Sign in with a Google or Apple ID token',
    description: 'The token is verified against the provider keys (RS256, audience = our client IDs).',
    body: oauthSchema,
    returns: 'Session',
    rateLimit: SIGN_IN_LIMIT,
    handle: ({ services, params, body, request }) => {
      const provider = params['provider'];
      if (provider !== 'google' && provider !== 'apple') throw new DomainError('NOT_FOUND', 'Unknown sign-in provider');
      return services.auth.signInWithProvider(provider, { ...body, userAgent: header(request, 'user-agent') });
    },
  }),

  endpoint({
    id: 'auth.refresh',
    method: 'POST',
    path: '/auth/refresh',
    version: '1',
    access: 'public',
    tag: 'Auth',
    summary: 'Rotate the refresh token and get a new access token',
    description: 'Each refresh token works once. Presenting a used one revokes the whole login (SESSION_REVOKED).',
    body: refreshSchema,
    returns: 'Session',
    rateLimit: { name: 'auth:refresh', limit: 60, windowSeconds: 900, by: 'ip' },
    handle: ({ services, body, request }) => services.auth.refresh(body.refreshToken, header(request, 'user-agent')),
  }),

  endpoint({
    id: 'auth.logout',
    method: 'POST',
    path: '/auth/logout',
    version: '1',
    access: 'public',
    tag: 'Auth',
    summary: 'End this login on every device that shares it',
    body: refreshSchema,
    handle: async ({ services, body }) => {
      await services.auth.logout(body.refreshToken);
      return reply.empty();
    },
  }),

  endpoint({
    id: 'auth.enrollMfa',
    method: 'POST',
    path: '/auth/mfa/enroll',
    version: '1',
    access: 'user',
    tag: 'Auth',
    summary: 'Start authenticator-app enrollment (returns the secret and an otpauth:// link for the QR code)',
    returns: '{ secret, otpauthUri }',
    handle: ({ services, ctx }) => services.auth.enrollMfa(ctx.actor!),
  }),

  endpoint({
    id: 'auth.confirmMfa',
    method: 'POST',
    path: '/auth/mfa/confirm',
    version: '1',
    access: 'user',
    tag: 'Auth',
    summary: 'Confirm enrollment with a first code; staff permissions need it from then on',
    body: mfaCodeSchema,
    rateLimit: { name: 'auth:mfa', limit: 10, windowSeconds: 900, by: 'actor' },
    handle: async ({ services, ctx, body }) => {
      await services.auth.confirmMfa(ctx.actor!, body.code);
      return reply.empty();
    },
  }),

  endpoint({
    id: 'me.get',
    method: 'GET',
    path: '/me',
    version: '1',
    access: 'user',
    tag: 'Me',
    summary: 'The signed-in profile, with a verified identity for the support chat (Chatwoot)',
    returns: 'Profile',
    handle: ({ services, ctx }) => services.me.profile(ctx.actor),
  }),

  endpoint({
    id: 'me.donations',
    method: 'GET',
    path: '/me/donations',
    version: '1',
    access: 'user',
    tag: 'Me',
    summary: 'My donations and receipts',
    query: listQuerySchema,
    returns: 'DonationReceipt[]',
    handle: ({ services, ctx, query }) => services.donations.listForDonor(ctx.actor!, query.limit),
  }),

  endpoint({
    id: 'me.notifications',
    method: 'GET',
    path: '/me/notifications',
    version: '1',
    access: 'user',
    tag: 'Me',
    summary: 'Receipts, "case funded" and "money disbursed" updates',
    query: listQuerySchema,
    returns: 'DonorNotification[]',
    handle: ({ services, ctx, query }) => services.me.notifications(ctx.actor, query.limit),
  }),

  endpoint({
    id: 'me.markNotificationsRead',
    method: 'POST',
    path: '/me/notifications/read',
    version: '1',
    access: 'user',
    tag: 'Me',
    summary: 'Mark notifications as read',
    body: markNotificationsReadSchema,
    handle: async ({ services, ctx, body }) => {
      await services.me.markRead(ctx.actor, body.ids);
      return reply.empty();
    },
  }),
];
