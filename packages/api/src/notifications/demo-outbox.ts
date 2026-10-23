/**
 * «الرسائل المرسلة»: on demo data the hub lists the messages the platform sent or would have sent, so
 * the receipt, «اكتمل التمويل», payout and case-closed messages can be checked without any provider.
 * Super admins and content moderators only, with a two-factor session; recipients are always masked.
 */
import { canSeeSentMessages, DomainError, isStaff, type SentMessage } from '@yusr/core';
import type { RequestActor } from '../common/actor';
import type { DemoChannels } from './channels';

export function demoSentMessages(outbox: DemoChannels, actor: RequestActor | null, limit: number): SentMessage[] {
  if (!actor) throw new DomainError('UNAUTHENTICATED');
  if (!canSeeSentMessages(actor.roles)) throw new DomainError('FORBIDDEN', 'The demo outbox is for super admins and content moderators');
  if (isStaff(actor.roles) && !actor.mfa) throw new DomainError('FORBIDDEN', 'Staff actions require two-factor authentication', { mfaRequired: true });
  return outbox.history(limit);
}
