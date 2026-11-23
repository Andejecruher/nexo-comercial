import { describe, expect, it } from '@jest/globals';

import {
  type LeaderInput,
  decideAutoAssign,
  findReassignmentCandidate,
} from '../../../../../prisma/scripts/backfill-coordinators-hierarchy.logic';

describe('backfill-coordinators-hierarchy.logic', () => {
  const legacyCoordinator = (overrides?: Partial<LeaderInput>): LeaderInput => ({
    id: 'legacy-1',
    sectionId: 'section-a',
    fullName: 'Legacy Coordinator',
    phone: '1234567890',
    email: 'legacy@example.com',
    role: 'COORDINADOR_SECCIONAL',
    isActive: true,
    promovidoCount: 2,
    ...overrides,
  });

  const nonCoordinator = (overrides?: Partial<LeaderInput>): LeaderInput => ({
    id: 'non-coord-1',
    sectionId: 'section-a',
    fullName: 'Non Coordinator',
    phone: null,
    email: null,
    role: 'PROMOTOR_BARRIO',
    isActive: true,
    promovidoCount: 0,
    ...overrides,
  });

  describe('findReassignmentCandidate', () => {
    it('returns the single same-section active non-coordinator leader', () => {
      const legacy = legacyCoordinator();
      const candidate = nonCoordinator({ id: 'candidate-1', fullName: 'Candidate One' });
      const result = findReassignmentCandidate(legacy, [legacy, candidate]);

      expect(result.kind).toBe('reassign');
      expect(result.candidateId).toBe('candidate-1');
      expect(result.candidateName).toBe('Candidate One');
    });

    it('returns "none" when no active non-coordinator leader exists', () => {
      const legacy = legacyCoordinator();
      const result = findReassignmentCandidate(legacy, [legacy]);

      expect(result.kind).toBe('ghost');
      expect(result.reason).toContain('no active non-coordinator leader');
    });

    it('returns "multiple" when more than one candidate exists', () => {
      const legacy = legacyCoordinator();
      const candidateA = nonCoordinator({ id: 'candidate-a' });
      const candidateB = nonCoordinator({ id: 'candidate-b' });
      const result = findReassignmentCandidate(legacy, [legacy, candidateA, candidateB]);

      expect(result.kind).toBe('ghost');
      expect(result.reason).toContain('multiple active non-coordinator leaders');
    });

    it('excludes inactive non-coordinator leaders', () => {
      const legacy = legacyCoordinator();
      const active = nonCoordinator({ id: 'active' });
      const inactive = nonCoordinator({ id: 'inactive', isActive: false });
      const result = findReassignmentCandidate(legacy, [legacy, active, inactive]);

      expect(result.kind).toBe('reassign');
      expect(result.candidateId).toBe('active');
    });
  });

  describe('decideAutoAssign', () => {
    it('auto-assigns when the section has exactly one coordinator', () => {
      const leader = nonCoordinator({ id: 'leader-1', coordinatorId: null });
      const result = decideAutoAssign([{ id: 'coord-1', sectionId: 'section-a' }], leader);

      expect(result.kind).toBe('auto_assign');
      expect(result.coordinatorId).toBe('coord-1');
    });

    it('records an issue when the section has no coordinators', () => {
      const leader = nonCoordinator({ id: 'leader-1', coordinatorId: null });
      const result = decideAutoAssign([], leader);

      expect(result.kind).toBe('issue');
      expect(result.reason).toContain('no coordinator');
    });

    it('records an issue when the section has multiple coordinators', () => {
      const leader = nonCoordinator({ id: 'leader-1', coordinatorId: null });
      const result = decideAutoAssign(
        [
          { id: 'coord-1', sectionId: 'section-a' },
          { id: 'coord-2', sectionId: 'section-a' },
        ],
        leader,
      );

      expect(result.kind).toBe('issue');
      expect(result.reason).toContain('multiple coordinators');
    });

    it('skips leaders that already have a coordinator', () => {
      const leader = nonCoordinator({ id: 'leader-1', coordinatorId: 'coord-existing' });
      const result = decideAutoAssign([{ id: 'coord-1', sectionId: 'section-a' }], leader);

      expect(result.kind).toBe('noop');
    });

    it('skips legacy coordinator roles', () => {
      const leader = legacyCoordinator({ id: 'legacy-1', coordinatorId: null });
      const result = decideAutoAssign([{ id: 'coord-1', sectionId: 'section-a' }], leader);

      expect(result.kind).toBe('noop');
    });
  });
});
