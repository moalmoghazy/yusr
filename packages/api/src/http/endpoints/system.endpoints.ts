/** Probes, payment webhooks, and the development stand-ins (payment simulator, local object storage). */
import { createHash } from 'node:crypto';
import { DomainError, PAYMENT_PROVIDERS, fromMinor, type Currency, type PaymentProvider } from '@yusr/core';
import { z } from 'zod';
import type { Services } from '../../app.services';
import type { Bucket } from '../../documents/storage';
import { endpoint, header, reply } from '../endpoint';

const startedAt = Date.now();

export const systemEndpoints = [
  endpoint({
    id: 'health.live',
    method: 'GET',
    path: '/health',
    version: null,
    access: 'public',
    tag: 'System',
    summary: 'Liveness probe',
    returns: '{ status, release, uptimeSeconds, demo }',
    handle: async ({ services }) => ({
      status: 'ok',
      release: services.config.release,
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      demo: services.config.demo,
    }),
  }),

  endpoint({
    id: 'health.ready',
    method: 'GET',
    path: '/health/ready',
    version: null,
    access: 'public',
    tag: 'System',
    summary: 'Readiness probe: PostgreSQL and Redis reachable',
    returns: '{ status, database, cache }',
    handle: async ({ services }) => {
      const checks = await services.ready();
      const ok = checks.database && checks.cache;
      return reply.json(ok ? 200 : 503, { status: ok ? 'ok' : 'degraded', ...checks });
    },
  }),

  endpoint({
    id: 'webhooks.receive',
    method: 'POST',
    path: '/webhooks/:provider',
    version: '1',
    access: 'public',
    tag: 'Payments',
    summary: 'Payment notifications (Paymob, Fawry, Stripe, Moyasar)',
    description:
      'The signature is checked on the exact bytes before anything is read. Replays are acknowledged without being applied again; ' +
      'an amount or currency that differs from the order parks the donation for review instead of crediting it.',
    rawBody: true,
    rateLimit: { name: 'webhooks', limit: 600, windowSeconds: 60, by: 'ip' },
    returns: '{ received, status }',
    handle: async ({ services, params, request }) => {
      const provider = params['provider'] as PaymentProvider;
      if (!PAYMENT_PROVIDERS.includes(provider) || provider === 'instapay') throw new DomainError('NOT_FOUND', 'Unknown payment provider');
      const result = await services.donations.handleWebhook(provider, { rawBody: request.rawBody!, headers: request.headers, query: request.query });
      // 200 for duplicates and ignored events too, so providers stop retrying them.
      return { received: true, status: result.status };
    },
  }),
];

// ---------------------------------------------------------------------------- development only

/** The development stand-ins also serve a public demo (YUSR_DEMO, memory data only), never a real deployment. */
const standIns = (services: Services) => services.config.nodeEnv !== 'production' || services.config.demo;
const simulated = (services: Services) => services.config.payments.mode === 'simulated' && standIns(services);
const devStorage = (services: Services) => services.devStorage !== null && standIns(services);

const checkoutQuery = z.object({ provider: z.string(), return: z.url(), sig: z.string().min(16) });
const checkoutForm = z.object({ outcome: z.enum(['succeeded', 'failed']) });

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

function checkoutPage(input: { locale: 'ar' | 'en'; provider: string; amount: string; caseTitle: string; receipt: string; action: string; done: boolean }) {
  const ar = input.locale === 'ar';
  const text = ar
    ? {
        title: 'دفع تجريبي',
        lead: 'بيئة التطوير: لن تُخصم أي أموال.',
        pay: 'ادفع الآن',
        decline: 'رفض الدفع',
        done: 'تم التعامل مع هذا الدفع بالفعل.',
        back: 'العودة إلى يُسر',
      }
    : {
        title: 'Test checkout',
        lead: 'Development environment: no money moves.',
        pay: 'Pay now',
        decline: 'Decline',
        done: 'This payment was already handled.',
        back: 'Back to Yusr',
      };
  return `<!doctype html>
<html lang="${input.locale}" dir="${ar ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${text.title} · ${escapeHtml(input.provider)}</title>
<style>
:root{color-scheme:light dark;--p:#13725F;--g:#E0A42F;--bg:#F4F6F5;--card:#fff;--fg:#10201C;--mut:#5B6B66}
@media (prefers-color-scheme:dark){:root{--bg:#0B1513;--card:#13201D;--fg:#E7F0ED;--mut:#9DB0AA}}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--fg);font:16px/1.6 system-ui,"Segoe UI",Tahoma,sans-serif;padding:16px}
main{width:min(420px,100%);background:var(--card);border-radius:20px;padding:28px;box-shadow:0 12px 40px rgba(0,0,0,.08)}
.tag{display:inline-block;background:var(--g);color:#1F1300;border-radius:99px;padding:2px 10px;font-size:13px;font-weight:600}
h1{margin:12px 0 4px;font-size:22px} p{margin:0 0 16px;color:var(--mut)}
.amount{font-size:34px;font-weight:700;margin:8px 0;color:var(--fg)} .meta{font-size:14px;color:var(--mut)}
form{display:flex;gap:10px;margin-top:22px} button{flex:1;border:0;border-radius:12px;padding:12px;font:inherit;font-weight:600;cursor:pointer}
.pay{background:var(--p);color:#fff} .no{background:transparent;color:var(--fg);outline:1px solid var(--mut)} a{color:var(--p)}
</style></head><body><main>
<span class="tag">${escapeHtml(input.provider)} · ${text.title}</span>
<h1>${escapeHtml(input.caseTitle)}</h1><p>${text.lead}</p>
<div class="amount">${escapeHtml(input.amount)}</div><div class="meta">${escapeHtml(input.receipt)}</div>
${
  input.done
    ? `<p style="margin-top:20px">${text.done} <a href="${escapeHtml(input.action)}">${text.back}</a></p>`
    : `<form method="post" action="${escapeHtml(input.action)}"><button class="pay" name="outcome" value="succeeded">${text.pay}</button><button class="no" name="outcome" value="failed">${text.decline}</button></form>`
}
</main></body></html>`;
}

async function checkoutContext(services: Services, reference: string, query: z.infer<typeof checkoutQuery>) {
  const simulator = services.simulators.get(query.provider);
  if (!simulator || !simulator.verifyLink(reference, query.return, query.sig)) throw new DomainError('FORBIDDEN', 'This checkout link is not valid');
  const donation = await services.db.read.donations.byReceipt(reference);
  if (!donation) throw new DomainError('NOT_FOUND', 'Donation not found');
  const item = await services.db.read.cases.byId(donation.caseId);
  return { simulator, donation, caseTitle: item?.title[donation.locale] ?? '' };
}

const money = (amountMinor: number, currency: Currency, locale: 'ar' | 'en') =>
  new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en-US', { style: 'currency', currency }).format(fromMinor(amountMinor, currency));

/** A page that only posts back to itself and may only send the donor to the (signed) return URL. */
const pageSecurity = (returnUrl: string) => ({
  'content-security-policy': `default-src 'none'; style-src 'unsafe-inline'; form-action 'self' ${new URL(returnUrl).origin}; base-uri 'none'; frame-ancestors 'none'`,
  'referrer-policy': 'no-referrer',
});

export const devEndpoints = [
  endpoint({
    id: 'dev.checkout.page',
    method: 'GET',
    path: '/dev/checkout/:reference',
    version: '1',
    access: 'public',
    tag: 'Development',
    summary: 'Simulated hosted checkout (payment simulator mode only)',
    query: checkoutQuery,
    enabled: simulated,
    handle: async ({ services, params, query, request }) => {
      const reference = params['reference']!;
      const { donation, caseTitle } = await checkoutContext(services, reference, query);
      const open = ['pending', 'requires_action'].includes(donation.status);
      const self = `${request.path}?${new URLSearchParams(query)}`;
      return reply.html(
        checkoutPage({
          locale: donation.locale,
          provider: query.provider,
          amount: money(donation.chargedMinor, donation.currency, donation.locale),
          caseTitle,
          receipt: reference,
          action: open ? self : query.return,
          done: !open,
        }),
        pageSecurity(query.return),
      );
    },
  }),

  endpoint({
    id: 'dev.checkout.complete',
    method: 'POST',
    path: '/dev/checkout/:reference',
    version: '1',
    access: 'public',
    tag: 'Development',
    summary: 'Finish a simulated checkout: sends the signed webhook through the real pipeline, then returns the donor',
    query: checkoutQuery,
    body: checkoutForm,
    enabled: simulated,
    handle: async ({ services, params, query, body }) => {
      const reference = params['reference']!;
      const { simulator, donation } = await checkoutContext(services, reference, query);
      if (['pending', 'requires_action'].includes(donation.status)) {
        const event = simulator.completion({ reference, amountMinor: donation.chargedMinor, currency: donation.currency, outcome: body.outcome });
        await services.donations.handleWebhook(simulator.provider, { ...event, query: {} });
      }
      return reply.redirect(query.return, 303);
    },
  }),

  endpoint({
    id: 'dev.storage.put',
    method: 'PUT',
    path: '/dev-storage/:bucket/*key',
    version: null,
    access: 'public',
    tag: 'Development',
    summary: 'Local stand-in for a presigned S3/R2 upload (no object storage configured)',
    rawBody: true,
    enabled: devStorage,
    handle: async ({ services, params, request }) => {
      const storage = services.devStorage!;
      const bucket = params['bucket'] as Bucket;
      const key = params['key']!;
      if ((bucket !== 'private' && bucket !== 'public') || !storage.verify('PUT', bucket, key, request.query)) {
        throw new DomainError('FORBIDDEN', 'Upload link is invalid or expired');
      }
      const body = request.rawBody!;
      storage.put(bucket, key, header(request, 'content-type') ?? 'application/octet-stream', body);
      return reply.content('', 'text/plain', { etag: `"${createHash('md5').update(body).digest('hex')}"` });
    },
  }),

  endpoint({
    id: 'dev.storage.get',
    method: 'GET',
    path: '/dev-storage/:bucket/*key',
    version: null,
    access: 'public',
    tag: 'Development',
    summary: 'Local stand-in for a presigned S3/R2 download',
    enabled: devStorage,
    handle: async ({ services, params, request }) => {
      const storage = services.devStorage!;
      const bucket = params['bucket'] as Bucket;
      const key = params['key']!;
      if ((bucket !== 'private' && bucket !== 'public') || !storage.verify('GET', bucket, key, request.query)) {
        throw new DomainError('FORBIDDEN', 'Download link is invalid or expired');
      }
      const object = storage.get(bucket, key);
      if (!object) throw new DomainError('NOT_FOUND', 'No such object');
      return reply.content(
        object.body,
        object.contentType,
        bucket === 'private' ? { 'content-disposition': 'inline', 'x-content-type-options': 'nosniff' } : {},
      );
    },
  }),
];
