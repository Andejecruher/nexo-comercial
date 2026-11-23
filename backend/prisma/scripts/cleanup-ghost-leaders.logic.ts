/**
 * Pure decision logic for the ghost-leader cleanup script.
 *
 * A ghost is a legacy COORDINADOR_SECCIONAL leader that was deactivated during
 * the backfill. It can only be deleted safely when it has no blocking
 * dependents (active promovidos, upload records, or precampaign goals).
 */

export interface GhostLeader {
  id: string;
  sectionId: string;
  fullName: string;
  promovidoCount: number;
  uploadRecordCount: number;
  precampaignGoalCount: number;
}

export interface GhostPartition {
  safe: GhostLeader[];
  unsafe: Array<GhostLeader & { reason: string }>;
}

/**
 * Splits ghost leaders into safe-to-delete and unsafe groups.
 *
 * Safety requires zero active promovidos AND zero upload records AND zero
 * precampaign goals. This respects the RESTRICT foreign keys on the leaders
 * table and avoids orphans.
 */
export function partitionGhostsBySafety(ghosts: GhostLeader[]): GhostPartition {
  const safe: GhostLeader[] = [];
  const unsafe: Array<GhostLeader & { reason: string }> = [];

  for (const ghost of ghosts) {
    const reasons: string[] = [];

    if (ghost.promovidoCount > 0) {
      reasons.push(`${ghost.promovidoCount} active promovidos`);
    }
    if (ghost.uploadRecordCount > 0) {
      reasons.push(`${ghost.uploadRecordCount} upload records`);
    }
    if (ghost.precampaignGoalCount > 0) {
      reasons.push(`${ghost.precampaignGoalCount} precampaign goals`);
    }

    if (reasons.length === 0) {
      safe.push(ghost);
    } else {
      unsafe.push({ ...ghost, reason: reasons.join('; ') });
    }
  }

  return { safe, unsafe };
}
