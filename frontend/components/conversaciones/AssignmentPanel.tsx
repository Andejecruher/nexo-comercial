'use client';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { PanelUserDto } from '@/lib/shared/admin-users-api';
import type { Department } from '@/lib/shared/catalog-api';
import type { ConversationActionFlags } from '@/lib/shared/conversation-ui-actions';
import type { TransferTarget } from '@/lib/shared/conversations-api';
import { useState } from 'react';

interface AssignmentPanelProps {
  flags: ConversationActionFlags;
  isSupervisor: boolean;
  departments: Department[];
  panelUsers: PanelUserDto[];
  usersLoading: boolean;
  usersError: string | undefined;
  running: string | undefined;
  onAssignSelf: (departmentSlug?: string) => Promise<boolean>;
  onAssignUser: (userId: string, departmentSlug?: string) => Promise<boolean>;
  onTransfer: (target: TransferTarget) => Promise<boolean>;
}

export function AssignmentPanel({
  flags,
  isSupervisor,
  departments,
  panelUsers,
  usersLoading,
  usersError,
  running,
  onAssignSelf,
  onAssignUser,
  onTransfer,
}: AssignmentPanelProps) {
  const activeDepts = departments.filter((d) => d.isActive);

  if (!flags.canAssignSelf && !flags.canAssignOther && !flags.canTransfer) {
    return (
      <div className="rounded-2xl border bg-card p-4 text-sm text-muted-foreground">
        No tenés acciones de asignación o transferencia en este contexto.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border bg-card p-4 space-y-4">
      <h3 className="text-sm font-black tracking-tight">Asignación</h3>

      {flags.canAssignSelf && (
        <AssignSelfBlock activeDepts={activeDepts} running={running} onAssignSelf={onAssignSelf} />
      )}

      {flags.canAssignOther && isSupervisor && (
        <AssignOtherBlock
          activeDepts={activeDepts}
          panelUsers={panelUsers}
          usersLoading={usersLoading}
          usersError={usersError}
          running={running}
          onAssignUser={onAssignUser}
        />
      )}

      {flags.canTransfer && isSupervisor && (
        <TransferBlock
          activeDepts={activeDepts}
          panelUsers={panelUsers}
          usersLoading={usersLoading}
          usersError={usersError}
          running={running}
          onTransfer={onTransfer}
        />
      )}
    </div>
  );
}

function AssignSelfBlock({
  activeDepts,
  running,
  onAssignSelf,
}: {
  activeDepts: Department[];
  running: string | undefined;
  onAssignSelf: (departmentSlug?: string) => Promise<boolean>;
}) {
  const [dept, setDept] = useState<string | undefined>(undefined);
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Tomar conversación (asignarte)</p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Departamento (opcional)</Label>
          <Select
            value={dept ?? '__none__'}
            onValueChange={(v) => setDept(v === '__none__' ? undefined : v)}
          >
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Depto" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">—</SelectItem>
              {activeDepts.map((d) => (
                <SelectItem key={d.id} value={d.slug}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="button" disabled={!!running} onClick={() => void onAssignSelf(dept)}>
          {running === 'assign-self' ? 'Asignando…' : 'Asignarme'}
        </Button>
      </div>
    </div>
  );
}

function AssignOtherBlock({
  activeDepts,
  panelUsers,
  usersLoading,
  usersError,
  running,
  onAssignUser,
}: {
  activeDepts: Department[];
  panelUsers: PanelUserDto[];
  usersLoading: boolean;
  usersError: string | undefined;
  running: string | undefined;
  onAssignUser: (userId: string, departmentSlug?: string) => Promise<boolean>;
}) {
  const [dept, setDept] = useState<string | undefined>(undefined);
  const [userId, setUserId] = useState<string | undefined>(undefined);
  return (
    <div className="space-y-2 border-t pt-4">
      <p className="text-xs text-muted-foreground">Asignar a otro agente</p>
      {usersError && <p className="text-xs text-destructive">{usersError}</p>}
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Agente</Label>
          <Select
            value={userId ?? '__none__'}
            onValueChange={(v) => setUserId(v === '__none__' ? undefined : v)}
            disabled={usersLoading}
          >
            <SelectTrigger className="w-[260px]">
              <SelectValue placeholder={usersLoading ? 'Cargando usuarios…' : 'Elegí usuario'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Seleccionar…</SelectItem>
              {panelUsers
                .filter((u) => u.isActive)
                .map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {displayName(u)}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Departamento (opcional)</Label>
          <Select
            value={dept ?? '__none__'}
            onValueChange={(v) => setDept(v === '__none__' ? undefined : v)}
          >
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Depto" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">—</SelectItem>
              {activeDepts.map((d) => (
                <SelectItem key={d.id} value={d.slug}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          disabled={!!running || !userId}
          onClick={() => userId && void onAssignUser(userId, dept)}
        >
          {running === 'assign-user' ? 'Asignando…' : 'Asignar'}
        </Button>
      </div>
    </div>
  );
}

function TransferBlock({
  activeDepts,
  panelUsers,
  usersLoading,
  usersError,
  running,
  onTransfer,
}: {
  activeDepts: Department[];
  panelUsers: PanelUserDto[];
  usersLoading: boolean;
  usersError: string | undefined;
  running: string | undefined;
  onTransfer: (target: TransferTarget) => Promise<boolean>;
}) {
  const [dept, setDept] = useState<string | undefined>(undefined);
  const [userId, setUserId] = useState<string | undefined>(undefined);
  return (
    <div className="space-y-2 border-t pt-4">
      <p className="text-xs text-muted-foreground">Transferir a otro agente</p>
      {usersError && <p className="text-xs text-destructive">{usersError}</p>}
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Nuevo agente</Label>
          <Select
            value={userId ?? '__none__'}
            onValueChange={(v) => setUserId(v === '__none__' ? undefined : v)}
            disabled={usersLoading}
          >
            <SelectTrigger className="w-[260px]">
              <SelectValue placeholder={usersLoading ? 'Cargando usuarios…' : 'Elegí usuario'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Seleccionar…</SelectItem>
              {panelUsers
                .filter((u) => u.isActive)
                .map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {displayName(u)}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Departamento (opcional)</Label>
          <Select
            value={dept ?? '__none__'}
            onValueChange={(v) => setDept(v === '__none__' ? undefined : v)}
          >
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Depto" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">—</SelectItem>
              {activeDepts.map((d) => (
                <SelectItem key={d.id} value={d.slug}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          variant="secondary"
          disabled={!!running || !userId}
          onClick={() =>
            userId &&
            void onTransfer({
              type: 'agent',
              toUserId: userId,
              ...(dept ? { departmentSlug: dept } : {}),
            })
          }
        >
          {running === 'transfer' ? 'Transfiriendo…' : 'Transferir'}
        </Button>
      </div>
    </div>
  );
}

function displayName(u: PanelUserDto): string {
  const n = u.fullName?.trim();
  if (n) return n;
  return u.email;
}
