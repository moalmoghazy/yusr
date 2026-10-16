import type { DonationStatus } from '@yusr/core';
import type { SemanticColors } from '@yusr/theme';

/** Colours for a donation's status: settled, waiting (on the donor, the bank or finance), refunded, or not completed. */
export function statusColors(status: DonationStatus, colors: SemanticColors): { bg: string; fg: string } {
  if (status === 'succeeded') return { bg: colors.successSoft, fg: colors.successSoftForeground };
  if (status === 'pending' || status === 'requires_action' || status === 'awaiting_transfer' || status === 'needs_review') {
    return { bg: colors.warningSoft, fg: colors.warningSoftForeground };
  }
  if (status === 'refunded' || status === 'partially_refunded') return { bg: colors.infoSoft, fg: colors.infoSoftForeground };
  return { bg: colors.muted, fg: colors.mutedForeground };
}

/** Still moving: the receipt screen keeps checking for these. */
export const IN_FLIGHT: ReadonlySet<DonationStatus> = new Set<DonationStatus>(['pending', 'requires_action']);
