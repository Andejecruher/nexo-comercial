import { describe, expect, it } from '@jest/globals';

import {
  type GhostLeader,
  partitionGhostsBySafety,
} from '../../../../../prisma/scripts/cleanup-ghost-leaders.logic';

describe('cleanup-ghost-leaders.logic', () => {
  const ghost = (overrides?: Partial<GhostLeader>): GhostLeader => ({
    id: 'ghost-1',
    sectionId: 'section-a',
    fullName: 'Ghost Leader',
    promovidoCount: 0,
    uploadRecordCount: 0,
    precampaignGoalCount: 0,
    ...overrides,
  });

  describe('partitionGhostsBySafety', () => {
    it('considers empty ghosts (zero dependents) safe to delete', () => {
      const ghosts = [ghost({ id: 'g1' })];
      const { safe, unsafe } = partitionGhostsBySafety(ghosts);

      expect(safe).toHaveLength(1);
      expect(safe[0].id).toBe('g1');
      expect(unsafe).toHaveLength(0);
    });

    it('flags ghosts with promovidos as unsafe', () => {
      const ghosts = [ghost({ id: 'g1', promovidoCount: 3 })];
      const { safe, unsafe } = partitionGhostsBySafety(ghosts);

      expect(safe).toHaveLength(0);
      expect(unsafe).toHaveLength(1);
      expect(unsafe[0].reason).toContain('promovidos');
    });

    it('flags ghosts with upload records as unsafe', () => {
      const ghosts = [ghost({ id: 'g1', uploadRecordCount: 1 })];
      const { safe, unsafe } = partitionGhostsBySafety(ghosts);

      expect(safe).toHaveLength(0);
      expect(unsafe).toHaveLength(1);
      expect(unsafe[0].reason).toContain('upload records');
    });

    it('flags ghosts with precampaign goals as unsafe', () => {
      const ghosts = [ghost({ id: 'g1', precampaignGoalCount: 2 })];
      const { safe, unsafe } = partitionGhostsBySafety(ghosts);

      expect(safe).toHaveLength(0);
      expect(unsafe).toHaveLength(1);
      expect(unsafe[0].reason).toContain('precampaign goals');
    });

    it('mixes safe and unsafe ghosts in one batch', () => {
      const ghosts = [
        ghost({ id: 'safe-1' }),
        ghost({ id: 'unsafe-1', promovidoCount: 1 }),
        ghost({ id: 'unsafe-2', uploadRecordCount: 1 }),
      ];
      const { safe, unsafe } = partitionGhostsBySafety(ghosts);

      expect(safe).toHaveLength(1);
      expect(safe[0].id).toBe('safe-1');
      expect(unsafe).toHaveLength(2);
      expect(unsafe.map((g) => g.id).sort()).toEqual(['unsafe-1', 'unsafe-2']);
    });
  });
});
