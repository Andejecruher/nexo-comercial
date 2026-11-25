'use client';

import { Badge } from '@/components/ui/badge';
import { TableStatusBadge } from '@/components/ui/table-status-badge';
import type { PanelInvitationDto, PanelInvitationStatus } from '@/lib/shared/admin-users-api';
import { Ban, Clock, MailCheck, MailWarning, MailX, Send, type LucideIcon } from 'lucide-react';

export function UserStatusBadge({ isActive }: { isActive: boolean }) {
  return <TableStatusBadge active={isActive} />;
}

const INVITATION_BADGES: Record<
  PanelInvitationStatus,
  { label: string; icon: LucideIcon; className: string }
> = {
  pending: {
    label: 'Pendiente',
    icon: MailWarning,
    className:
      'border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300',
  },
  sent: {
    label: 'Enviada',
    icon: Send,
    className: 'border-sky-300 bg-sky-50 text-sky-800 dark:bg-sky-950/30 dark:text-sky-300',
  },
  failed: {
    label: 'Fallida',
    icon: MailX,
    className:
      'border-destructive/40 bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-destructive',
  },
  accepted: {
    label: 'Aceptada',
    icon: MailCheck,
    className:
      'border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300',
  },
  expired: {
    label: 'Expirada',
    icon: Clock,
    className:
      'border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300',
  },
  revoked: { label: 'Revocada', icon: Ban, className: '' },
};

export function InvitationStatusBadge({ invitation }: { invitation?: PanelInvitationDto | null }) {
  const badge = invitation ? INVITATION_BADGES[invitation.status] : undefined;

  if (!badge) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        <MailX className="mr-1 h-3 w-3" />
        Sin invitación
      </Badge>
    );
  }

  const Icon = badge.icon;
  return (
    <Badge variant="outline" className={badge.className}>
      <Icon className="mr-1 h-3 w-3" />
      {badge.label}
    </Badge>
  );
}
