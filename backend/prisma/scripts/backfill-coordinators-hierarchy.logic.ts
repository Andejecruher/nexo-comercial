/**
 * Pure decision logic for the coordinators hierarchy backfill.
 *
 * Keeps DB I/O out of this module so every branch can be unit-tested
 * offline without a Prisma client.
 */

export interface LeaderInput {
  id: string;
  sectionId: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  role: string;
  isActive: boolean;
  coordinatorId?: string | null;
  promovidoCount: number;
}

export interface CoordinatorInput {
  id: string;
  sectionId: string;
}

export interface ReassignmentDecision {
  kind: 'reassign' | 'ghost';
  candidateId?: string;
  candidateName?: string;
  reason: string;
}

export interface AutoAssignDecision {
  kind: 'auto_assign' | 'issue' | 'noop';
  coordinatorId?: string;
  reason: string;
}

export interface AuditEntry {
  runId: string;
  step: string;
  kind: string;
  leaderId?: string;
  sectionId?: string;
  coordinatorId?: string;
  candidateIds?: string[];
  action?: string;
  status: string;
  reason?: string;
  payload?: Record<string, unknown>;
}

const LEGACY_COORDINATOR_ROLE = 'COORDINADOR_SECCIONAL';

/**
 * Selects the single active non-coordinator leader in the same section to
 * receive a legacy coordinator's promovidos.
 *
 * - Exactly one candidate → reassign to it.
 * - Zero candidates      → ghost the legacy coordinator (manual fix needed).
 * - Multiple candidates  → ghost the legacy coordinator (ambiguous).
 */
export function findReassignmentCandidate(
  legacyLeader: LeaderInput,
  sectionLeaders: LeaderInput[],
): ReassignmentDecision {
  const candidates = sectionLeaders.filter(
    (leader) =>
      leader.id !== legacyLeader.id &&
      leader.sectionId === legacyLeader.sectionId &&
      leader.role !== LEGACY_COORDINATOR_ROLE &&
      leader.isActive,
  );

  if (candidates.length === 1) {
    const candidate = candidates[0];
    return {
      kind: 'reassign',
      candidateId: candidate.id,
      candidateName: candidate.fullName,
      reason: `single candidate ${candidate.id}`,
    };
  }

  if (candidates.length === 0) {
    return {
      kind: 'ghost',
      reason: 'no active non-coordinator leader in section',
    };
  }

  return {
    kind: 'ghost',
    reason: `multiple active non-coordinator leaders in section (${candidates.length})`,
  };
}

/**
 * Decides whether a coordinator-less leader can be auto-assigned.
 *
 * Only active, non-legacy-coordinator leaders without a coordinator are
 * eligible. The section must contain exactly one coordinator.
 */
export function decideAutoAssign(
  sectionCoordinators: CoordinatorInput[],
  leader: LeaderInput,
): AutoAssignDecision {
  if (leader.role === LEGACY_COORDINATOR_ROLE || !leader.isActive) {
    return { kind: 'noop', reason: 'leader is a legacy coordinator or inactive' };
  }

  if (leader.coordinatorId) {
    return { kind: 'noop', reason: 'leader already has a coordinator' };
  }

  if (sectionCoordinators.length === 1) {
    return {
      kind: 'auto_assign',
      coordinatorId: sectionCoordinators[0].id,
      reason: 'section has exactly one coordinator',
    };
  }

  if (sectionCoordinators.length === 0) {
    return { kind: 'issue', reason: 'section has no coordinator' };
  }

  return {
    kind: 'issue',
    reason: `section has multiple coordinators (${sectionCoordinators.length})`,
  };
}

/**
 * Builds a JSONL-ready audit entry.
 */
export function buildAuditEntry(overrides: Omit<AuditEntry, 'status'> & Partial<AuditEntry>): AuditEntry {
  return {
    status: 'ok',
    ...overrides,
  };
}

/**
 * Serializes an audit entry as a single JSONL line.
 */
export function formatJsonl(entry: AuditEntry): string {
  return JSON.stringify(entry);
}
