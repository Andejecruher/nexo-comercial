/**
 * Servicio de auditoría para acciones administrativas.
 *
 * El registro es append-only: NUNCA se modifican ni eliminan entradas.
 * Los errores al registrar auditoría son no-bloqueantes —
 * se loguean pero no interrumpen el flujo de la operación principal.
 */
import crypto from 'crypto';
import type { Request } from 'express';
import { AuditPrismaLike, AuditRepository } from '../repositories/audit.repository';

// ── Tipos ─────────────────────────────────────────────────────────────────────

/** Acciones auditables del panel admin */
export type AuditAction =
  | 'user.create'
  | 'user.update'
  | 'user.deactivate'
  | 'user.invitation.resend'
  | 'user.delete'
  | 'user.list'
  | 'role.assign'
  | 'role.remove'
  | 'role.create'
  | 'role.update'
  | 'role.delete'
  | 'role.permissions.replace'
  | 'role.permission.add'
  | 'role.permission.remove'
  | 'permission.create'
  | 'permission.update'
  | 'permission.activate'
  | 'permission.deactivate'
  | 'neighborhood.create'
  | 'neighborhood.update'
  | 'neighborhood.delete'
  | 'citizen.create'
  | 'citizen.update'
  | 'citizen.delete'
  | 'citizen.tag.assign'
  | 'citizen.tag.remove'
  | 'tag.create'
  | 'tag.update'
  | 'tag.delete'
  | 'department.create'
  | 'department.update'
  | 'department.deactivate'
  | 'auth.login'
  | 'auth.logout'
  | 'auth.logout_all'
  | 'auth.invitation.activate'
  | 'auth.password.reset'
  | 'conversation.list'
  | 'conversation.get'
  | 'conversation.assign'
  | 'conversation.transfer'
  | 'conversation.handover'
  | 'conversation.close'
  | 'conversation.reopen'
  | 'conversation.ensure_open'
  | 'conversation.read'
  | 'event.create'
  | 'event.update'
  | 'citizen.register_event'
  | 'citizen.checkin_event'
  | 'ine.upload.create'
  | 'ine.upload.retry'
  | 'ine.upload.review'
  | 'ine.promovido.confirm'
  | 'promovido.create'
  | 'promovido.update'
  | 'promovido.vigencia.change'
  | 'promovido.leader.change'
  | 'ine.catalog.state.update'
  | 'ine.catalog.state.deactivate'
  | 'ine.catalog.district.update'
  | 'ine.catalog.district.deactivate'
  | 'ine.catalog.section.update'
  | 'ine.catalog.section.deactivate'
  | 'ine.catalog.leader.update'
  | 'ine.catalog.leader.deactivate'
  | 'ine.catalog.leader.reinvite'
  | 'coordinator.create'
  | 'coordinator.update'
  | 'coordinator.delete'
  | 'coordinator.reinvite'
  | 'structure.create'
  | 'structure.update'
  | 'structure.delete';

export interface AuditEntry {
  actorId?: string | null;
  action: AuditAction;
  targetType: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}

// ── Helpers internos ──────────────────────────────────────────────────────────

/** Extrae IP del request considerando proxies (X-Forwarded-For) */
export function extractIp(req: Request): string | null {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    return first?.trim() ?? null;
  }
  return req.socket?.remoteAddress ?? null;
}

/** Extrae User-Agent del request */
export function extractUserAgent(req: Request): string | null {
  return req.headers['user-agent'] ?? null;
}

// ── Servicio ──────────────────────────────────────────────────────────────────

export class AuditService {
  private readonly repository: AuditRepository;

  constructor(repositoryOrPrisma: AuditRepository | AuditPrismaLike) {
    this.repository =
      repositoryOrPrisma instanceof AuditRepository
        ? repositoryOrPrisma
        : new AuditRepository(repositoryOrPrisma);
  }

  /**
   * Registra una acción de auditoría de forma no-bloqueante.
   * Si falla, loguea el error pero no lanza excepción.
   *
   * NOTA: Usa $executeRawUnsafe para ser agnóstico al Prisma Client generado.
   * Una vez regenerado el cliente (prisma generate), se puede migrar a
   * `this.prisma.auditLog.create(...)` para tipado completo.
   */
  async log(entry: AuditEntry): Promise<void> {
    try {
      const id = crypto.randomUUID();
      const metadata = JSON.stringify(entry.metadata ?? {});
      const now = new Date();

      await this.repository.insertAuditLog({
        id,
        actorId: entry.actorId ?? null,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId ?? null,
        metadataJson: metadata,
        ip: entry.ip ?? null,
        userAgent: entry.userAgent ?? null,
        createdAt: now,
      });
    } catch (err) {
      // Falla silenciosa — auditoría no debe interrumpir operaciones de negocio
      console.error('[AuditService] Error registrando auditoría:', err);
    }
  }

  /**
   * Helper de conveniencia: registra desde un Request de Express.
   * Extrae IP y User-Agent automáticamente.
   */
  async logFromRequest(req: Request, entry: Omit<AuditEntry, 'ip' | 'userAgent'>): Promise<void> {
    await this.log({
      ...entry,
      ip: extractIp(req),
      userAgent: extractUserAgent(req),
    });
  }
}
