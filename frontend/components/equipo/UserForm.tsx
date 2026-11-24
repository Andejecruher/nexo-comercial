'use client';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { PanelUserDto } from '@/lib/shared/admin-users-api';
import type { RoleDto } from '@/lib/shared/roles-permissions-api';
import { useEffect, useMemo, useState } from 'react';

interface UserFormProps {
  open: boolean;
  user?: PanelUserDto;
  roles: RoleDto[];
  canAssignRoles: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: {
    fullName: string;
    email?: string;
    password?: string;
    isActive: boolean;
    roleIds: string[];
  }) => Promise<{ success: boolean }>;
}

export function UserForm({
  open,
  user,
  roles,
  canAssignRoles,
  onOpenChange,
  onSubmit,
}: UserFormProps) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const isEditing = !!user;

  useEffect(() => {
    if (!open) return;
    setFullName(user?.fullName ?? '');
    setEmail(user?.email ?? '');
    setPassword('');
    setIsActive(user?.isActive ?? true);
    setRoleIds(user?.roles.map((role) => role.id) ?? []);
    setError(undefined);
  }, [open, user]);

  const title = isEditing ? 'Editar integrante' : 'Crear integrante';
  const availableRoles = useMemo(
    () => roles.filter((role) => role.slug !== 'super-admin'),
    [roles],
  );

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const cleanName = fullName.trim();
    const cleanEmail = email.trim().toLowerCase();
    if (cleanName.length < 2)
      return setError('El nombre completo debe tener al menos 2 caracteres.');
    if (!isEditing && !/^\S+@\S+\.\S+$/.test(cleanEmail))
      return setError('Ingresá un correo electrónico válido.');
    if (password.length > 0 && password.length < 8)
      return setError('La contraseña debe tener al menos 8 caracteres.');
    if (canAssignRoles && roleIds.length === 0)
      return setError('Seleccioná al menos un rol para dar acceso válido.');
    setSubmitting(true);
    const result = await onSubmit({
      fullName: cleanName,
      email: cleanEmail,
      password: password || undefined,
      isActive,
      roleIds,
    });
    setSubmitting(false);
    if (result.success) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Al crear el usuario, enviaremos mediante correo electrónico una invitación para
            configurar su acceso a Nexo Comercial.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-5" onSubmit={handleSubmit}>
          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="team-full-name">Nombre completo</Label>
              <Input
                id="team-full-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                minLength={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="team-email">Correo electrónico</Label>
              <Input
                id="team-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isEditing}
              />
              {isEditing && (
                <p className="text-xs text-muted-foreground">
                  El correo es la identidad de acceso y no es editable por este backend.
                </p>
              )}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="team-password">
                {isEditing ? 'Nueva contraseña (opcional)' : 'Contraseña inicial (opcional)'}
              </Label>
              <Input
                id="team-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
              />
              <p className="text-xs text-muted-foreground">
                Si se deja vacío al crear, el backend genera una credencial temporal interna y envía
                un enlace de activación.
              </p>
            </div>
            <label className="flex items-center gap-3 rounded-xl border p-4 text-sm">
              <Checkbox
                checked={isActive}
                onCheckedChange={(checked) => setIsActive(checked === true)}
              />
              <span>
                <strong>Cuenta activa</strong>
                <br />
                <span className="text-muted-foreground">
                  Si se desactiva, no podrá iniciar sesión.
                </span>
              </span>
            </label>
          </div>
          <div className="space-y-3">
            <Label>Roles</Label>
            <div className="grid max-h-52 gap-2 overflow-auto rounded-xl border p-3 sm:grid-cols-2">
              {availableRoles.map((role) => (
                <label
                  key={role.id}
                  className="flex items-start gap-3 rounded-lg p-2 hover:bg-muted/60"
                >
                  <Checkbox
                    disabled={!canAssignRoles}
                    checked={roleIds.includes(role.id)}
                    onCheckedChange={(checked) =>
                      setRoleIds((prev) =>
                        checked ? [...prev, role.id] : prev.filter((id) => id !== role.id),
                      )
                    }
                  />
                  <span className="text-sm">
                    <strong>{role.name}</strong>
                    <br />
                    <span className="text-muted-foreground">{role.description || role.slug}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
