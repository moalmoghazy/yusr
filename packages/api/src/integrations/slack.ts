import type { FetchLike } from '../payments/gateway';
import { callJson } from '../payments/http';

/**
 * Slack incoming webhooks for the operations team:
 *  #field-ops   new cases and visit assignments
 *  #finance     payments that need review, approved payouts
 */
export class SlackNotifier {
  constructor(
    private readonly webhooks: { fieldOps?: string; finance?: string },
    private readonly fetchImpl: FetchLike = (input, init) => fetch(input, init),
  ) {}

  async post(channel: 'fieldOps' | 'finance', text: string, fields: Record<string, string> = {}): Promise<void> {
    const url = this.webhooks[channel];
    if (!url) return;
    const blocks: unknown[] = [{ type: 'section', text: { type: 'mrkdwn', text } }];
    const entries = Object.entries(fields);
    if (entries.length)
      blocks.push({ type: 'section', fields: entries.slice(0, 10).map(([label, value]) => ({ type: 'mrkdwn', text: `*${label}*\n${value}` })) });
    await callJson(this.fetchImpl, 'slack', url, { body: { text, blocks } }).catch(async (error: unknown) => {
      // Slack answers "ok" as plain text; only a non-2xx status is an error.
      if (error instanceof Error && /invalid JSON/.test(error.message)) return;
      throw error;
    });
  }
}
